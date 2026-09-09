(function () {
    'use strict';

    const STORAGE_KEYS = Object.freeze({
        queue: 'youtubeLocalQueue',
        learning: 'youtubeLearningList',
        history: 'youtubeWatchHistory',
        settings: 'youtubeSettings',
    });
    const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
    const VIEWS = new Set(['recommended', 'trending', 'subscriptions', 'playlists', 'likes', 'history', 'local-queue', 'learning']);
    const LAYOUTS = new Set(['grid', 'list']);
    const TREND_CATEGORIES = Object.freeze([
        { id: 'culture', label: '文化', icon: 'fas fa-landmark', queries: {
            sinosphere: '中华文化|中華文化|中国历史|中國歷史|国学|國學|非遗|非遺|传统文化|傳統文化 -shorts',
            western: 'European culture|American culture|Western history|Western civilization -shorts',
            panAsia: 'Japanese culture|Korean culture|Southeast Asian culture|Indian culture -shorts',
        } },
        { id: 'travel', label: '旅游', icon: 'fas fa-plane-departure', queries: {
            sinosphere: '中国旅游|中國旅遊|中文旅行|旅游攻略|旅遊攻略|城市漫游|城市漫遊|人文地理 -shorts',
            western: 'Europe travel|USA travel|European cities|American road trip -shorts',
            panAsia: 'Japan travel|Korea travel|Southeast Asia travel|India travel -shorts',
        } },
        { id: '28', label: '科学与技术', icon: 'fas fa-microchip', queries: {
            sinosphere: '中国科技|中國科技|中文科技|人工智能|AI科技|编程|程式設計 -shorts',
            western: 'US technology|European technology|Silicon Valley|Western AI -shorts',
            panAsia: 'Japan technology|Korea technology|India technology|Singapore technology -shorts',
        } },
        { id: '27', label: '教育', icon: 'fas fa-graduation-cap', queries: {
            sinosphere: '中文教育|中文教程|公开课|公開課|知识|知識|学习|學習 -shorts',
            western: 'Harvard lecture|MIT course|European university lecture|Western education -shorts',
            panAsia: 'Japan education|Korea education|India education|Singapore education -shorts',
        } },
        { id: '24', label: '娱乐', icon: 'fas fa-film', queries: {
            sinosphere: '华语娱乐|華語娛樂|中文纪录片|中文紀錄片|相声|相聲|影视评论|影視評論 -shorts',
            western: 'European cinema|Hollywood analysis|American documentary|British comedy -shorts',
            panAsia: 'Japanese entertainment|Korean entertainment|Indian cinema|Southeast Asia documentary -shorts',
        } },
        { id: '20', label: '游戏', icon: 'fas fa-gamepad', queries: {
            sinosphere: '国产游戏|國產遊戲|中文游戏|中文遊戲|游戏实况|遊戲實況|游戏评测|遊戲評測 -shorts',
            western: 'Western games|European games|American gaming|indie game review -shorts',
            panAsia: 'Japanese games|Korean games|Indian gaming|Southeast Asia gaming -shorts',
        } },
        { id: '10', label: '音乐', icon: 'fas fa-music', queries: {
            sinosphere: '华语音乐|華語音樂|国风音乐|國風音樂|民乐|民樂|中文演唱会|中文演唱會 -shorts',
            western: 'European music|American music|classical concert|jazz live -shorts',
            panAsia: 'Japanese music|Korean music|Indian music|Southeast Asian music -shorts',
        } },
        { id: '17', label: '体育', icon: 'fas fa-running', queries: {
            sinosphere: '中国体育|中國體育|中文体育|中文體育|乒乓球|CBA|中超 -shorts',
            western: 'European football|NBA|NFL|Western sports -shorts',
            panAsia: 'Japan sports|Korea sports|India cricket|Southeast Asia sports -shorts',
        } },
    ]);
    const TREND_CIRCLES = Object.freeze([
        { id: 'sinosphere', label: '中华文化圈', target: 8, relevanceLanguage: 'zh-Hans' },
        { id: 'western', label: '欧美', target: 6, relevanceLanguage: 'en' },
        { id: 'panAsia', label: '泛亚', target: 6, relevanceLanguage: '' },
    ]);
    const DEFAULT_TREND_CATEGORY_ID = 'culture';
    const TREND_PREFERENCE_VERSION = 2;
    const RECOMMENDATION_CHANNEL_LIMIT = 12;
    const SHORTS_MAX_DURATION_SECONDS = 3 * 60;
    const TREND_LOOKBACK_DAYS = 90;
    const TREND_CACHE_TTL_MS = 15 * 60 * 1000;
    const TREND_STRONG_MIN_VIEWS = 10_000;
    const TREND_STRONG_MIN_LIKES = 100;
    const TREND_RELAXED_MIN_VIEWS = 1_000;
    const TREND_MAX_PER_CHANNEL = 2;
    const AUTH_MESSAGE_TIMEOUT_MS = 60_000;
    const YOUTUBE_PLAYER_ORIGIN = 'https://www.youtube.com';
    const DEFAULT_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
    const AUTO_PLAYBACK_RATE = 2;
    const WATCH_HISTORY_LIMIT = 100;

    function escapeHtml(value = '') {
        return String(value).replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
        })[character]);
    }

    function parseYouTubeVideoId(input = '') {
        const raw = String(input).trim();
        if (VIDEO_ID_PATTERN.test(raw)) return raw;
        try {
            const url = new URL(raw);
            const host = url.hostname.replace(/^www\./, '');
            let candidate = '';
            if (host === 'youtu.be') candidate = url.pathname.split('/').filter(Boolean)[0] || '';
            if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
                candidate = url.searchParams.get('v') || '';
                if (!candidate) {
                    const segments = url.pathname.split('/').filter(Boolean);
                    if (['shorts', 'embed', 'live'].includes(segments[0])) candidate = segments[1] || '';
                }
            }
            return VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
        } catch {
            return null;
        }
    }

    function extractYouTubeVideoId(item = {}) {
        const candidates = [
            item.contentDetails?.videoId,
            item.snippet?.resourceId?.videoId,
            item.id?.videoId,
            typeof item.id === 'string' ? item.id : '',
        ];
        return candidates.find(candidate => VIDEO_ID_PATTERN.test(String(candidate || ''))) || '';
    }

    function normalizeYouTubeChannelUrl(input = '') {
        try {
            const url = new URL(String(input));
            const host = url.hostname.replace(/^www\./, '');
            const segments = url.pathname.split('/').filter(Boolean);
            const isChannelPath = segments[0]?.startsWith('@') || ['channel', 'c', 'user'].includes(segments[0]);
            if (url.protocol !== 'https:' || host !== 'youtube.com' || !isChannelPath) return '';
            const normalizedPath = segments.map((segment, index) => (
                index === 0 && segment.startsWith('@')
                    ? `@${encodeURIComponent(segment.slice(1))}`
                    : encodeURIComponent(segment)
            )).join('/');
            return `https://www.youtube.com/${normalizedPath}`;
        } catch {
            return '';
        }
    }

    function getYouTubeChannelLookup(item = {}) {
        if (item.channelId) return { id: String(item.channelId) };
        const channelUrl = normalizeYouTubeChannelUrl(item.channelUrl);
        if (!channelUrl) return null;
        const segments = new URL(channelUrl).pathname.split('/').filter(Boolean).map(decodeURIComponent);
        if (segments[0] === 'channel' && segments[1]) return { id: segments[1] };
        if (segments[0]?.startsWith('@')) return { forHandle: segments[0] };
        if (segments[0] === 'user' && segments[1]) return { forUsername: segments[1] };
        return null;
    }

    function formatPlaybackTime(value) {
        const seconds = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainder = seconds % 60;
        return hours
            ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
            : `${minutes}:${String(remainder).padStart(2, '0')}`;
    }

    function parseIso8601DurationSeconds(value = '') {
        const match = String(value).match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
        if (!match) return 0;
        const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
        return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
    }

    function isLongFormTrendVideo(item = {}) {
        return parseIso8601DurationSeconds(item.contentDetails?.duration) > SHORTS_MAX_DURATION_SECONDS;
    }

    function mergeSearchVideoIds(responses = []) {
        const lists = responses.map(response => response.data?.items || []);
        const ids = [];
        const seen = new Set();
        const maxLength = Math.max(0, ...lists.map(items => items.length));
        for (let index = 0; index < maxLength; index += 1) {
            lists.forEach(items => {
                const id = extractYouTubeVideoId(items[index]);
                if (id && !seen.has(id)) {
                    seen.add(id);
                    ids.push(id);
                }
            });
        }
        return ids;
    }

    function selectHighQualityTrendVideos(items = [], limit = 24) {
        // 只使用 YouTube 原始可见字段做分级筛选，不生成或展示自定义“质量分”。
        const eligible = items.filter(item => (
            isLongFormTrendVideo(item)
            && item.status?.embeddable !== false
            && item.snippet?.liveBroadcastContent !== 'live'
            && item.snippet?.liveBroadcastContent !== 'upcoming'
            && !item.liveStreamingDetails
        ));
        const strong = eligible.filter(item => {
            const views = Number(item.statistics?.viewCount || 0);
            const likes = item.statistics?.likeCount;
            return views >= TREND_STRONG_MIN_VIEWS
                && (likes === undefined || Number(likes) >= TREND_STRONG_MIN_LIKES);
        });
        const relaxed = eligible.filter(item => Number(item.statistics?.viewCount || 0) >= TREND_RELAXED_MIN_VIEWS);
        const result = [];
        const selectedIds = new Set();
        const channelCounts = new Map();
        for (const tier of [strong, relaxed, eligible]) {
            for (const item of tier) {
                if (!item.id || selectedIds.has(item.id)) continue;
                const channelId = item.snippet?.channelId || '';
                if (channelId && (channelCounts.get(channelId) || 0) >= TREND_MAX_PER_CHANNEL) continue;
                selectedIds.add(item.id);
                if (channelId) channelCounts.set(channelId, (channelCounts.get(channelId) || 0) + 1);
                result.push(item);
                if (result.length >= limit) return result;
            }
        }
        return result;
    }

    function mergeWatchHistory(items = [], item = {}, watchedAt = new Date().toISOString()) {
        if (!VIDEO_ID_PATTERN.test(String(item.id || ''))) return [...items];
        return [
            { ...item, kind: 'video', watchedAt },
            ...items.filter(entry => entry?.id !== item.id),
        ].slice(0, WATCH_HISTORY_LIMIT);
    }

    function storageGet(defaults) {
        return new Promise(resolve => chrome.storage.local.get(defaults, result => resolve(result || defaults)));
    }

    function storageSet(values) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(values, () => {
                const error = chrome.runtime?.lastError;
                if (error) reject(new Error(error.message));
                else resolve();
            });
        });
    }

    function sendMessage(message, timeoutMs = 15_000) {
        return new Promise(resolve => {
            let settled = false;
            const timeoutId = setTimeout(() => finish({
                ok: false,
                error: {
                    code: 'request-timeout',
                    message: '等待扩展后台响应超时',
                },
            }), timeoutMs);
            const finish = response => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                const error = chrome.runtime?.lastError;
                resolve(error ? { ok: false, error: { code: 'runtime-error', message: error.message } } : (response || { ok: false, error: { code: 'background-unavailable' } }));
            };
            try {
                const possiblePromise = chrome.runtime.sendMessage(message, finish);
                if (possiblePromise?.then) possiblePromise.then(finish).catch(error => finish({ ok: false, error: { code: 'runtime-error', message: error.message } }));
            } catch (error) {
                finish({ ok: false, error: { code: 'runtime-error', message: error.message } });
            }
        });
    }

    class YouTubeController {
        constructor() {
            this.initialized = false;
            this.isOpen = false;
            this.activeView = 'recommended';
            this.auth = { configured: false, connected: false, mode: 'checking', extensionId: '' };
            this.queue = [];
            this.learning = [];
            this.history = [];
            this.settings = {};
            this.layout = 'grid';
            this.items = [];
            this.subscriptions = [];
            this.trendCache = new Map();
            this.listContext = null;
            this.currentVideo = null;
            this.playerOrigin = null;
            this.creatorEntry = null;
            this.playerBridge = null;
            this.playerBridgeTimer = 0;
            this.playerControlUpdateFrame = 0;
            this.playerProgressDragging = false;
            this.playerRecentItems = [];
            this.playerRecentChannelKey = '';
            this.playerRecentRequestId = 0;
            this.historyRecordedVideoId = '';
            this.remoteRequestId = 0;
            this.returnFocus = null;
            this.backgroundInertSiblings = [];
            this.busy = false;
            this.authBusy = false;
            this.clearLocalArmedUntil = 0;
        }

        async init() {
            if (this.initialized) return;
            this._injectPanel();
            this._bindEvents();
            const stored = await storageGet({ [STORAGE_KEYS.queue]: [], [STORAGE_KEYS.learning]: [], [STORAGE_KEYS.history]: [], [STORAGE_KEYS.settings]: {} });
            this.queue = Array.isArray(stored[STORAGE_KEYS.queue]) ? stored[STORAGE_KEYS.queue] : [];
            this.learning = Array.isArray(stored[STORAGE_KEYS.learning]) ? stored[STORAGE_KEYS.learning] : [];
            this.history = Array.isArray(stored[STORAGE_KEYS.history]) ? stored[STORAGE_KEYS.history] : [];
            this.settings = stored[STORAGE_KEYS.settings] && typeof stored[STORAGE_KEYS.settings] === 'object' ? stored[STORAGE_KEYS.settings] : {};
            this.layout = LAYOUTS.has(this.settings.layout) ? this.settings.layout : 'grid';
            const hasCurrentTrendPreference = this.settings.trendPreferenceVersion === TREND_PREFERENCE_VERSION
                && TREND_CATEGORIES.some(category => category.id === this.settings.trendCategoryId);
            this.trendCategoryId = hasCurrentTrendPreference ? this.settings.trendCategoryId : DEFAULT_TREND_CATEGORY_ID;
            if (!hasCurrentTrendPreference) {
                this.settings = {
                    ...this.settings,
                    trendCategoryId: this.trendCategoryId,
                    trendPreferenceVersion: TREND_PREFERENCE_VERSION,
                };
                await storageSet({ [STORAGE_KEYS.settings]: this.settings });
            }
            await this._refreshAuthStatus();
            this._renderActiveView();
            this.initialized = true;
        }

        toggle() {
            if (this.isOpen) this.close();
            else this.open();
        }

        open() {
            if (!this.panel) return;
            this.returnFocus = document.activeElement;
            this.isOpen = true;
            this.panel.hidden = false;
            this.panel.removeAttribute('inert');
            this.panel.setAttribute('aria-hidden', 'false');
            document.body.classList.add('youtube-workbench-open');
            window.ProductUIV5?.setBusinessPage?.('youtube', this.currentVideo ? 'player' : this._pageForView(this.activeView));
            // 从应用启动台打开时，启动台会在当前调用栈末尾清理它设置的 inert。
            // 下一帧重新声明 YouTube 模态边界，避免背景回到无障碍树。
            requestAnimationFrame(() => {
                if (!this.isOpen) return;
                this._setBackgroundInert(true);
                this.panel.querySelector('.yt-close')?.focus();
            });
        }

        close() {
            if (!this.panel) return;
            this.isOpen = false;
            this.panel.hidden = true;
            this.panel.setAttribute('inert', '');
            this.panel.setAttribute('aria-hidden', 'true');
            this._setBackgroundInert(false);
            document.body.classList.remove('youtube-workbench-open');
            const frame = this.panel.querySelector('.yt-player-frame');
            if (frame) frame.remove();
            this._detachPlayerBridge();
            const originalFocusIsUsable = this.returnFocus?.isConnected
                && !this.returnFocus.closest?.('[inert]')
                && this.returnFocus.getClientRects?.().length;
            const fallback = document.getElementById('dock-launchpad-btn') || document.getElementById('youtube-dock-btn');
            (originalFocusIsUsable ? this.returnFocus : fallback)?.focus?.({ preventScroll: true });
            this.returnFocus = null;
        }

        _setBackgroundInert(active) {
            if (active) {
                if (this.backgroundInertSiblings.length) return;
                this.backgroundInertSiblings = [...document.body.children]
                    .filter(child => child !== this.panel && !child.inert);
                this.backgroundInertSiblings.forEach(child => { child.inert = true; });
                return;
            }
            this.backgroundInertSiblings.forEach(child => { child.inert = false; });
            this.backgroundInertSiblings = [];
        }

        _injectPanel() {
            const element = document.createElement('section');
            element.id = 'youtube-workbench';
            element.className = 'yt-panel';
            element.hidden = true;
            element.setAttribute('inert', '');
            element.setAttribute('aria-hidden', 'true');
            element.setAttribute('role', 'dialog');
            element.setAttribute('aria-modal', 'true');
            element.setAttribute('aria-labelledby', 'yt-workbench-title');
            element.innerHTML = `
                <header class="yt-topbar">
                    <div class="yt-brand"><span class="yt-logo" aria-hidden="true"><i class="fab fa-youtube"></i></span><div><strong id="yt-workbench-title">YouTube 工作台</strong><small>官方播放器 · 本地学习流</small></div></div>
                    <form class="yt-search" role="search"><label class="sr-only" for="yt-search-input">搜索或粘贴 YouTube 链接</label><input id="yt-search-input" type="search" autocomplete="off" placeholder="搜索视频，或粘贴 YouTube 链接 / 视频 ID"><button type="submit" aria-label="搜索或播放"><i class="fas fa-search"></i></button></form>
                    <div class="yt-account"><span class="yt-account-state">正在检测账号</span><button class="yt-connect" type="button" disabled>连接账号</button><button class="yt-close" type="button" aria-label="关闭 YouTube 工作台"><i class="fas fa-times"></i></button></div>
                </header>
                <div class="yt-body">
                    <nav class="yt-nav" aria-label="YouTube 工作台导航">
                        <button type="button" data-youtube-view="recommended"><i class="fas fa-compass"></i><span>为你推荐</span></button>
                        <button type="button" data-youtube-view="trending"><i class="fas fa-fire"></i><span>兴趣趋势</span></button>
                        <button type="button" data-youtube-view="subscriptions"><i class="fas fa-layer-group"></i><span>订阅</span></button>
                        <button type="button" data-youtube-view="playlists"><i class="fas fa-list"></i><span>播放列表</span></button>
                        <button type="button" data-youtube-view="likes"><i class="fas fa-thumbs-up"></i><span>喜欢</span></button>
                        <div class="yt-nav-label">LOCAL</div>
                        <button type="button" data-youtube-view="history"><i class="fas fa-history"></i><span>观看历史</span><em data-yt-count="history">0</em></button>
                        <button type="button" data-youtube-view="local-queue"><i class="far fa-clock"></i><span>稍后看</span><em data-yt-count="queue">0</em></button>
                        <button type="button" data-youtube-view="learning"><i class="fas fa-graduation-cap"></i><span>学习清单</span><em data-yt-count="learning">0</em></button>
                    </nav>
                    <main class="yt-content">
                        <div class="yt-page-heading"><div><span class="yt-eyebrow">YOUTUBE · WORKBENCH</span><h2 class="yt-view-title">为你推荐</h2></div><div class="yt-status" role="status" aria-live="polite"></div></div>
                        <div class="yt-stage"></div>
                    </main>
                </div>`;
            document.body.appendChild(element);
            this.panel = element;
            this.stage = element.querySelector('.yt-stage');
        }

        _bindEvents() {
            this.panel.querySelector('.yt-close').addEventListener('click', () => this.close());
            this.panel.querySelector('.yt-connect').addEventListener('click', () => this.auth.connected ? this._disconnect() : this._connect());
            this.panel.querySelector('.yt-search').addEventListener('submit', event => {
                event.preventDefault();
                this._handleSearch(this.panel.querySelector('#yt-search-input').value);
            });
            this.panel.addEventListener('click', event => this._handleClick(event));
            this.panel.addEventListener('input', event => this._handlePlayerProgressInput(event));
            this.panel.addEventListener('change', event => this._handlePlayerProgressChange(event));
            this.panel.addEventListener('keydown', event => this._handleKeydown(event));
            window.addEventListener('focus', () => this._recoverAuthAfterWindowFocus());
            window.addEventListener('message', event => this._handlePlayerMessage(event));
        }

        async _handleClick(event) {
            const viewButton = event.target.closest('[data-youtube-view]');
            if (viewButton) {
                await this._showView(viewButton.dataset.youtubeView, true);
                return;
            }
            const playButton = event.target.closest('[data-yt-play]');
            if (playButton) {
                const item = this._findItem(playButton.dataset.ytPlay);
                if (item) await this._play(item, this._capturePlayerOrigin());
                return;
            }
            const channelButton = event.target.closest('[data-yt-channel]');
            if (channelButton) {
                const item = this._findItem(channelButton.dataset.ytChannel);
                if (item) await this._openChannelUploads(item);
                return;
            }
            const playlistButton = event.target.closest('[data-yt-playlist]');
            if (playlistButton) {
                const item = this._findItem(playlistButton.dataset.ytPlaylist);
                if (item) await this._openPlaylist(item);
                return;
            }
            const playerButton = event.target.closest('[data-yt-player-action]');
            if (playerButton) {
                this._handlePlayerAction(playerButton.dataset.ytPlayerAction, playerButton.dataset.rate);
                return;
            }
            const recentButton = event.target.closest('[data-yt-recent-id]');
            if (recentButton) {
                const item = this.playerRecentItems.find(video => video.id === recentButton.dataset.ytRecentId);
                if (item) await this._switchRecentVideo(item);
                return;
            }
            const actionButton = event.target.closest('[data-yt-action]');
            if (!actionButton) return;
            const item = this._findItem(actionButton.dataset.videoId) || this.currentVideo;
            const action = actionButton.dataset.ytAction;
            if (action === 'connect') await this._connect();
            if (action === 'retry') await this._showView(this.activeView, true);
            if (action === 'subscription-updates') await this._openSubscriptionUpdates();
            if (action === 'return-list') this._returnToPlayerOrigin();
            if (action === 'creator-home') await this._openCreatorHome();
            if (action === 'refresh-player-recent') await this._loadPlayerRecentVideos(true);
            if (action === 'creator-return-player') await this._returnToCreatorPlayer();
            if (action === 'layout-grid') await this._setLayout('grid');
            if (action === 'layout-list') await this._setLayout('list');
            if (action === 'trend-category') await this._setTrendCategory(actionButton.dataset.categoryId);
            if (action === 'add-queue' && item) await this._addLocal('queue', item);
            if (action === 'add-learning' && item) await this._addLocal('learning', item);
            if (action === 'remove-queue' && item) await this._removeLocal('queue', item.id);
            if (action === 'remove-learning' && item) await this._removeLocal('learning', item.id);
            if (action === 'remove-history' && item) await this._removeLocal('history', item.id);
            if (action === 'clear-local') await this._prepareOrClearLocal(actionButton);
            if (action === 'open' && item) window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`, '_blank', 'noopener,noreferrer');
            if (action === 'copy' && item) {
                await navigator.clipboard?.writeText(`https://youtu.be/${item.id}`);
                this._setStatus('链接已复制');
            }
        }

        _handleKeydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
                return;
            }
            if (this.currentVideo && !event.metaKey && !event.ctrlKey && !event.altKey && !event.target.matches('input, textarea, select')) {
                const handled = this._handlePlayerShortcut(event);
                if (handled) return;
            }
            if (event.key !== 'Tab') return;
            const focusable = [...this.panel.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], iframe')].filter(element => !element.hidden && element.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }

        async _refreshAuthStatus() {
            const response = await sendMessage({ action: 'youtube_auth_status' });
            this.auth = response.ok
                ? response.data
                : { configured: false, connected: false, mode: 'background-unavailable', extensionId: chrome.runtime?.id || '', error: response.error };
            this._renderAccount();
        }

        async _connect() {
            if (this.authBusy) return;
            if (!this.auth.configured) {
                this._renderConnect(this.activeView);
                this._setStatus('需要先为当前扩展配置 Google OAuth 客户端');
                return;
            }
            this.authBusy = true;
            this._renderAccount();
            this._setStatus('正在连接 Google 账号…', true);
            const response = await sendMessage({ action: 'youtube_connect' }, AUTH_MESSAGE_TIMEOUT_MS);
            if (!this.authBusy && this.auth.connected) return;
            this.authBusy = false;
            if (!response.ok) {
                this.auth = { ...this.auth, connected: false, error: response.error };
                this._renderAccount();
                this._renderError(response.error, '连接尚未完成');
                window.ProductUIV5?.setBusinessPage?.('youtube', 'error');
                return;
            }
            this.auth = response.data || { ...this.auth, configured: true, connected: true, mode: 'connected' };
            this._renderAccount();
            await this._showView('recommended', true);
        }

        async _recoverAuthAfterWindowFocus() {
            if (!this.authBusy) return;
            await new Promise(resolve => setTimeout(resolve, 400));
            const response = await sendMessage({ action: 'youtube_auth_status' }, 5_000);
            if (!response.ok || !response.data?.connected || !this.authBusy) return;
            this.authBusy = false;
            this.auth = response.data;
            this._renderAccount();
            this._setStatus('YouTube 已连接');
            await this._showView('recommended', true);
        }

        async _disconnect() {
            await sendMessage({ action: 'youtube_disconnect' });
            this.auth = { ...this.auth, connected: false };
            this._renderAccount();
            this._renderActiveView();
        }

        async _showView(view, force = false) {
            if (!VIEWS.has(view) || (this.busy && !force)) return;
            if (force) this.busy = false;
            const requestId = ++this.remoteRequestId;
            this._detachPlayerBridge();
            this.activeView = view;
            this.currentVideo = null;
            this.playerOrigin = null;
            this.creatorEntry = null;
            this.listContext = null;
            this._syncNav();
            window.ProductUIV5?.setBusinessPage?.('youtube', this._pageForView(view));
            if (view === 'history' || view === 'local-queue' || view === 'learning') {
                if (view === 'history') {
                    this.items = [...this.history];
                    this._renderList(this.items, '本地观看历史', true, {
                        localType: 'history',
                        dateField: 'watchedAt',
                        playerReturnLabel: '观看历史',
                        note: `仅记录扩展内实际开始播放的视频 · 最多 ${WATCH_HISTORY_LIMIT} 条`,
                        emptyTitle: '还没有观看记录',
                        emptyDescription: '在本工作台开始播放视频后，会自动记录到这里。',
                    });
                } else {
                    this.items = view === 'local-queue' ? [...this.queue] : [...this.learning];
                    this._renderList(this.items, view === 'local-queue' ? '本地稍后看' : '本地学习清单', true);
                }
                return;
            }
            if (!this.auth.connected) {
                this._renderConnect(view);
                return;
            }
            await this._loadRemote(view, requestId);
        }

        async _loadRemote(view, requestId = this.remoteRequestId) {
            if (view === 'recommended') {
                await this._loadRecommendations(requestId);
                return;
            }
            if (view === 'trending') {
                await this._loadInterestTrend(requestId);
                return;
            }
            const requests = {
                subscriptions: ['subscriptions', { part: 'snippet,contentDetails', mine: true, maxResults: 50 }],
                playlists: ['playlists', { part: 'snippet,contentDetails,status', mine: true, maxResults: 25 }],
                likes: ['channels', { part: 'contentDetails', mine: true }],
            };
            const request = requests[view];
            if (!request) return;
            this.busy = true;
            this._renderLoading();
            const response = await sendMessage({ action: 'youtube_api', resource: request[0], params: request[1] });
            this.busy = false;
            if (requestId !== this.remoteRequestId) return;
            if (!response.ok) {
                this._renderError(response.error, '数据加载失败');
                window.ProductUIV5?.setBusinessPage?.('youtube', 'error');
                return;
            }
            if (view === 'likes') {
                const playlistId = response.data.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
                if (!playlistId) { this._renderList([], '喜欢的视频'); return; }
                const likes = await sendMessage({ action: 'youtube_api', resource: 'playlistItems', params: { part: 'snippet,contentDetails', playlistId, maxResults: 50 } });
                if (requestId !== this.remoteRequestId) return;
                if (!likes.ok) { this._renderError(likes.error, '喜欢的视频加载失败'); return; }
                this.items = this._normalizeItems(likes.data.items || []);
                this._renderList(this.items, '喜欢的视频');
                return;
            }
            if (view === 'subscriptions') {
                const subscriptions = (response.data.items || []).map(item => ({
                    id: item.snippet?.resourceId?.channelId || item.id,
                    title: item.snippet?.title || '未命名频道',
                    description: item.snippet?.description || '',
                    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
                    channel: `${item.contentDetails?.totalItemCount || 0} 个视频`,
                    kind: 'channel',
                }));
                this.subscriptions = subscriptions;
                this.items = subscriptions;
                this._renderList(subscriptions, '我的订阅', false, { showSubscriptionUpdates: true });
                return;
            }
            if (view === 'playlists') {
                this.items = (response.data.items || []).map(item => ({
                    id: item.id,
                    title: item.snippet?.title || '未命名播放列表',
                    description: item.snippet?.description || '',
                    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
                    channel: `${item.contentDetails?.itemCount || 0} 个视频`,
                    kind: 'playlist',
                }));
                this._renderList(this.items, '我的播放列表');
                return;
            }
        }

        _renderInterestTrend(items, category, cached = false, partial = false, mixState = {}) {
            this.items = items;
            const sourceNote = cached ? '15 分钟缓存' : '近 90 天优选';
            const counts = Object.fromEntries(TREND_CIRCLES.map(circle => [
                circle.id,
                items.filter(item => item.trendCircle === circle.id).length,
            ]));
            const ratioNote = TREND_CIRCLES.map(circle => `${circle.label} ${counts[circle.id] || 0}/${circle.target}`).join(' · ');
            this._renderList(items, '兴趣趋势', false, {
                trendCategories: true,
                trendMix: {
                    counts,
                    activeCircleId: mixState.activeCircleId || '',
                    completedCircleIds: mixState.completedCircleIds || [],
                    failedCircleIds: mixState.failedCircleIds || [],
                },
                note: `${category.label} · 目标配比 4:3:3 · ${ratioNote} · ${sourceNote}${partial ? ' · 部分圈层暂不可用' : ''}`,
                playerReturnLabel: `${category.label}兴趣趋势`,
                emptyTitle: '该分类暂时没有合适的长视频',
                emptyDescription: mixState.activeCircleId ? `正在加载${TREND_CIRCLES.find(circle => circle.id === mixState.activeCircleId)?.label || '下一圈层'}内容…` : '当前结果中的 Shorts 已被过滤，可以切换其他兴趣分类或稍后刷新。',
            });
        }

        async _loadInterestTrend(requestId = this.remoteRequestId) {
            const category = TREND_CATEGORIES.find(item => item.id === this.trendCategoryId) || TREND_CATEGORIES[0];
            const cached = this.trendCache.get(category.id);
            if (cached && Date.now() - cached.loadedAt < TREND_CACHE_TTL_MS) {
                this._renderInterestTrend([...cached.items], category, true, cached.partial, {
                    completedCircleIds: cached.completedCircleIds,
                    failedCircleIds: cached.failedCircleIds,
                });
                return;
            }

            this.busy = true;
            this._renderLoading(`正在优先加载${TREND_CIRCLES[0].label}内容…`);
            const items = [];
            const completedCircleIds = [];
            const failedCircleIds = [];
            let firstError = null;
            for (let index = 0; index < TREND_CIRCLES.length; index += 1) {
                const circle = TREND_CIRCLES[index];
                const result = await this._loadTrendCircle(category, circle, requestId);
                if (requestId !== this.remoteRequestId) return;
                if (result.ok) {
                    items.push(...result.items);
                    completedCircleIds.push(circle.id);
                } else {
                    failedCircleIds.push(circle.id);
                    firstError ||= result.error;
                }
                const nextCircle = TREND_CIRCLES[index + 1];
                if (items.length || !nextCircle) {
                    this._renderInterestTrend(items, category, false, failedCircleIds.length > 0, {
                        activeCircleId: nextCircle?.id || '',
                        completedCircleIds: [...completedCircleIds],
                        failedCircleIds: [...failedCircleIds],
                    });
                } else if (nextCircle) {
                    this._renderLoading(`正在加载${nextCircle.label}内容…`);
                }
            }
            this.busy = false;
            if (!items.length && firstError) {
                this._renderError(firstError, '兴趣趋势加载失败');
                window.ProductUIV5?.setBusinessPage?.('youtube', 'error');
                return;
            }
            const cacheEntry = {
                items: [...items],
                loadedAt: Date.now(),
                partial: failedCircleIds.length > 0,
                completedCircleIds: [...completedCircleIds],
                failedCircleIds: [...failedCircleIds],
            };
            this.trendCache.set(category.id, cacheEntry);
            this._renderInterestTrend(items, category, false, cacheEntry.partial, cacheEntry);
        }

        async _loadTrendCircle(category, circle, requestId) {
            const publishedAfter = new Date(Date.now() - TREND_LOOKBACK_DAYS * 86400 * 1000).toISOString();
            const searchResponse = await sendMessage({
                action: 'youtube_api',
                resource: 'search',
                params: {
                    part: 'snippet',
                    q: category.queries?.[circle.id] || '',
                    type: 'video',
                    order: 'rating',
                    publishedAfter,
                    relevanceLanguage: circle.relevanceLanguage,
                    videoEmbeddable: true,
                    videoDefinition: 'high',
                    safeSearch: 'moderate',
                    maxResults: 50,
                },
            });
            if (requestId !== this.remoteRequestId) return { ok: false, stale: true };
            if (!searchResponse.ok) return { ok: false, error: searchResponse.error };
            const videoIds = mergeSearchVideoIds([searchResponse]);
            if (!videoIds.length) return { ok: true, items: [] };
            const detailResponse = await sendMessage({
                action: 'youtube_api',
                resource: 'videos',
                params: {
                    part: 'snippet,contentDetails,statistics,status,liveStreamingDetails',
                    id: videoIds.join(','),
                    maxResults: 50,
                },
            });
            if (requestId !== this.remoteRequestId) return { ok: false, stale: true };
            if (!detailResponse.ok) return { ok: false, error: detailResponse.error };
            const searchOrder = new Map(videoIds.map((id, index) => [id, index]));
            const detailItems = (detailResponse.data.items || [])
                .sort((left, right) => (searchOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (searchOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
            const selected = selectHighQualityTrendVideos(detailItems, circle.target)
                .map(item => ({ ...item, trendCircle: circle.id, trendCircleLabel: circle.label }));
            return { ok: true, items: this._normalizeItems(selected) };
        }

        async _loadRecommendations(requestId = this.remoteRequestId) {
            this.busy = true;
            this._renderLoading('正在从订阅频道整理近期推荐…');
            const subscriptionResponse = await sendMessage({
                action: 'youtube_api',
                resource: 'subscriptions',
                params: { part: 'snippet,contentDetails', mine: true, maxResults: RECOMMENDATION_CHANNEL_LIMIT },
            });
            if (requestId !== this.remoteRequestId) return;
            if (!subscriptionResponse.ok) {
                this.busy = false;
                this._renderError(subscriptionResponse.error, '推荐内容加载失败');
                return;
            }
            const subscriptions = (subscriptionResponse.data.items || []).map(item => ({
                id: item.snippet?.resourceId?.channelId || '',
                title: item.snippet?.title || '未命名频道',
            })).filter(item => item.id);
            if (!subscriptions.length) {
                this.busy = false;
                this.items = [];
                this._renderList([], '为你推荐', false, {
                    note: '推荐依据：你的订阅频道 · 非 YouTube 首页算法',
                    emptyTitle: '还没有可用的推荐依据',
                    emptyDescription: '先订阅一些喜欢的频道，或前往兴趣趋势选择想看的内容分类。',
                });
                return;
            }
            const channelResponse = await sendMessage({
                action: 'youtube_api',
                resource: 'channels',
                params: { part: 'contentDetails', id: subscriptions.map(item => item.id).join(','), maxResults: RECOMMENDATION_CHANNEL_LIMIT },
            });
            if (requestId !== this.remoteRequestId) return;
            if (!channelResponse.ok) {
                this.busy = false;
                this._renderError(channelResponse.error, '推荐频道加载失败');
                return;
            }
            const uploadsByChannel = new Map((channelResponse.data.items || []).map(item => [
                item.id,
                item.contentDetails?.relatedPlaylists?.uploads || '',
            ]));
            const responses = await Promise.all(subscriptions.map(async channel => {
                const playlistId = uploadsByChannel.get(channel.id);
                if (!playlistId) return [];
                const response = await sendMessage({
                    action: 'youtube_api',
                    resource: 'playlistItems',
                    params: { part: 'snippet,contentDetails', playlistId, maxResults: 2 },
                });
                return response.ok ? (response.data.items || []) : [];
            }));
            if (requestId !== this.remoteRequestId) return;
            this.busy = false;
            const seen = new Set();
            this.items = this._normalizeItems(responses.flat())
                .filter(item => !seen.has(item.id) && seen.add(item.id))
                .sort((left, right) => String(right.publishedAt).localeCompare(String(left.publishedAt)))
                .slice(0, 24);
            this._renderList(this.items, '为你推荐', false, {
                note: `来自你订阅的 ${subscriptions.length} 个频道近期公开投稿 · 非 YouTube 首页算法`,
                emptyTitle: '订阅频道近期没有公开投稿',
                emptyDescription: '可以前往兴趣趋势切换分类，或稍后刷新。',
                playerReturnLabel: '为你推荐',
            });
        }

        async _handleSearch(raw) {
            const query = String(raw || '').trim();
            if (!query) return;
            this.remoteRequestId += 1;
            const videoId = parseYouTubeVideoId(query);
            if (videoId) {
                await this._play({ id: videoId, title: 'YouTube 视频', channel: '通过链接打开', description: '', thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, kind: 'video' }, null);
                return;
            }
            this.listContext = null;
            window.ProductUIV5?.setBusinessPage?.('youtube', 'search');
            if (!this.auth.connected) {
                this.activeView = 'recommended';
                this.stage.innerHTML = `<div class="yt-empty"><i class="fas fa-search"></i><h3>连接账号后在工作台搜索</h3><p>当前也可以粘贴完整 YouTube 链接或 11 位视频 ID 直接播放。</p><a class="yt-primary" href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" rel="noopener noreferrer">在 YouTube 搜索“${escapeHtml(query)}”</a></div>`;
                return;
            }
            this._renderLoading('正在搜索…');
            const response = await sendMessage({ action: 'youtube_api', resource: 'search', params: { part: 'snippet', q: query, type: 'video', videoEmbeddable: true, maxResults: 24 } });
            if (!response.ok) { this._renderError(response.error, '搜索失败'); return; }
            this.items = this._normalizeItems(response.data.items || []);
            this._renderList(this.items, `“${query}”的搜索结果`, false, { businessPage: 'search', playerReturnLabel: '搜索结果' });
        }

        _normalizeItems(items) {
            return items.map(item => {
                const id = extractYouTubeVideoId(item);
                return {
                    id,
                    title: item.snippet?.title || '未命名视频',
                    description: item.snippet?.description || '',
                    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''),
                    channel: item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || '',
                    channelId: item.snippet?.videoOwnerChannelId || item.snippet?.channelId || '',
                    channelUrl: normalizeYouTubeChannelUrl(item.snippet?.videoOwnerChannelId || item.snippet?.channelId
                        ? `https://www.youtube.com/channel/${item.snippet?.videoOwnerChannelId || item.snippet?.channelId}`
                        : ''),
                    publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || '',
                    trendCircle: item.trendCircle || '',
                    trendCircleLabel: item.trendCircleLabel || '',
                    kind: 'video',
                };
            }).filter(item => VIDEO_ID_PATTERN.test(item.id));
        }

        async _openChannelUploads(channel) {
            if (this.busy) return;
            this.busy = true;
            this._renderLoading(`正在加载 ${channel.title} 的最近更新…`);
            const channelResponse = await sendMessage({
                action: 'youtube_api',
                resource: 'channels',
                params: { part: 'contentDetails', id: channel.id, maxResults: 1 },
            });
            const uploadsId = channelResponse.ok
                ? channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
                : '';
            const uploadsResponse = uploadsId ? await sendMessage({
                action: 'youtube_api',
                resource: 'playlistItems',
                params: { part: 'snippet,contentDetails', playlistId: uploadsId, maxResults: 24 },
            }) : channelResponse;
            this.busy = false;
            if (!uploadsResponse?.ok) {
                this._renderError(uploadsResponse?.error || { code: 'channel-uploads-unavailable' }, '频道更新加载失败');
                return;
            }
            this.items = this._normalizeItems(uploadsResponse.data.items || []);
            this._renderList(this.items, `${channel.title} · 最近更新`, false, {
                backView: 'subscriptions',
                playerReturnLabel: channel.title,
            });
        }

        async _openPlaylist(playlist) {
            if (this.busy) return;
            this.busy = true;
            this._renderLoading(`正在打开 ${playlist.title}…`);
            const response = await sendMessage({
                action: 'youtube_api',
                resource: 'playlistItems',
                params: { part: 'snippet,contentDetails', playlistId: playlist.id, maxResults: 50 },
            });
            this.busy = false;
            if (!response.ok) {
                this._renderError(response.error, '播放列表加载失败');
                return;
            }
            this.items = this._normalizeItems(response.data.items || []);
            this._renderList(this.items, playlist.title, false, { backView: 'playlists', playerReturnLabel: playlist.title });
        }

        async _openSubscriptionUpdates() {
            if (this.busy || !this.subscriptions.length) return;
            this.busy = true;
            this._renderLoading('正在汇总订阅频道的最近更新…');
            const channels = this.subscriptions.slice(0, 50);
            const channelResponse = await sendMessage({
                action: 'youtube_api',
                resource: 'channels',
                params: { part: 'contentDetails', id: channels.map(item => item.id).join(','), maxResults: 50 },
            });
            if (!channelResponse.ok) {
                this.busy = false;
                this._renderError(channelResponse.error, '订阅更新加载失败');
                return;
            }
            const uploadsByChannel = new Map((channelResponse.data.items || []).map(item => [
                item.id,
                item.contentDetails?.relatedPlaylists?.uploads || '',
            ]));
            const responses = await Promise.all(channels.map(async channel => {
                const playlistId = uploadsByChannel.get(channel.id);
                if (!playlistId) return null;
                const response = await sendMessage({
                    action: 'youtube_api',
                    resource: 'playlistItems',
                    params: { part: 'snippet,contentDetails', playlistId, maxResults: 1 },
                });
                return response.ok ? response.data.items?.[0] : null;
            }));
            this.busy = false;
            this.items = this._normalizeItems(responses.filter(Boolean))
                .sort((left, right) => String(right.publishedAt).localeCompare(String(left.publishedAt)));
            this._renderList(this.items, '订阅频道 · 最近更新', false, {
                backView: 'subscriptions',
                note: `已汇总当前页 ${channels.length} 个订阅频道`,
                playerReturnLabel: '订阅频道最近更新',
            });
        }

        _playerControlsMarkup() {
            const rates = DEFAULT_PLAYBACK_RATES.map(rate => `<button type="button" data-yt-player-action="rate" data-rate="${rate}" aria-pressed="${rate === AUTO_PLAYBACK_RATE}" disabled>${rate}×</button>`).join('');
            return `<section class="yt-player-controls" aria-label="YouTube 快捷播放控制">
                <div class="yt-player-seek">
                    <button type="button" data-yt-player-action="back-10" disabled aria-label="后退 10 秒"><i class="fas fa-undo-alt"></i><span>10s</span></button>
                    <input type="range" data-yt-player-progress min="0" max="1" step="0.1" value="0" disabled aria-label="播放进度">
                    <span class="yt-player-time" data-yt-player-time>0:00 / 0:00</span>
                    <button type="button" data-yt-player-action="forward-10" disabled aria-label="前进 10 秒"><span>10s</span><i class="fas fa-redo-alt"></i></button>
                </div>
                <div class="yt-player-quick-row">
                    <div class="yt-player-rates" role="group" aria-label="播放速度"><span>倍速</span>${rates}</div>
                    <span class="yt-player-quality" title="YouTube 已停止支持通过 IFrame API 设置清晰度"><i class="fas fa-cog"></i> 清晰度在播放器内调整</span>
                    <span class="yt-player-shortcuts" data-yt-player-status>连接播放器后可用：J/L ±10s · K 播放暂停 · ←/→ ±5s</span>
                </div>
            </section>`;
        }

        _attachPlayerBridge(frame) {
            this._detachPlayerBridge();
            this.playerBridge = {
                frame,
                loaded: false,
                ready: false,
                currentTime: 0,
                duration: 0,
                playbackRate: AUTO_PLAYBACK_RATE,
                playerState: -1,
                availableRates: [...DEFAULT_PLAYBACK_RATES],
                autoRatePending: true,
            };
            const startListening = () => {
                if (!this.playerBridge || this.playerBridge.frame !== frame || !this.playerBridge.loaded) return;
                this._postPlayerMessage({ event: 'listening', id: frame.id, channel: 'youtube-workbench' });
            };
            frame.addEventListener('load', () => {
                if (!this.playerBridge || this.playerBridge.frame !== frame) return;
                this.playerBridge.loaded = true;
                startListening();
                window.setTimeout(startListening, 350);
                window.setTimeout(startListening, 1000);
            }, { once: true });
            this.playerBridgeTimer = window.setInterval(() => {
                if (!this.playerBridge?.frame?.isConnected) return;
                if (this.playerBridge.ready) {
                    window.clearInterval(this.playerBridgeTimer);
                    this.playerBridgeTimer = 0;
                    return;
                }
                startListening();
            }, 700);
        }

        _detachPlayerBridge() {
            if (this.playerBridgeTimer) window.clearInterval(this.playerBridgeTimer);
            if (this.playerControlUpdateFrame) window.cancelAnimationFrame(this.playerControlUpdateFrame);
            this.playerBridgeTimer = 0;
            this.playerControlUpdateFrame = 0;
            this.playerBridge = null;
            this.playerProgressDragging = false;
        }

        _postPlayerMessage(payload) {
            const target = this.playerBridge?.frame?.contentWindow;
            if (!target) return;
            try { target.postMessage(JSON.stringify(payload), YOUTUBE_PLAYER_ORIGIN); } catch { /* 原生播放器仍可操作 */ }
        }

        _handlePlayerMessage(event) {
            if (event.origin !== YOUTUBE_PLAYER_ORIGIN || event.source !== this.playerBridge?.frame?.contentWindow) return;
            let message = event.data;
            if (typeof message === 'string') {
                try { message = JSON.parse(message); } catch { return; }
            }
            if (!message || typeof message !== 'object') return;
            const wasReady = this.playerBridge.ready;
            const previousPlayerState = this.playerBridge.playerState;
            if (message.event === 'onReady') this.playerBridge.ready = true;
            if (message.event === 'onStateChange') {
                this.playerBridge.ready = true;
                this.playerBridge.playerState = Number(message.info ?? message.data);
            }
            if (message.event === 'infoDelivery' && message.info && typeof message.info === 'object') {
                const info = message.info;
                this.playerBridge.ready = true;
                if (Number.isFinite(Number(info.currentTime))) this.playerBridge.currentTime = Number(info.currentTime);
                if (Number.isFinite(Number(info.duration))) this.playerBridge.duration = Number(info.duration);
                if (Number.isFinite(Number(info.playbackRate))) this.playerBridge.playbackRate = Number(info.playbackRate);
                if (Number.isFinite(Number(info.playerState))) this.playerBridge.playerState = Number(info.playerState);
                if (Array.isArray(info.availablePlaybackRates) && info.availablePlaybackRates.length) {
                    this.playerBridge.availableRates = info.availablePlaybackRates.map(Number).filter(Number.isFinite);
                }
            }
            if (previousPlayerState !== 1 && this.playerBridge.playerState === 1 && this.currentVideo) {
                void this._recordWatchHistory(this.currentVideo);
            }
            if (!wasReady && this.playerBridge.ready) {
                if (this.playerBridgeTimer) window.clearInterval(this.playerBridgeTimer);
                this.playerBridgeTimer = 0;
                ['getCurrentTime', 'getDuration', 'getPlaybackRate', 'getAvailablePlaybackRates'].forEach(func => {
                    this._postPlayerMessage({ event: 'command', func, args: [] });
                });
                this._applyAutoPlaybackRate();
            } else if (message.event === 'onStateChange' && this.playerBridge.autoRatePending) {
                this._applyAutoPlaybackRate();
            }
            this._schedulePlayerControlUpdate();
        }

        _schedulePlayerControlUpdate() {
            if (this.playerControlUpdateFrame) return;
            this.playerControlUpdateFrame = window.requestAnimationFrame(() => {
                this.playerControlUpdateFrame = 0;
                this._updatePlayerControls();
            });
        }

        _updatePlayerControls(previewTime = null) {
            const bridge = this.playerBridge;
            if (!bridge) return;
            const progress = this.stage.querySelector('[data-yt-player-progress]');
            const time = this.stage.querySelector('[data-yt-player-time]');
            const status = this.stage.querySelector('[data-yt-player-status]');
            const duration = Math.max(0, bridge.duration);
            const currentTime = previewTime === null ? bridge.currentTime : previewTime;
            if (progress) {
                const max = String(Math.max(1, duration));
                const disabled = !bridge.ready || duration <= 0;
                const value = Math.min(Math.max(0, currentTime), Math.max(1, duration));
                if (progress.max !== max) progress.max = max;
                if (progress.disabled !== disabled) progress.disabled = disabled;
                if ((!this.playerProgressDragging || previewTime !== null) && Math.abs(Number(progress.value) - value) >= 0.25) progress.value = String(value);
            }
            const timeLabel = `${formatPlaybackTime(currentTime)} / ${formatPlaybackTime(duration)}`;
            if (time && time.textContent !== timeLabel) time.textContent = timeLabel;
            this.stage.querySelectorAll('[data-yt-player-action]').forEach(button => {
                if (button.disabled === bridge.ready) button.disabled = !bridge.ready;
            });
            this.stage.querySelectorAll('[data-yt-player-action="rate"]').forEach(button => {
                const rate = Number(button.dataset.rate);
                const hidden = !bridge.availableRates.includes(rate);
                const pressed = String(Math.abs(rate - bridge.playbackRate) < 0.01);
                if (button.hidden !== hidden) button.hidden = hidden;
                if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
            });
            const statusLabel = bridge.ready ? '快捷键：J/L ±10s · K 播放暂停 · ←/→ ±5s' : '正在连接快捷控制…';
            if (status && status.textContent !== statusLabel) status.textContent = statusLabel;
        }

        _handlePlayerProgressInput(event) {
            if (!event.target.matches('[data-yt-player-progress]') || !this.playerBridge) return;
            this.playerProgressDragging = true;
            const seconds = Number(event.target.value);
            this._updatePlayerControls(seconds);
        }

        _handlePlayerProgressChange(event) {
            if (!event.target.matches('[data-yt-player-progress]') || !this.playerBridge) return;
            const seconds = Number(event.target.value);
            this.playerBridge.currentTime = seconds;
            this.playerProgressDragging = false;
            this._postPlayerMessage({ event: 'command', func: 'seekTo', args: [seconds, true] });
            this._updatePlayerControls();
        }

        _seekPlayerBy(delta) {
            if (!this.playerBridge?.ready) return;
            const seconds = Math.min(Math.max(0, this.playerBridge.currentTime + delta), this.playerBridge.duration || Number.MAX_SAFE_INTEGER);
            this.playerBridge.currentTime = seconds;
            this._postPlayerMessage({ event: 'command', func: 'seekTo', args: [seconds, true] });
            this._updatePlayerControls();
        }

        _setPlayerRate(rate) {
            if (!this.playerBridge?.ready || !Number.isFinite(rate)) return;
            this.playerBridge.autoRatePending = false;
            this.playerBridge.playbackRate = rate;
            this._postPlayerMessage({ event: 'command', func: 'setPlaybackRate', args: [rate] });
            this._schedulePlayerControlUpdate();
        }

        _applyAutoPlaybackRate() {
            if (!this.playerBridge?.ready) return;
            this.playerBridge.autoRatePending = false;
            this.playerBridge.playbackRate = AUTO_PLAYBACK_RATE;
            this._postPlayerMessage({ event: 'command', func: 'setPlaybackRate', args: [AUTO_PLAYBACK_RATE] });
            this._schedulePlayerControlUpdate();
        }

        _handlePlayerAction(action, rate) {
            if (action === 'back-10') this._seekPlayerBy(-10);
            if (action === 'forward-10') this._seekPlayerBy(10);
            if (action === 'rate') this._setPlayerRate(Number(rate));
        }

        _handlePlayerShortcut(event) {
            const key = String(event.key || '').toLowerCase();
            if (key === 'j') this._seekPlayerBy(-10);
            else if (key === 'l') this._seekPlayerBy(10);
            else if (event.key === 'ArrowLeft') this._seekPlayerBy(-5);
            else if (event.key === 'ArrowRight') this._seekPlayerBy(5);
            else if (key === 'k') this._postPlayerMessage({ event: 'command', func: this.playerBridge?.playerState === 1 ? 'pauseVideo' : 'playVideo', args: [] });
            else if (event.shiftKey && ['<', '>'].includes(event.key)) {
                const rates = this.playerBridge?.availableRates || DEFAULT_PLAYBACK_RATES;
                const current = this.playerBridge?.playbackRate || 1;
                const index = Math.max(0, rates.findIndex(rate => rate >= current));
                const nextIndex = event.key === '>' ? Math.min(rates.length - 1, index + 1) : Math.max(0, index - 1);
                this._setPlayerRate(rates[nextIndex]);
            } else return false;
            event.preventDefault();
            return true;
        }

        _capturePlayerOrigin() {
            if (!this.listContext) return null;
            const { items, title, local, options } = this.listContext;
            return {
                items: [...items],
                title,
                local,
                options: { ...options },
                label: options.playerReturnLabel || title,
                activeView: this.activeView,
                businessPage: options.businessPage || this._pageForView(this.activeView),
                scrollTop: this.panel.querySelector('.yt-content')?.scrollTop || 0,
            };
        }

        _playerContextControls() {
            const returnControl = this.playerOrigin
                ? `<button type="button" data-yt-action="return-list"><i class="fas fa-arrow-left"></i><span>返回「${escapeHtml(this.playerOrigin.label)}」的视频列表</span></button>`
                : '';
            const channelUrl = normalizeYouTubeChannelUrl(this.currentVideo?.channelUrl)
                || normalizeYouTubeChannelUrl(this.currentVideo?.channelId ? `https://www.youtube.com/channel/${this.currentVideo.channelId}` : '');
            const channelLabel = this.currentVideo?.channel && this.currentVideo.channel !== '通过链接打开'
                ? `进入「${escapeHtml(this.currentVideo.channel)}」的频道主页`
                : '进入创作者频道主页';
            const creatorControl = `<button type="button" class="yt-creator-home${channelUrl ? '' : ' is-fallback'}" data-yt-action="creator-home" data-yt-creator-home ${this.currentVideo?.channel || channelUrl ? '' : 'disabled'}><i class="fas fa-user-circle"></i><span>${channelUrl || this.currentVideo?.channel ? channelLabel : '创作者主页暂不可用'}</span></button>`;
            return `<div class="yt-player-context">${returnControl}${creatorControl}</div>`;
        }

        _playerRecentMarkup() {
            return `<section class="yt-player-recent" data-yt-player-recent aria-label="当前频道最近发布的视频">
                <header><div><span class="yt-eyebrow">FRESH FROM CHANNEL</span><strong>最近发布</strong></div><div><button type="button" data-yt-action="refresh-player-recent" title="刷新最近发布" aria-label="刷新最近发布"><i class="fas fa-sync-alt"></i></button><button type="button" data-yt-action="creator-home"><i class="fas fa-th-large"></i> 查看全部</button></div></header>
                <div class="yt-recent-state"><span class="yt-recent-spinner"></span>正在加载当前频道的最近发布…</div>
            </section>`;
        }

        _renderPlayerRecent(state = 'ready', message = '') {
            const rail = this.stage?.querySelector('[data-yt-player-recent]');
            if (!rail || !this.currentVideo) return;
            const channel = this.currentVideo.channel || '当前频道';
            const header = `<header><div><span class="yt-eyebrow">FRESH FROM CHANNEL</span><strong>${escapeHtml(channel)} · 最近发布</strong></div><div><button type="button" data-yt-action="refresh-player-recent" title="刷新最近发布" aria-label="刷新 ${escapeHtml(channel)} 的最近发布"><i class="fas fa-sync-alt"></i></button><button type="button" data-yt-action="creator-home"><i class="fas fa-th-large"></i> 查看全部</button></div></header>`;
            if (state === 'loading') {
                rail.innerHTML = `${header}<div class="yt-recent-state"><span class="yt-recent-spinner"></span>正在加载最近发布…</div>`;
                return;
            }
            if (!this.playerRecentItems.length) {
                rail.innerHTML = `${header}<div class="yt-recent-state"><i class="fas fa-info-circle"></i>${escapeHtml(message || '暂时没有可展示的视频')}</div>`;
                return;
            }
            const cards = this.playerRecentItems.map(item => {
                const active = item.id === this.currentVideo?.id;
                const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('zh-CN') : '最近发布';
                return `<button type="button" class="yt-recent-card${active ? ' active' : ''}" data-yt-recent-id="${item.id}" aria-current="${active ? 'true' : 'false'}" aria-label="${active ? '正在播放' : '切换播放'} ${escapeHtml(item.title)}">
                    <span class="yt-recent-thumb"><img src="${escapeHtml(item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`)}" alt="" loading="lazy" referrerpolicy="no-referrer"><i class="fas fa-${active ? 'volume-up' : 'play'}"></i></span>
                    <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(date)}</small></span>
                </button>`;
            }).join('');
            rail.innerHTML = `${header}<div class="yt-recent-track">${cards}</div>`;
        }

        async _loadPlayerRecentVideos(force = false) {
            const video = this.currentVideo;
            if (!video) return;
            const lookup = getYouTubeChannelLookup(video);
            const channelKey = String(video.channelId || video.channelUrl || video.channel || '');
            if (!this.auth.connected || !lookup) {
                this.playerRecentItems = [];
                this.playerRecentChannelKey = channelKey;
                this._renderPlayerRecent('empty', this.auth.connected
                    ? '暂时无法识别频道，仍可进入创作者主页查看'
                    : '连接 YouTube 后可加载这个频道的最近发布');
                return;
            }
            if (!force && channelKey && channelKey === this.playerRecentChannelKey && this.playerRecentItems.length) {
                this._renderPlayerRecent();
                return;
            }

            const requestId = ++this.playerRecentRequestId;
            this.playerRecentChannelKey = channelKey;
            this.playerRecentItems = [];
            this._renderPlayerRecent('loading');
            const channelResponse = await sendMessage({
                action: 'youtube_api', resource: 'channels',
                params: { part: 'contentDetails', ...lookup, maxResults: 1 },
            });
            if (requestId !== this.playerRecentRequestId || this.currentVideo?.id !== video.id) return;
            const uploadsId = channelResponse.ok
                ? channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
                : '';
            const uploadsResponse = uploadsId ? await sendMessage({
                action: 'youtube_api', resource: 'playlistItems',
                params: { part: 'snippet,contentDetails', playlistId: uploadsId, maxResults: 8 },
            }) : channelResponse;
            if (requestId !== this.playerRecentRequestId || this.currentVideo?.channelId !== video.channelId && this.currentVideo?.channelUrl !== video.channelUrl) return;
            if (!uploadsResponse?.ok) {
                this.playerRecentItems = [];
                this._renderPlayerRecent('empty', uploadsResponse?.error?.message || '最近发布加载失败，请稍后重试');
                return;
            }
            this.playerRecentItems = this._normalizeItems(uploadsResponse.data.items || []);
            this._renderPlayerRecent('ready', '该频道暂无可显示的公开视频');
        }

        _updatePlayerVideoMeta() {
            if (!this.currentVideo) return;
            const title = this.stage.querySelector('[data-yt-current-title]');
            const channel = this.stage.querySelector('[data-yt-current-channel]');
            const frame = this.stage.querySelector('.yt-player-frame');
            if (title) title.textContent = this.currentVideo.title || 'YouTube 视频';
            if (channel) channel.textContent = this.currentVideo.channel || 'YouTube';
            if (frame) frame.title = this.currentVideo.title || 'YouTube 视频';
        }

        async _switchRecentVideo(item) {
            if (!item?.id || item.id === this.currentVideo?.id) return;
            if (!this.playerBridge?.ready) {
                await this._play(item, this.playerOrigin);
                return;
            }
            this.remoteRequestId++;
            this.currentVideo = { ...item };
            this.historyRecordedVideoId = '';
            this.playerBridge.currentTime = 0;
            this.playerBridge.duration = 0;
            this.playerBridge.playbackRate = AUTO_PLAYBACK_RATE;
            this.playerBridge.playerState = -1;
            this.playerBridge.autoRatePending = true;
            this._postPlayerMessage({ event: 'command', func: 'loadVideoById', args: [item.id, 0] });
            this._updatePlayerVideoMeta();
            this._renderPlayerRecent();
            this._schedulePlayerControlUpdate();
            this._setStatus(`已切换到 ${item.title}`);
        }

        async _hydrateVideoDetails(item) {
            const channelUrl = normalizeYouTubeChannelUrl(item.channelUrl)
                || normalizeYouTubeChannelUrl(item.channelId ? `https://www.youtube.com/channel/${item.channelId}` : '');
            if (channelUrl && item.title !== 'YouTube 视频' && item.channel !== '通过链接打开') {
                return { ...item, channelUrl };
            }
            try {
                const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`;
                const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
                const response = await fetch(endpoint, { credentials: 'omit', referrerPolicy: 'no-referrer' });
                if (!response.ok) return { ...item, channelUrl };
                const data = await response.json();
                return {
                    ...item,
                    title: data.title || item.title,
                    channel: data.author_name || item.channel,
                    channelUrl: normalizeYouTubeChannelUrl(data.author_url) || channelUrl,
                    thumbnail: data.thumbnail_url || item.thumbnail,
                };
            } catch {
                return { ...item, channelUrl };
            }
        }

        _creatorHeroMarkup(creator = {}) {
            const officialUrl = normalizeYouTubeChannelUrl(creator.channelUrl);
            const stats = [
                creator.subscriberCount ? `<span><strong>${Number(creator.subscriberCount).toLocaleString('zh-CN')}</strong> 订阅者</span>` : '',
                creator.videoCount ? `<span><strong>${Number(creator.videoCount).toLocaleString('zh-CN')}</strong> 个视频</span>` : '',
                creator.viewCount ? `<span><strong>${Number(creator.viewCount).toLocaleString('zh-CN')}</strong> 次观看</span>` : '',
            ].filter(Boolean).join('');
            const returnPlayer = this.creatorEntry
                ? '<button type="button" data-yt-action="creator-return-player"><i class="fas fa-arrow-left"></i> 返回播放器</button>'
                : '';
            const officialLink = officialUrl
                ? `<a href="${officialUrl}" target="_blank" rel="noopener noreferrer"><i class="fab fa-youtube"></i> 原站主页</a>`
                : '';
            return `<section class="yt-channel-hero" aria-label="${escapeHtml(creator.title || '创作者')}频道主页">
                <div class="yt-channel-avatar">${creator.thumbnail ? `<img src="${escapeHtml(creator.thumbnail)}" alt="" referrerpolicy="no-referrer">` : '<i class="fas fa-user-circle" aria-hidden="true"></i>'}</div>
                <div class="yt-channel-copy"><span class="yt-eyebrow">CREATOR · HOME</span><h3>${escapeHtml(creator.title || 'YouTube 创作者')}</h3><p>${escapeHtml(creator.description || '在当前工作台继续浏览这位创作者的内容。')}</p>${stats ? `<div class="yt-channel-stats">${stats}</div>` : ''}</div>
                <div class="yt-channel-actions">${returnPlayer}${officialLink}</div>
            </section>`;
        }

        async _openCreatorHome() {
            const sourceVideo = this.currentVideo;
            if (!sourceVideo) return;
            const requestId = ++this.remoteRequestId;
            this.creatorEntry = { item: { ...sourceVideo }, origin: this.playerOrigin };
            this._detachPlayerBridge();
            this.currentVideo = null;
            this.playerOrigin = null;
            this.activeView = 'channel';
            this.listContext = null;
            this._syncNav();
            window.ProductUIV5?.setBusinessPage?.('youtube', 'subscriptions');
            this.panel.querySelector('.yt-view-title').textContent = '创作者主页';
            this._renderLoading('正在加载创作者主页…');

            let creator = {
                id: sourceVideo.channelId || '',
                title: sourceVideo.channel || 'YouTube 创作者',
                description: '',
                thumbnail: '',
                channelUrl: normalizeYouTubeChannelUrl(sourceVideo.channelUrl)
                    || normalizeYouTubeChannelUrl(sourceVideo.channelId ? `https://www.youtube.com/channel/${sourceVideo.channelId}` : ''),
                subscriberCount: '', videoCount: '', viewCount: '',
            };
            let videos = [sourceVideo];
            let note = this.auth.connected ? '暂时只能显示当前视频' : '连接 YouTube 后可加载该频道的最近更新';
            const lookup = getYouTubeChannelLookup(sourceVideo);
            if (this.auth.connected && lookup) {
                const channelResponse = await sendMessage({
                    action: 'youtube_api',
                    resource: 'channels',
                    params: { part: 'snippet,contentDetails,statistics,brandingSettings', ...lookup, maxResults: 1 },
                });
                if (requestId !== this.remoteRequestId) return;
                const channel = channelResponse.ok ? channelResponse.data.items?.[0] : null;
                if (channel) {
                    creator = {
                        id: channel.id || creator.id,
                        title: channel.snippet?.title || creator.title,
                        description: channel.snippet?.description || '',
                        thumbnail: channel.snippet?.thumbnails?.high?.url || channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || '',
                        channelUrl: normalizeYouTubeChannelUrl(`https://www.youtube.com/channel/${channel.id}`) || creator.channelUrl,
                        subscriberCount: channel.statistics?.hiddenSubscriberCount ? '' : (channel.statistics?.subscriberCount || ''),
                        videoCount: channel.statistics?.videoCount || '',
                        viewCount: channel.statistics?.viewCount || '',
                    };
                    const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
                    if (uploadsId) {
                        const uploadsResponse = await sendMessage({
                            action: 'youtube_api', resource: 'playlistItems',
                            params: { part: 'snippet,contentDetails', playlistId: uploadsId, maxResults: 24 },
                        });
                        if (requestId !== this.remoteRequestId) return;
                        if (uploadsResponse.ok) {
                            videos = this._normalizeItems(uploadsResponse.data.items || []);
                            note = videos.length ? `最近更新 · ${videos.length} 个视频` : '该频道暂无可显示的公开视频';
                        }
                    }
                }
            }
            if (requestId !== this.remoteRequestId) return;
            this.items = videos;
            this._renderList(videos, creator.title, false, {
                businessPage: 'subscriptions',
                playerReturnLabel: `${creator.title}频道主页`,
                note,
                creatorHome: creator,
            });
            this._setStatus(`已进入${creator.title}的频道主页`);
        }

        async _returnToCreatorPlayer() {
            const entry = this.creatorEntry;
            if (!entry) return;
            this.creatorEntry = null;
            await this._play(entry.item, entry.origin);
        }

        _returnToPlayerOrigin() {
            const origin = this.playerOrigin;
            if (!origin) return;
            this._detachPlayerBridge();
            this.currentVideo = null;
            this.playerOrigin = null;
            this.activeView = origin.activeView;
            this._syncNav();
            window.ProductUIV5?.setBusinessPage?.('youtube', origin.businessPage);
            this._renderList(origin.items, origin.title, origin.local, origin.options);
            requestAnimationFrame(() => {
                const content = this.panel.querySelector('.yt-content');
                if (content) content.scrollTop = origin.scrollTop;
            });
            this._setStatus(`已返回${origin.label}`);
        }

        async _play(item, origin = null) {
            if (!VIDEO_ID_PATTERN.test(item.id)) return;
            const requestId = ++this.remoteRequestId;
            this.busy = false;
            this._detachPlayerBridge();
            this.playerOrigin = origin;
            this.currentVideo = { ...item };
            this.historyRecordedVideoId = '';
            window.ProductUIV5?.setBusinessPage?.('youtube', 'player');
            this.panel.querySelector('.yt-view-title').textContent = '播放器';
            this._renderLoading('正在识别视频与创作者…');
            this.currentVideo = await this._hydrateVideoDetails(this.currentVideo);
            if (requestId !== this.remoteRequestId || this.currentVideo?.id !== item.id) return;
            const identity = await sendMessage({ action: 'youtube_prepare_player' }, 5_000);
            if (this.currentVideo?.id !== item.id) return;
            if (!identity.ok) {
                const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`;
                this.stage.innerHTML = `${this._playerContextControls()}<div class="yt-empty"><i class="fab fa-youtube"></i><h3>当前扩展无法标识播放器来源</h3><p>为避免显示无效的错误 153 播放器，请先在 YouTube 原站观看。重新加载扩展后可再次尝试。</p><a class="yt-primary" href="${watchUrl}" target="_blank" rel="noopener noreferrer">在 YouTube 打开</a></div>`;
                this._setStatus('播放器客户端标识配置失败');
                return;
            }
            const src = `https://www.youtube.com/embed/${encodeURIComponent(item.id)}?autoplay=0&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
            this.stage.innerHTML = `
                <div class="yt-player-layout">
                    <section class="yt-player-column">
                        ${this._playerContextControls()}
                        <div class="yt-frame-wrap"><iframe id="yt-player-frame" class="yt-player-frame" src="${src}" title="${escapeHtml(this.currentVideo.title)}" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>
                        ${this._playerRecentMarkup()}
                        ${this._playerControlsMarkup()}
                        <div class="yt-player-meta"><div><span class="yt-eyebrow">NOW PLAYING</span><h2 data-yt-current-title>${escapeHtml(this.currentVideo.title)}</h2><p data-yt-current-channel>${escapeHtml(this.currentVideo.channel || 'YouTube')}</p></div><div class="yt-actions"><button type="button" data-yt-action="add-queue"><i class="far fa-clock"></i> 稍后看</button><button type="button" data-yt-action="add-learning"><i class="fas fa-graduation-cap"></i> 学习清单</button><button type="button" data-yt-action="copy"><i class="far fa-copy"></i> 复制链接</button><button type="button" data-yt-action="open"><i class="fas fa-external-link-alt"></i> 原站打开</button></div></div>
                    </section>
                </div>`;
            this._attachPlayerBridge(this.stage.querySelector('.yt-player-frame'));
            this._loadPlayerRecentVideos();
            this._setStatus('官方播放器已就绪');
        }

        _renderActiveView() {
            this._syncNav();
            if (['history', 'local-queue', 'learning'].includes(this.activeView)) {
                if (this.activeView === 'history') {
                    this.items = [...this.history];
                    this._renderList(this.items, '本地观看历史', true, {
                        localType: 'history',
                        dateField: 'watchedAt',
                        playerReturnLabel: '观看历史',
                        note: `仅记录扩展内实际开始播放的视频 · 最多 ${WATCH_HISTORY_LIMIT} 条`,
                        emptyTitle: '还没有观看记录',
                        emptyDescription: '在本工作台开始播放视频后，会自动记录到这里。',
                    });
                } else {
                    this.items = this.activeView === 'local-queue' ? [...this.queue] : [...this.learning];
                    this._renderList(this.items, this.activeView === 'local-queue' ? '本地稍后看' : '本地学习清单', true);
                }
            } else if (!this.auth.connected) this._renderConnect(this.activeView);
            else this._showView(this.activeView, true);
        }

        _renderConnect(view) {
            const configured = this.auth.configured;
            const extensionId = this.auth.extensionId || chrome.runtime?.id || '请在 chrome://extensions 中查看';
            const label = { recommended: '为你推荐', trending: '兴趣趋势', subscriptions: '订阅', playlists: '播放列表', likes: '喜欢的视频' }[view] || 'YouTube';
            this.panel.querySelector('.yt-view-title').textContent = label;
            const setup = configured ? '' : `<ol class="yt-setup-steps"><li>在 Google Cloud 启用 YouTube Data API v3</li><li>配置 OAuth 权限请求页面</li><li>创建 Chrome 扩展客户端并绑定 <code>${escapeHtml(extensionId)}</code></li><li>把 client_id 写入 manifest 后重新加载扩展</li></ol>`;
            this.stage.innerHTML = `<div class="yt-connect-state"><div class="yt-connect-copy"><span class="yt-eyebrow">${configured ? 'READ ONLY ACCESS' : 'OAUTH SETUP REQUIRED'}</span><h3>${configured ? '连接 Google 账号以加载你的 YouTube 数据' : '当前扩展尚未配置 Google OAuth'}</h3><p>${configured ? '只申请 YouTube 只读权限。订阅、播放列表与喜欢的视频不会被修改。' : '你登录 YouTube 网页，只代表浏览器持有 youtube.com Cookie；扩展不会读取该 Cookie，必须单独配置并完成 Google OAuth 授权。'}</p>${setup}<div class="yt-connect-actions"><button class="yt-primary" type="button" data-yt-action="connect">${configured ? '连接 YouTube' : '查看当前配置'}</button><button class="yt-secondary" type="button" data-youtube-view="local-queue">打开本地稍后看</button></div></div><div class="yt-direct-card"><strong>直接播放</strong><p>粘贴 youtube.com/watch、youtu.be、Shorts 链接或视频 ID。</p><form class="yt-direct-form"><label for="yt-direct-input">视频链接或 ID</label><div><input id="yt-direct-input" autocomplete="off" placeholder="https://youtu.be/…"><button type="submit">播放</button></div></form><small>不读取浏览器 YouTube Cookie；观看记录仅保存在本扩展，不同步 YouTube 官方历史。</small><button class="yt-data-clear" type="button" data-yt-action="clear-local"><i class="far fa-trash-alt"></i> 清空 YouTube 本地数据</button></div></div>`;
            const form = this.stage.querySelector('.yt-direct-form');
            form?.addEventListener('submit', event => {
                event.preventDefault();
                this._handleSearch(this.stage.querySelector('#yt-direct-input').value);
            });
        }

        _renderList(items, title, local = false, options = {}) {
            this.panel.querySelector('.yt-view-title').textContent = title;
            this.listContext = { items, title, local, options };
            const prelude = `${options.creatorHome ? this._creatorHeroMarkup(options.creatorHome) : ''}${options.trendCategories ? this._trendCategoriesMarkup() : ''}${options.trendMix ? this._trendMixMarkup(options.trendMix) : ''}`;
            const toolbar = `<div class="yt-list-toolbar"><div class="yt-list-context">${options.backView ? `<button type="button" data-youtube-view="${escapeHtml(options.backView)}"><i class="fas fa-arrow-left"></i> 返回</button>` : ''}${options.showSubscriptionUpdates ? '<button type="button" data-yt-action="subscription-updates"><i class="far fa-clock"></i> 最近更新</button>' : ''}${options.note ? `<span>${escapeHtml(options.note)}</span>` : ''}</div><div class="yt-layout-switch" role="group" aria-label="内容布局"><button type="button" data-yt-action="layout-grid" aria-label="方框布局" aria-pressed="${this.layout === 'grid'}" title="方框布局"><i class="fas fa-th-large"></i></button><button type="button" data-yt-action="layout-list" aria-label="列表布局" aria-pressed="${this.layout === 'list'}" title="列表布局"><i class="fas fa-list"></i></button></div></div>`;
            if (!items.length) {
                const emptyTitle = options.emptyTitle || (local ? '清单还是空的' : '暂无可显示内容');
                const emptyDescription = options.emptyDescription || (local ? '播放任意视频后，可加入稍后看或学习清单。' : '请稍后重试，或粘贴链接直接播放。');
                this.stage.innerHTML = `${prelude}${toolbar}<div class="yt-empty"><i class="${local ? 'far fa-bookmark' : 'fas fa-inbox'}"></i><h3>${escapeHtml(emptyTitle)}</h3><p>${escapeHtml(emptyDescription)}</p></div>`;
                return;
            }
            this.stage.innerHTML = `${prelude}${toolbar}<div class="yt-grid ${this.layout === 'list' ? 'is-list' : 'is-grid'}" role="list">${items.map(item => {
                const isVideo = item.kind === 'video';
                const isChannel = item.kind === 'channel';
                const isPlaylist = item.kind === 'playlist';
                const dateValue = options.dateField ? item[options.dateField] : item.publishedAt;
                const date = dateValue ? new Date(dateValue).toLocaleDateString('zh-CN') : '';
                const verb = isVideo ? '播放' : (isChannel ? '查看频道最近更新' : (isPlaylist ? '打开播放列表' : '查看'));
                const circleBadge = item.trendCircleLabel ? `<span class="yt-circle-badge" data-circle="${escapeHtml(item.trendCircle)}">${escapeHtml(item.trendCircleLabel)}</span>` : '';
                const thumbnail = `${item.thumbnail ? `<img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="yt-card-placeholder"><i class="fab fa-youtube"></i></span>'}${circleBadge}${isVideo ? '<span class="yt-play-badge"><i class="fas fa-play"></i></span>' : ((isChannel || isPlaylist) ? '<span class="yt-play-badge"><i class="fas fa-arrow-right"></i></span>' : '')}`;
                const media = isVideo
                    ? `<button class="yt-card-media" type="button" data-yt-play="${item.id}" aria-label="${verb} ${escapeHtml(item.title)}">${thumbnail}</button>`
                    : `<div class="yt-card-media">${thumbnail}</div>`;
                const cardTarget = isChannel
                    ? `data-yt-channel="${item.id}"`
                    : (isPlaylist ? `data-yt-playlist="${item.id}"` : 'disabled');
                const cardOpen = isVideo ? '' : `<button class="yt-card-open" type="button" ${cardTarget} aria-label="${verb} ${escapeHtml(item.title)}"></button>`;
                const localType = options.localType || (this.activeView === 'learning' ? 'learning' : 'queue');
                return `<article class="yt-card" role="listitem">${media}<div class="yt-card-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.channel)}${date ? ` · ${date}` : ''}</span></div>${isVideo ? `<div class="yt-card-actions"><button type="button" data-yt-action="${local ? `remove-${localType}` : 'add-queue'}" data-video-id="${item.id}" title="${local ? '从列表移除' : '加入稍后看'}" aria-label="${local ? `从列表移除 ${escapeHtml(item.title)}` : `将 ${escapeHtml(item.title)} 加入稍后看`}"><i class="${local ? 'fas fa-times' : 'far fa-clock'}"></i></button><button type="button" data-yt-action="open" data-video-id="${item.id}" title="在 YouTube 打开" aria-label="在 YouTube 打开 ${escapeHtml(item.title)}"><i class="fas fa-external-link-alt"></i></button></div>` : cardOpen}</article>`;
            }).join('')}</div>`;
        }

        _trendCategoriesMarkup() {
            return `<section class="yt-interest-filter" aria-labelledby="yt-interest-filter-title"><div><span class="yt-eyebrow">YOUR INTERESTS</span><strong id="yt-interest-filter-title">跨圈层兴趣趋势</strong><small>每轮目标配比：中华文化圈 40% · 欧美 30% · 泛亚 30%。</small></div><div class="yt-interest-chips" role="group" aria-label="趋势兴趣分类">${TREND_CATEGORIES.map(category => `<button type="button" data-yt-action="trend-category" data-category-id="${category.id}" aria-pressed="${category.id === this.trendCategoryId}"><i class="${category.icon}"></i>${category.label}</button>`).join('')}</div></section>`;
        }

        _trendMixMarkup(mix = {}) {
            const completed = new Set(mix.completedCircleIds || []);
            const failed = new Set(mix.failedCircleIds || []);
            return `<section class="yt-trend-mix" aria-label="圈层内容加载进度"><header><div><span class="yt-eyebrow">CULTURE MIX</span><strong>圈层配比 4 : 3 : 3</strong></div><small>分层加载，已完成的内容会立即展示 · HD 非直播 · 4 分钟以上 · 已过滤 Shorts</small></header><div class="yt-trend-mix-grid">${TREND_CIRCLES.map(circle => {
                const state = failed.has(circle.id) ? 'failed' : (mix.activeCircleId === circle.id ? 'loading' : (completed.has(circle.id) ? 'ready' : 'pending'));
                const stateLabel = { failed: '暂不可用', loading: '加载中', ready: '已完成', pending: '等待中' }[state];
                return `<div class="yt-trend-mix-item is-${state}" data-circle="${circle.id}"><span>${circle.label}<small>${stateLabel}</small></span><strong>${Number(mix.counts?.[circle.id] || 0)} / ${circle.target}</strong></div>`;
            }).join('')}</div></section>`;
        }

        async _setLayout(layout) {
            if (!LAYOUTS.has(layout) || layout === this.layout) return;
            this.layout = layout;
            this.settings = { ...this.settings, layout };
            await storageSet({ [STORAGE_KEYS.settings]: this.settings });
            if (this.listContext) {
                const { items, title, local, options } = this.listContext;
                this._renderList(items, title, local, options);
            }
            this._setStatus(layout === 'list' ? '已切换为列表布局' : '已切换为方框布局');
        }

        async _setTrendCategory(categoryId) {
            if (!TREND_CATEGORIES.some(category => category.id === categoryId) || categoryId === this.trendCategoryId) return;
            this.trendCategoryId = categoryId;
            this.settings = { ...this.settings, trendCategoryId: categoryId, trendPreferenceVersion: TREND_PREFERENCE_VERSION };
            await storageSet({ [STORAGE_KEYS.settings]: this.settings });
            await this._showView('trending', true);
        }

        _renderError(error = {}, title) {
            const code = typeof error === 'string' ? error : (error.code || 'unknown');
            const messages = {
                'oauth-not-configured': '尚未配置 Google OAuth 客户端。开发者完成配置前，可继续使用链接播放和本地清单。',
                'auth-required': 'Google 授权未完成或已取消。',
                'auth-expired': '授权已过期，请重新连接。',
                'quota-exceeded': 'YouTube API 今日配额已用完。本地清单与直接播放仍可用。',
                'background-unavailable': '本地预览没有扩展后台服务。请在真实扩展环境完成账号联调。',
                'request-timeout': 'Google 授权窗口没有完成响应。请检查其他 Chrome 窗口或系统通行密钥提示，然后重试。',
            };
            this.panel.querySelector('.yt-view-title').textContent = '异常恢复';
            this.stage.innerHTML = `<div class="yt-error-state"><i class="fas fa-exclamation-circle"></i><span class="yt-eyebrow">${escapeHtml(code)}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(messages[code] || error.message || '请求未完成，请稍后重试。')}</p><div><button class="yt-primary" type="button" data-yt-action="retry">重试</button><button class="yt-secondary" type="button" data-youtube-view="local-queue">使用本地清单</button></div></div>`;
        }

        _renderLoading(label = '正在加载 YouTube 数据…') {
            this.stage.innerHTML = `<div class="yt-loading" role="status"><span></span><p>${escapeHtml(label)}</p></div>`;
        }

        _renderAccount() {
            if (!this.panel) return;
            const state = this.panel.querySelector('.yt-account-state');
            const button = this.panel.querySelector('.yt-connect');
            state.textContent = this.auth.connected ? '已连接 · 只读' : (this.auth.configured ? '待授权' : 'OAuth 未配置');
            button.textContent = this.auth.connected ? '断开' : (this.auth.configured ? '连接账号' : '查看配置');
            button.disabled = this.authBusy;
            if (this.authBusy) button.textContent = '连接中…';
            button.title = this.auth.connected
                ? '断开扩展保存的 Google OAuth 授权'
                : (this.auth.configured ? '发起 YouTube 只读授权' : '查看当前扩展 ID 与 OAuth 配置步骤');
        }

        _syncNav() {
            this.panel.querySelectorAll('[data-youtube-view]').forEach(button => {
                const selected = button.dataset.youtubeView === this.activeView;
                button.classList.toggle('active', selected);
                button.setAttribute('aria-current', selected ? 'page' : 'false');
            });
            this.panel.querySelector('[data-yt-count="queue"]').textContent = this.queue.length;
            this.panel.querySelector('[data-yt-count="learning"]').textContent = this.learning.length;
            this.panel.querySelector('[data-yt-count="history"]').textContent = this.history.length;
        }

        _pageForView(view) {
            if (view === 'recommended') return this.auth.connected ? 'recommended' : 'connect';
            if (view === 'subscriptions') return 'subscriptions';
            if (view === 'history' || view === 'local-queue' || view === 'learning') return 'local-queue';
            if (view === 'playlists' || view === 'likes') return 'library';
            return view === 'trending' ? (this.auth.connected ? 'trending' : 'connect') : 'connect';
        }

        _findItem(id) {
            return [...this.items, ...this.playerRecentItems, ...this.history, ...this.queue, ...this.learning].find(item => item.id === id) || null;
        }

        async _recordWatchHistory(item) {
            if (!item?.id || this.historyRecordedVideoId === item.id) return;
            this.historyRecordedVideoId = item.id;
            this.history = mergeWatchHistory(this.history, item);
            this._syncNav();
            try {
                await storageSet({ [STORAGE_KEYS.history]: this.history });
            } catch (error) {
                console.debug('YouTube 本地观看历史保存失败', error);
            }
        }

        async _addLocal(type, item) {
            const key = type === 'learning' ? 'learning' : 'queue';
            const list = key === 'learning' ? this.learning : this.queue;
            if (!list.some(entry => entry.id === item.id)) list.unshift({ ...item, savedAt: new Date().toISOString() });
            await storageSet({ [STORAGE_KEYS[key]]: list });
            this._syncNav();
            this._setStatus(key === 'learning' ? '已加入学习清单' : '已加入本地稍后看');
        }

        async _removeLocal(type, id) {
            const key = type === 'history' ? 'history' : (type === 'learning' ? 'learning' : 'queue');
            if (key === 'history') this.history = this.history.filter(item => item.id !== id);
            else if (key === 'learning') this.learning = this.learning.filter(item => item.id !== id);
            else this.queue = this.queue.filter(item => item.id !== id);
            const list = key === 'history' ? this.history : (key === 'learning' ? this.learning : this.queue);
            await storageSet({ [STORAGE_KEYS[key]]: list });
            this._renderActiveView();
            this._setStatus(key === 'history' ? '已从观看历史移除' : '已从本地清单移除');
        }

        async _prepareOrClearLocal(button) {
            const now = Date.now();
            if (now > this.clearLocalArmedUntil) {
                this.clearLocalArmedUntil = now + 5000;
                button.textContent = '再次点击确认清空';
                button.classList.add('is-armed');
                this._setStatus('将删除本地观看历史、稍后看、学习清单和 YouTube 偏好；5 秒内再次点击确认');
                setTimeout(() => {
                    if (!button.isConnected || Date.now() <= this.clearLocalArmedUntil) return;
                    button.innerHTML = '<i class="far fa-trash-alt"></i> 清空 YouTube 本地数据';
                    button.classList.remove('is-armed');
                }, 5100);
                return;
            }
            this.queue = [];
            this.learning = [];
            this.history = [];
            this.settings = {};
            this.trendCategoryId = DEFAULT_TREND_CATEGORY_ID;
            this.trendCache.clear();
            this.clearLocalArmedUntil = 0;
            await storageSet({
                [STORAGE_KEYS.queue]: [],
                [STORAGE_KEYS.learning]: [],
                [STORAGE_KEYS.history]: [],
                [STORAGE_KEYS.settings]: {},
            });
            this._syncNav();
            this._renderActiveView();
            this._setStatus('YouTube 本地数据已清空');
        }

        _setStatus(message, persistent = false) {
            const status = this.panel.querySelector('.yt-status');
            status.textContent = message;
            if (!persistent) setTimeout(() => { if (status.textContent === message) status.textContent = ''; }, 2400);
        }
    }

    window.YouTubeWorkbench = Object.freeze({ parseYouTubeVideoId, extractYouTubeVideoId, normalizeYouTubeChannelUrl, getYouTubeChannelLookup, parseIso8601DurationSeconds, isLongFormTrendVideo, mergeSearchVideoIds, selectHighQualityTrendVideos, mergeWatchHistory, STORAGE_KEYS });
    window.youtubeController = new YouTubeController();
})();
