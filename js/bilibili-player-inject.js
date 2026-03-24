/**
 * Bilibili 嵌入播放器增强 (MAIN world content script)
 * 注入到 player.bilibili.com 页面的主世界中
 * v3.13.0:
 *   1. 拦截 window.open / 链接跳转（防倍速/画质点击打开新 tab）
 *   2. postMessage 双向通信：接收父页面的倍速/画质/进度指令，直接操控 <video>
 *   3. 画质探测：读取 window.__playinfo__ 和 window.player 内部 API
 *   4. 周期性上报播放状态（含当前画质）给父页面
 *   5. 自动请求最高可用画质（优先 1080P）、DOM 点击降级
 */
(function () {
    'use strict';

    const MSG_PREFIX = 'bili-ext-';
    let _video = null;
    let _reportTimer = null;
    let _qualitySent = false;

    // =============== 1. 跳转拦截 ===============

    const _origOpen = window.open;
    window.open = function (url, target, features) {
        if (url && typeof url === 'string' && /bilibili\.com/i.test(url)) {
            return null;
        }
        return _origOpen.call(window, url, target, features);
    };

    function neutralizeLinks(root) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('a[target="_blank"], a[target="_top"]').forEach(a => {
            a.removeAttribute('target');
            a.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
            }, { capture: true, once: false });
        });
    }

    const domObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type !== 'childList') continue;
            for (const node of m.addedNodes) {
                if (node.nodeType === 1) neutralizeLinks(node);
            }
        }
    });

    document.addEventListener('click', e => {
        const a = e.target.closest?.('a[href]');
        if (a && a.href && /bilibili\.com/i.test(a.href) &&
            (a.closest('.bilibili-player-video-top') || a.target === '_blank' || a.target === '_top')) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // =============== 2. 查找 <video> 元素 ===============

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

    // =============== 3. 画质探测与切换 ===============

    const QUALITY_MAP = {
        127: '8K', 126: '杜比视界', 125: 'HDR', 120: '4K',
        116: '1080P60', 112: '1080P+', 80: '1080P',
        74: '720P60', 64: '720P', 32: '480P', 16: '360P'
    };

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
                if (player?.getSupportedQualityList) {
                    info.available = player.getSupportedQualityList() || [];
                }
            } catch (_) {}
        }

        info.available.forEach(q => {
            if (!info.descriptions[q]) info.descriptions[q] = QUALITY_MAP[q] || String(q);
        });

        return info;
    }

    function setQuality(qn) {
        const player = window.player;
        if (!player) return false;

        if (typeof player.requestQuality === 'function') {
            try {
                const result = player.requestQuality(qn, null);
                if (result && typeof result.then === 'function') {
                    result.catch(() => {});
                }
                return true;
            } catch (_) {}
        }

        for (const method of ['setQuality', 'setPlaybackQuality']) {
            if (typeof player[method] === 'function') {
                try { player[method](qn); return true; } catch (_) {}
            }
        }

        try {
            const settingsPanel = document.querySelector('.bpx-player-ctrl-quality');
            if (settingsPanel) {
                const items = settingsPanel.querySelectorAll('.bpx-player-ctrl-quality-menu-item, .squirtle-quality-item, .bui-select-list-item');
                for (const item of items) {
                    const val = item.getAttribute('data-value') || item.getAttribute('data-quality');
                    if (parseInt(val) === qn) {
                        item.click();
                        return true;
                    }
                }
            }
        } catch (_) {}

        return false;
    }

    const PREFERRED_QUALITIES = [80, 64, 32];
    let _autoQualityAttempted = false;

    function autoSetBestQuality() {
        if (_autoQualityAttempted) return;
        const info = getQualityInfo();
        if (!info.available.length) return;

        if (info.current >= 80) {
            _autoQualityAttempted = true;
            return;
        }

        for (const qn of PREFERRED_QUALITIES) {
            if (info.available.includes(qn)) {
                _autoQualityAttempted = true;
                setQuality(qn);
                setTimeout(postQualityInfo, 2000);
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

    // =============== 4. postMessage 指令处理 ===============

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
                    const ok = setQuality(qn);
                    if (ok) setTimeout(() => postQualityInfo(), 1500);
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

    // =============== 5. 周期性上报 ===============

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

    // =============== 6. 初始化 ===============

    function init() {
        neutralizeLinks(document);
        domObserver.observe(document.documentElement || document.body, {
            childList: true, subtree: true
        });

        waitForVideo((video) => {
            startReporting(video);
            postState(video);
            setTimeout(() => { postQualityInfo(); autoSetBestQuality(); }, 3000);
            setTimeout(() => { postQualityInfo(); autoSetBestQuality(); }, 6000);
            setTimeout(() => { postQualityInfo(); autoSetBestQuality(); }, 10000);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
