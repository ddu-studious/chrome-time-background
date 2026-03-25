/**
 * Bilibili 播放器增强 (MAIN world content script)
 * 注入到 player.bilibili.com 和 www.bilibili.com/video/* 页面
 * v3.15.0:
 *   1. 完整版页面模式：在 iframe 中加载完整 B 站视频页面，注入全屏 CSS
 *   2. postMessage 双向通信：倍速/画质/进度控制
 *   3. 画质探测与切换：__playinfo__ → player API → DOM 点击
 *   4. 周期性上报播放状态
 *   5. 仅拦截播放器控件内的无意跳转
 */
(function () {
    'use strict';

    const MSG_PREFIX = 'bili-ext-';
    let _video = null;
    let _reportTimer = null;
    let _qualitySent = false;
    let _userQualityOverride = false;

    const IS_IFRAME = window !== window.top;
    const IS_FULL_PAGE = /www\.bilibili\.com\/(video|bangumi)/.test(location.hostname + location.pathname);
    const IS_EMBED_PLAYER = /player\.bilibili\.com/.test(location.hostname);

    // =============== 1. iframe 全屏模式（完整页面）===============

    if (IS_IFRAME && IS_FULL_PAGE) {
        const style = document.createElement('style');
        style.textContent = `
            #biliMainHeader, .bili-header, .bili-header-m,
            #bili-header-container, .bili-header__bar,
            .video-info-container, .video-toolbar-container,
            #comment, .comment-container, .reply-warp,
            .right-container, .right-container-inner,
            .bili-mini-mask, .bili-footer,
            #activity_vote, .ad-report, .vcd,
            .video-page-special-card-small,
            .login-panel-popover, #slide_ad,
            .pop-live-small-mode, .palette-button-outer,
            .storage-box, .fixed-sidenav-storage,
            .up-panel-container, .video-page-game-card-small,
            .video-page-card-small, .trending,
            .floor-single-card, .bili-dyn-card,
            .nav-search-content, .v-popover,
            .video-capture-toolbar,
            .bpx-player-video-info, .bpx-player-top-wrap,
            .bpx-player-toast-wrap .bpx-player-toast-item[data-type="quality"],
            .video-desc-container, .tag-panel,
            .video-share-popover, .van-popover {
                display: none !important;
            }

            html, body, #app, #__next {
                overflow: hidden !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: #000 !important;
            }

            .video-container-v1, .left-container,
            .video-container-v2, .main-container {
                width: 100vw !important;
                max-width: 100vw !important;
                padding: 0 !important;
                margin: 0 !important;
            }

            #playerWrap, #bilibili-player,
            .player-wrap, .bpx-player-primary-area {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 999 !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            .bpx-player-container {
                width: 100% !important;
                height: 100% !important;
            }

            .bpx-player-video-area {
                width: 100% !important;
                height: 100% !important;
            }
        `;

        if (document.head) {
            document.head.appendChild(style);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                (document.head || document.documentElement).appendChild(style);
            });
        }

        let _webFullscreenDone = false;

        function enterWebFullscreen() {
            if (_webFullscreenDone) return true;

            const player = window.player;
            if (player?.requestWebFullScreen) {
                try { player.requestWebFullScreen(); _webFullscreenDone = true; return true; } catch (_) {}
            }

            const WEB_FS_SELECTORS = [
                '.bpx-player-ctrl-web',
                '.bpx-player-ctrl-btn[aria-label="网页全屏"]',
                '.squirtle-video-pagefullscreen',
            ];
            for (const sel of WEB_FS_SELECTORS) {
                const btn = document.querySelector(sel);
                if (!btn) continue;
                const isEntered = btn.classList.contains('bpx-state-entered') ||
                                  btn.getAttribute('aria-label')?.includes('退出');
                if (!isEntered) {
                    btn.click();
                    _webFullscreenDone = true;
                    return true;
                } else {
                    _webFullscreenDone = true;
                    return true;
                }
            }
            return false;
        }

        function tryAutoWebFullscreen() {
            const delays = [2000, 4000, 6000, 8000, 12000];
            delays.forEach(ms => {
                setTimeout(() => {
                    if (!_webFullscreenDone) enterWebFullscreen();
                }, ms);
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryAutoWebFullscreen);
        } else {
            tryAutoWebFullscreen();
        }
    }

    // =============== 2. 跳转控制（仅拦截播放器控件内的无意跳转）===============

    const PLAYER_CTRL_SELECTORS = [
        '.bpx-player-ctrl-quality',
        '.bpx-player-ctrl-playbackrate',
        '.squirtle-quality-wrap',
        '.squirtle-speed-wrap',
        '.bilibili-player-video-quality',
        '.bilibili-player-video-time',
    ];

    function isPlayerControlClick(el) {
        return PLAYER_CTRL_SELECTORS.some(sel => el.closest?.(sel));
    }

    if (IS_IFRAME) {
        document.addEventListener('click', e => {
            const a = e.target.closest?.('a[href]');
            if (a && a.href && isPlayerControlClick(a)) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
    }

    // =============== 3. 查找 <video> 元素 ===============

    function findVideo() {
        if (_video && document.contains(_video)) return _video;
        _video = document.querySelector('video') ||
                 document.querySelector('bwp-video');
        return _video;
    }

    function waitForVideo(callback, maxTries = 60) {
        let tries = 0;
        const check = () => {
            const v = findVideo();
            if (v) { callback(v); return; }
            if (++tries < maxTries) setTimeout(check, 500);
        };
        check();
    }

    // =============== 4. 画质探测与切换 ===============

    const QUALITY_MAP = {
        127: '8K', 126: '杜比视界', 125: 'HDR', 120: '4K',
        116: '1080P60', 112: '1080P+', 80: '1080P',
        74: '720P60', 64: '720P', 32: '480P', 16: '360P'
    };

    const QUALITY_LABEL_TO_QN = {
        '8K': 127, '杜比视界': 126, 'HDR': 125, '4K': 120,
        '1080P60': 116, '1080P 高码率': 112, '1080P+': 112,
        '1080P 高清': 80, '1080P': 80,
        '720P 高清': 64, '720P60': 74, '720P': 64,
        '480P 清晰': 32, '480P': 32,
        '360P 流畅': 16, '360P': 16,
    };

    function getQualityFromDOM() {
        const info = { available: [], current: 0, descriptions: {} };

        const qualitySelectors = [
            '.bpx-player-ctrl-quality-menu .bpx-player-ctrl-quality-menu-item',
            '.squirtle-quality-wrap .squirtle-quality-item',
            '.bui-select-list .bui-select-list-item',
            '.bilibili-player-video-quality-menu li',
            '.bpx-player-ctrl-quality .bpx-player-ctrl-quality-menu-item',
        ];

        for (const selector of qualitySelectors) {
            const items = document.querySelectorAll(selector);
            if (!items.length) continue;

            items.forEach(item => {
                const val = item.getAttribute('data-value') || item.getAttribute('data-quality');
                const text = item.textContent?.trim().replace(/大会员|登录|试看/g, '').trim() || '';
                const qn = parseInt(val) || QUALITY_LABEL_TO_QN[text] || 0;
                if (qn > 0 && !info.available.includes(qn)) {
                    info.available.push(qn);
                    info.descriptions[qn] = text || QUALITY_MAP[qn] || String(qn);
                }
                if (item.classList.contains('bpx-state-active') || item.classList.contains('active') ||
                    item.classList.contains('bui-select-item-active') || item.getAttribute('aria-checked') === 'true') {
                    info.current = qn;
                }
            });
            if (info.available.length) break;
        }

        if (!info.current) {
            const currentLabel = document.querySelector(
                '.bpx-player-ctrl-quality-result, .squirtle-quality-text, .bilibili-player-video-quality-text, .bpx-player-ctrl-quality .bpx-player-ctrl-btn-text'
            );
            if (currentLabel) {
                const text = currentLabel.textContent?.trim().replace(/大会员|登录|试看/g, '').trim() || '';
                const match = text.match(/(\d+P)/);
                if (match) {
                    for (const [label, qn] of Object.entries(QUALITY_LABEL_TO_QN)) {
                        if (label.includes(match[1])) { info.current = qn; break; }
                    }
                }
            }
        }

        info.available.sort((a, b) => b - a);
        return info;
    }

    function getQualityInfo() {
        const info = { available: [], current: 0, descriptions: {} };

        try {
            const pi = window.__playinfo__;
            if (pi?.data) {
                info.available = pi.data.accept_quality || [];
                const descs = pi.data.accept_description || [];
                info.available.forEach((q, i) => {
                    info.descriptions[q] = descs[i] || QUALITY_MAP[q] || String(q);
                });
                const videoInfo = pi.data.dash?.video?.[0] || pi.data.durl?.[0];
                info.current = pi.data.quality || videoInfo?.id || 0;
            }
        } catch (_) {}

        if (!info.available.length) {
            try {
                const player = window.player;
                if (player?.getQualityList) {
                    info.available = player.getQualityList() || [];
                } else if (player?.getSupportedQualityList) {
                    info.available = player.getSupportedQualityList() || [];
                }
                if (player?.getQuality) info.current = player.getQuality() || info.current;
            } catch (_) {}
        }

        if (!info.available.length) {
            const domInfo = getQualityFromDOM();
            if (domInfo.available.length) {
                info.available = domInfo.available;
                info.descriptions = domInfo.descriptions;
                if (domInfo.current) info.current = domInfo.current;
            }
        }

        info.available.forEach(q => {
            if (!info.descriptions[q]) info.descriptions[q] = QUALITY_MAP[q] || String(q);
        });

        return info;
    }

    function setQualityViaDOM(qn) {
        const qualityTriggers = [
            '.bpx-player-ctrl-quality',
            '.squirtle-quality-wrap',
            '.bilibili-player-video-quality',
        ];

        for (const triggerSel of qualityTriggers) {
            const trigger = document.querySelector(triggerSel);
            if (!trigger) continue;
            trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            trigger.click?.();
        }

        return new Promise(resolve => {
            setTimeout(() => {
                const itemSelectors = [
                    '.bpx-player-ctrl-quality-menu-item',
                    '.squirtle-quality-item',
                    '.bui-select-list-item',
                    '.bilibili-player-video-quality-menu li',
                ];

                for (const sel of itemSelectors) {
                    const items = document.querySelectorAll(sel);
                    for (const item of items) {
                        const val = parseInt(item.getAttribute('data-value') || item.getAttribute('data-quality') || '0');
                        const text = item.textContent?.trim().replace(/大会员|登录|试看/g, '').trim() || '';
                        const labelQn = QUALITY_LABEL_TO_QN[text] || 0;

                        if (val === qn || labelQn === qn) {
                            item.click();
                            resolve(true);
                            return;
                        }
                    }
                }
                resolve(false);
            }, 300);
        });
    }

    function setQuality(qn) {
        const player = window.player;

        if (player) {
            if (typeof player.requestQuality === 'function') {
                try {
                    const result = player.requestQuality(qn, null);
                    if (result && typeof result.then === 'function') {
                        result.catch(() => {});
                    }
                    setTimeout(() => postQualityInfo(), 2000);
                    return true;
                } catch (_) {}
            }

            for (const method of ['setQuality', 'setPlaybackQuality', 'switchQuality']) {
                if (typeof player[method] === 'function') {
                    try { player[method](qn); setTimeout(() => postQualityInfo(), 2000); return true; } catch (_) {}
                }
            }
        }

        setQualityViaDOM(qn).then(ok => {
            if (ok) setTimeout(() => postQualityInfo(), 1500);
        });
        return true;
    }

    const PREFERRED_QUALITIES = [80, 64, 32];
    let _autoQualityAttempted = false;
    let _autoQualityRetries = 0;

    function autoSetBestQuality() {
        if (_userQualityOverride) return;
        if (_autoQualityAttempted) return;
        const info = getQualityInfo();
        if (!info.available.length) {
            _autoQualityRetries++;
            if (_autoQualityRetries >= 3) _autoQualityAttempted = true;
            return;
        }
        if (info.current >= 80) {
            _autoQualityAttempted = true;
            return;
        }
        for (const qn of PREFERRED_QUALITIES) {
            if (info.available.includes(qn)) {
                _autoQualityAttempted = true;
                setQuality(qn);
                return;
            }
        }
        _autoQualityAttempted = true;
    }

    function postQualityInfo() {
        const info = getQualityInfo();
        if (!info.available.length) return;
        try {
            window.parent.postMessage({
                type: MSG_PREFIX + 'quality-info',
                available: info.available,
                current: info.current,
                descriptions: info.descriptions,
            }, '*');
            _qualitySent = true;
        } catch (_) {}
    }

    // =============== 5. postMessage 指令处理 ===============

    window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        const { type } = e.data;
        if (!type || !type.startsWith(MSG_PREFIX)) return;

        const cmd = type.slice(MSG_PREFIX.length);
        const video = findVideo();

        switch (cmd) {
            case 'set-speed': {
                const speed = parseFloat(e.data.speed);
                if (video && speed > 0 && speed <= 16) {
                    video.playbackRate = speed;
                    postState(video);
                }
                break;
            }
            case 'set-quality': {
                const qn = parseInt(e.data.quality);
                if (qn > 0) {
                    _userQualityOverride = true;
                    _autoQualityAttempted = true;
                    setQuality(qn);
                }
                break;
            }
            case 'get-state': {
                if (video) postState(video);
                postQualityInfo();
                break;
            }
            case 'get-quality': {
                postQualityInfo();
                break;
            }
            case 'seek': {
                const time = parseFloat(e.data.time);
                if (video && isFinite(time) && time >= 0) {
                    video.currentTime = Math.min(time, video.duration || Infinity);
                }
                break;
            }
            case 'toggle-play': {
                if (video) {
                    video.paused ? video.play() : video.pause();
                    setTimeout(() => postState(video), 100);
                }
                break;
            }
            case 'set-volume': {
                const vol = parseFloat(e.data.volume);
                if (video && isFinite(vol)) {
                    video.volume = Math.max(0, Math.min(1, vol));
                    video.muted = false;
                    postState(video);
                }
                break;
            }
            case 'toggle-mute': {
                if (video) {
                    video.muted = !video.muted;
                    postState(video);
                }
                break;
            }
        }
    });

    function postState(video) {
        if (!video) return;
        try {
            window.parent.postMessage({
                type: MSG_PREFIX + 'state',
                speed: video.playbackRate || 1,
                currentTime: video.currentTime || 0,
                duration: video.duration || 0,
                paused: video.paused,
                volume: video.volume,
                muted: video.muted,
            }, '*');
        } catch (_) {}
    }

    // =============== 6. 周期性上报 ===============

    function startReporting(video) {
        if (_reportTimer) clearInterval(_reportTimer);
        _reportTimer = setInterval(() => {
            if (!document.contains(video)) {
                const v = findVideo();
                if (!v) { clearInterval(_reportTimer); return; }
                video = v;
            }
            postState(video);
            if (!_qualitySent) postQualityInfo();
            if (!_autoQualityAttempted) autoSetBestQuality();
        }, 2000);

        video.addEventListener('ratechange', () => postState(video));
        video.addEventListener('play', () => postState(video));
        video.addEventListener('pause', () => postState(video));
        video.addEventListener('volumechange', () => postState(video));
    }

    // =============== 7. 初始化 ===============

    function init() {
        waitForVideo((video) => {
            startReporting(video);
            postState(video);
            const delays = IS_FULL_PAGE ? [3000, 6000, 10000, 15000, 20000] : [3000, 6000, 10000, 15000];
            delays.forEach(ms => {
                setTimeout(() => { postQualityInfo(); autoSetBestQuality(); }, ms);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
