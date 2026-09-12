/**
 * 音乐控制器模块 v3.17.0
 * UI 风格：Minimal Card（极简紧凑 + 滑动切换）— 基于 Demo 5
 * v3.0.0: 纯 API + Offscreen Document 独立播放器模式
 * v3.12.0: 音量浮层修复、发现全播、搜索队列、状态持久化、歌词防抖
 * v3.13.0: 音量浮层定位修正、歌单队列持久化（刷新不丢失）
 * v3.14.0: 队列列表UI优化（双行布局+喜欢按钮）、刷新后队列自动恢复
 * v3.15.0: 歌手操作台浮层（热门/专辑/相似）、歌曲加入队列能力、歌曲操作菜单
 * v3.16.0: 修复歌手专辑加载失败、搜索tab切换、搜索历史清除功能、搜索栏清除按钮
 * v3.17.0: 一键清空队列、单曲移除、智能跳过失效歌曲、睡眠定时器、队列计数
 * v3.18.0: 歌手/专辑交互导航（歌手名可点击、右键菜单增强、数据管线扩展）
 */
class MusicController {
    constructor() {
        this.isActive = false;
        this.platform = null;
        this.state = {
            isPlaying: false,
            title: '',
            artist: '',
            cover: '',
            currentTime: 0,
            duration: 0,
            volume: 1,
            lyricLine: '',
        };
        this._pollTimer = null;
        this._el = null;
        this._expanded = false;
        this._draggingProgress = false;
        this._draggingVolume = false;
        this._volumeFreezeUntil = 0;
        this._lastUpdateTs = 0;
        this._showLyric = true;
        this._volumeRestored = false;
        this._playlist = [];
        this._panelOpen = false;
        this._apiLoadingQueue = false;
        this._currentPlaylistId = null;
        this._currentPlaylistName = '';

        this._lyrics = [];
        this._lyricsTranslation = {};
        this._currentLyricIndex = -1;
        this._lyricSongId = null;
        this._recommendSongs = [];
        this._playMode = 'sequence';
        this._builtinAudio = null;
        this._builtinMode = false;
        this._currentSongId = null;
        this._shuffleQueue = [];
        this._shuffleIndex = -1;
        this._searchHistory = [];
        this._searchVer = 0;
        // 每次切歌都会递增。异步 URL/详情请求只允许最后一次切歌提交状态，
        // 防止连续点击“下一首”时旧请求晚到并覆盖当前歌曲。
        this._playRequestSeq = 0;

        // v3.18.0: 歌手/专辑导航栈 + 缓存
        this._artistNavStack = [];
        this._artistCache = new Map();

        // v3.0.0: Offscreen 独立播放器模式
        this._offscreenMode = false;
        this._loggedIn = false;
        this._userProfile = null;
    }

    async init() {
        await this._restoreVolume();
        await this._restorePlayMode();
        this.injectDOM();
        this.bindEvents();
        this._listenMessages();
        await this._restoreMusicState();
        const loginOk = await this._checkNeteaseLogin();
        if (loginOk) {
            this._offscreenMode = true;
            this._builtinMode = true;
            this.platform = 'netease';
            this.isActive = true;
            this._show();
            if (Array.isArray(this._playlist) && this._playlist.length > 0) {
                this._refreshPlaylist();
            }
            if (!this.state.title) {
                this._showMetaGuide('default');
                this._loadRecommended();
            }
        } else {
            this._showConnect();
        }
        this._startPolling();
        this._startProgressInterpolation();
        this._restoreSearchHistory();
        await this._restoreLastTab();
    }

    async _restoreMusicState() {
        try {
            const { lastMusicState, musicPlaylistCache } = await chrome.storage.local.get(['lastMusicState', 'musicPlaylistCache']);
            const stateAge = Date.now() - (lastMusicState?.savedAt || 0);
            const hasFreshMusicState = Boolean(lastMusicState?.title && stateAge < 30 * 60 * 1000);
            if (hasFreshMusicState) {
                this.state = { ...this.state, ...lastMusicState, isPlaying: false };
                this.platform = lastMusicState.platform || null;
                this._lastUpdateTs = Date.now();
                if (lastMusicState.songId != null) this._currentSongId = lastMusicState.songId;
            }
            if (musicPlaylistCache && Array.isArray(musicPlaylistCache.playlist) && musicPlaylistCache.playlist.length > 0) {
                const cacheAge = Date.now() - (musicPlaylistCache.savedAt || 0);
                if (cacheAge < 24 * 60 * 60 * 1000) {
                    this._playlist = musicPlaylistCache.playlist;
                    this._currentPlaylistId = musicPlaylistCache.playlistId || null;
                    this._currentPlaylistName = musicPlaylistCache.playlistName || '';
                    if (this._currentSongId != null) {
                        const activeSongId = String(this._currentSongId);
                        this._playlist.forEach(s => { s.isActive = (String(s.songId) === activeSongId); });
                    } else {
                        this._playlist.forEach(s => { s.isActive = false; });
                    }
                }
            }
        } catch { /* storage may not be available */ }
    }

    async _restoreVolume() {
        try {
            const { musicVolume } = await chrome.storage.local.get('musicVolume');
            if (typeof musicVolume === 'number' && musicVolume >= 0 && musicVolume <= 1) {
                this.state.volume = musicVolume;
                this._volumeRestored = true;
            }
        } catch { /* ignore */ }
    }

    async _saveVolume(vol) {
        try { await chrome.storage.local.set({ musicVolume: vol }); } catch { /* ignore */ }
    }

    _savePlaylistCache() {
        if (this._savePlaylistTimer) return;
        this._savePlaylistTimer = setTimeout(() => {
            this._savePlaylistTimer = null;
            try {
                const trimmed = (this._playlist || []).slice(0, 300).map(s => ({
                    title: s.title, artist: s.artist, songId: s.songId, index: s.index,
                    artists: s.artists || undefined, albumId: s.albumId || undefined,
                    album: s.album || undefined, cover: s.cover || undefined, duration: s.duration || undefined,
                }));
                chrome.storage.local.set({
                    musicPlaylistCache: {
                        playlist: trimmed,
                        playlistId: this._currentPlaylistId || null,
                        playlistName: this._currentPlaylistName || '',
                        savedAt: Date.now(),
                    }
                });
            } catch { /* ignore */ }
        }, 2000);
    }

    _recordLocalPlayHistory(song) {
        if (!song?.songId) return;
        try {
            chrome.storage.local.get('musicLocalPlayHistory', (data) => {
                const history = data?.musicLocalPlayHistory || [];
                const idx = history.findIndex(h => String(h.songId) === String(song.songId));
                if (idx >= 0) history.splice(idx, 1);
                history.unshift({
                    songId: song.songId,
                    title: song.title || '',
                    artist: song.artist || '',
                    artists: song.artists || [],
                    albumId: song.albumId || null,
                    cover: song.cover || '',
                    album: song.album || '',
                    playedAt: Date.now(),
                });
                chrome.storage.local.set({ musicLocalPlayHistory: history.slice(0, 200) });
            });
        } catch { /* ignore */ }
    }

    async _restorePlayMode() {
        try {
            const { musicPlayMode } = await chrome.storage.local.get('musicPlayMode');
            if (['sequence', 'loop', 'single', 'shuffle'].includes(musicPlayMode)) {
                this._playMode = musicPlayMode;
            }
        } catch { /* ignore */ }
    }

    async _savePlayMode(mode) {
        try { await chrome.storage.local.set({ musicPlayMode: mode }); } catch { /* ignore */ }
    }

    async _restoreSearchHistory() {
        try {
            const { musicSearchHistory } = await chrome.storage.local.get('musicSearchHistory');
            if (Array.isArray(musicSearchHistory)) {
                this._searchHistory = musicSearchHistory.slice(0, 10);
            }
        } catch { /* ignore */ }
    }

    async _saveSearchHistory() {
        try {
            await chrome.storage.local.set({ musicSearchHistory: this._searchHistory.slice(0, 10) });
        } catch { /* ignore */ }
    }

    // ===================== DOM =====================

    injectDOM() {
        const wrapper = document.querySelector('.time-wrapper');
        if (!wrapper) return;

        if (!window.MusicView?.create) {
            console.error('[MusicController] MusicView 未加载');
            return;
        }

        const { container, actionSheet, contextMenu } = window.MusicView.create();
        document.body.append(actionSheet, contextMenu, container);
        this._actionSheetEl = actionSheet;
        this._ctxMenuEl = contextMenu;
        this._el = container;
        this._initBuiltinAudio();
        this._initFloatingVolume();
        this._updateModeUI();
    }

    toggle() {
        if (!this._el) return;
        const isVisible = this._el.classList.contains('mc-dock-open');
        if (isVisible) {
            this._el.classList.remove('mc-dock-open');
        } else {
            this._el.classList.add('mc-dock-open');
            this._expanded = true;
            this._updatePanelExpand();
            const currentPage = window.ProductUIV5?.getState?.().musicPage || 'now-playing';
            const pageToTab = {
                'playlist-library': 'playlists', 'playlist-detail': 'queue',
                'lyrics-immersive': 'lyrics', 'discover-fm': 'discover',
                'artist-album': 'now-playing', 'connection-error': 'now-playing',
                'more-sleep-timer': 'now-playing',
            };
            this._switchTab(pageToTab[currentPage] || currentPage);
        }
    }

    _initFloatingVolume() {
        const floating = document.createElement('div');
        floating.className = 'mc-vol-floating hidden';
        floating.id = 'mc-vol-floating';
        floating.innerHTML = `
            <div class="mc-vol-pct" id="mc-vol-pct-f">100%</div>
            <div class="mc-vol-track">
                <div class="mc-vol-track-bg"></div>
                <div class="mc-vol-fill" id="mc-vol-fill-f"></div>
                <input type="range" class="mc-vol-input" id="mc-vol-input-f" min="0" max="100" value="100">
            </div>`;
        this._el.appendChild(floating);
        this._volFloating = floating;
    }

    _initBuiltinAudio() {
        this._builtinAudio = document.createElement('audio');
        this._builtinAudio.id = 'mc-builtin-audio';
        this._builtinAudio.preload = 'auto';
        this._builtinAudio.style.display = 'none';
        document.body.appendChild(this._builtinAudio);

        this._builtinAudio.addEventListener('ended', () => {
            if (!this._offscreenMode) this._onBuiltinTrackEnd();
        });
        this._builtinAudio.addEventListener('timeupdate', () => {
            if (this._builtinMode && !this._offscreenMode) {
                this.state.currentTime = this._builtinAudio.currentTime;
                this.state.duration = this._builtinAudio.duration || 0;
                this._lastUpdateTs = Date.now();
            }
        });
        this._builtinAudio.addEventListener('play', () => {
            if (this._builtinMode && !this._offscreenMode) { this.state.isPlaying = true; this._updateUI(); }
        });
        this._builtinAudio.addEventListener('pause', () => {
            if (this._builtinMode && !this._offscreenMode) { this.state.isPlaying = false; this._updateUI(); }
        });
    }

    // ===================== 事件绑定 =====================

    bindEvents() {
        const el = this._el;
        if (!el) return;

        // 播放控制
        el.querySelector('#mc-play')?.addEventListener('click', (e) => { e.stopPropagation(); this._togglePlay(); });
        el.querySelector('#mc-prev')?.addEventListener('click', (e) => { e.stopPropagation(); this._prevTrack(); });
        el.querySelector('#mc-next')?.addEventListener('click', (e) => { e.stopPropagation(); this._nextTrack(); });
        el.querySelector('#mc-v5-play')?.addEventListener('click', (e) => { e.stopPropagation(); this._togglePlay(); });
        el.querySelector('#mc-v5-prev')?.addEventListener('click', (e) => { e.stopPropagation(); this._prevTrack(); });
        el.querySelector('#mc-v5-next')?.addEventListener('click', (e) => { e.stopPropagation(); this._nextTrack(); });

        // 进度条
        const prgInput = el.querySelector('#mc-prg-input');
        if (prgInput) {
            const stop = (e) => e.stopPropagation();
            prgInput.addEventListener('mousedown', stop);
            prgInput.addEventListener('touchstart', stop);
            prgInput.addEventListener('click', stop);
            prgInput.addEventListener('input', (e) => {
                e.stopPropagation();
                this._draggingProgress = true;
                this._updateProgressUI(Number(prgInput.value) / 1000);
            });
            prgInput.addEventListener('change', (e) => {
                e.stopPropagation();
                this._draggingProgress = false;
                const ratio = Number(prgInput.value) / 1000;
                const targetTime = ratio * this.state.duration;
                if (isFinite(targetTime) && targetTime >= 0) {
                    this.state.currentTime = targetTime;
                    this._lastUpdateTs = Date.now();
                    if (this._offscreenMode) {
                        this._offscreenCommand('seekTo', targetTime);
                    } else if (this._builtinMode && this._builtinAudio) {
                        this._builtinAudio.currentTime = targetTime;
                    }
                }
            });
        }

        // 音量（使用浮层方式避免 overflow:hidden 裁剪）
        const volToggle = el.querySelector('#mc-vol-toggle');
        if (volToggle) {
            volToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleFloatingVolume();
            });
        }
        this._bindFloatingVolumeEvents();

        // 常驻播放条返回“正在播放”，不会重建播放器或改变播放状态。
        el.querySelector('#mc-strip')?.addEventListener('click', (e) => {
            if (e.target.closest('button, input, a')) return;
            this._expanded = true;
            this._updatePanelExpand();
            this._switchTab('now-playing', true);
        });

        // Tab 切换
        el.querySelectorAll('#mc-tabs .mc-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                this._switchTab(tab.dataset.mcTab);
            });
        });

        el.querySelectorAll('[data-mc-open]').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                this._switchTab(button.dataset.mcOpen);
            });
        });

        // 搜索是工具动作，不与内容导航争抢一个一级 Tab。
        el.querySelector('#mc-search-tab')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this._expanded) {
                this._expanded = true;
                this._updatePanelExpand();
            }
            this._switchTab('search');
        });

        // 单个按钮循环切换播放模式，避免四个等权图标造成认知负担。
        el.querySelector('#mc-mode-cycle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._cyclePlayMode();
        });

        // 关闭面板不等于断开音乐连接，播放继续。
        el.querySelector('#mc-close-panel')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._el?.classList.remove('mc-dock-open');
        });
        el.querySelector('#mc-minimize')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._el?.classList.remove('mc-dock-open');
        });

        // 搜索
        this._searchType = 1;
        this._searchPending = false;
        const searchInput = el.querySelector('#mc-search-input');
        const searchClearBtn = el.querySelector('#mc-search-clear');
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') this._performSearch(searchInput.value);
                if (e.key === 'Escape') { searchInput.value = ''; this._onSearchInputChange(); }
            });
            searchInput.addEventListener('input', () => this._onSearchInputChange());
            searchInput.addEventListener('click', (e) => e.stopPropagation());
        }
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (searchInput) searchInput.value = '';
                this._onSearchInputChange();
                this._resetSearchView();
                searchInput?.focus();
            });
        }
        const searchTypeTabs = el.querySelector('#mc-search-type-tabs');
        if (searchTypeTabs) {
            searchTypeTabs.addEventListener('click', (e) => {
                e.stopPropagation();
                const btn = e.target.closest('.mc-search-type');
                if (!btn) return;
                const type = parseInt(btn.dataset.type);
                if (isNaN(type)) return;
                this._searchType = type;
                searchTypeTabs.querySelectorAll('.mc-search-type').forEach(b => b.classList.toggle('active', b === btn));
                const q = el.querySelector('#mc-search-input')?.value;
                if (q?.trim()) this._performSearch(q);
            });
        }

        // 睡眠定时器
        el.querySelector('#mc-sleep-toggle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._showSleepTimerMenu(e);
        });

        el.querySelector('#mc-more-toggle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = el.querySelector('#mc-more-menu');
            if (!menu || !menu.classList.contains('hidden')) {
                this._closeMoreMenu(true);
                return;
            }
            this._closeSleepTimerMenu();
            menu.classList.remove('hidden');
            el.querySelector('#mc-more-toggle')?.setAttribute('aria-expanded', 'true');
            this._setMusicSurfacePage('more-sleep-timer');
            setTimeout(() => menu.querySelector('[role="menuitem"]')?.focus(), 0);
        });

        // 断开连接
        el.querySelector('#mc-disconnect')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeMoreMenu();
            this._disconnectMusic();
        });

        // 登录按钮
        el.querySelector('#mc-login-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._goToLogin();
        });

        el.querySelectorAll('.mc-connect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._startIndependentMode();
            });
        });

        // 面板内阻止冒泡
        el.querySelector('#mc-panel')?.addEventListener('click', (e) => e.stopPropagation());
        el.querySelector('#mc-progress')?.addEventListener('click', (e) => e.stopPropagation());
        el.querySelector('#mc-progress')?.addEventListener('mousedown', (e) => e.stopPropagation());
        el.querySelector('#mc-modes')?.addEventListener('click', (e) => e.stopPropagation());

        // 全局点击关闭浮动音量弹窗 + 上下文菜单
        document.addEventListener('click', (e) => {
            const floating = this._volFloating;
            const volBtn = el.querySelector('#mc-vol-toggle');
            if (floating && !floating.classList.contains('hidden') && volBtn && !volBtn.contains(e.target) && !floating.contains(e.target)) {
                floating.classList.add('hidden');
            }
            if (this._ctxMenuEl && !this._ctxMenuEl.classList.contains('hidden') && !this._ctxMenuEl.contains(e.target)) {
                this._ctxMenuEl.classList.add('hidden');
            }
            const moreMenu = el.querySelector('#mc-more-menu');
            const moreToggle = el.querySelector('#mc-more-toggle');
            if (moreMenu && !moreMenu.classList.contains('hidden') && !moreMenu.contains(e.target) && !moreToggle?.contains(e.target)) {
                this._closeMoreMenu();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._actionSheetEl && !this._actionSheetEl.classList.contains('hidden')) {
                e.preventDefault();
                this._closeActionSheet();
                return;
            }
            if (e.key === 'Escape' && this._el?.querySelector('.mc-sleep-menu')) {
                e.preventDefault();
                this._closeSleepTimerMenu(true);
                return;
            }
            if (e.key === 'Escape' && !this._el?.querySelector('#mc-more-menu')?.classList.contains('hidden')) {
                e.preventDefault();
                this._closeMoreMenu(true);
                return;
            }
            if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k' || !this._el?.classList.contains('mc-dock-open')) return;
            e.preventDefault();
            this._switchTab('search');
        });

        // 操作台浮层关闭
        this._actionSheetEl?.querySelector('.mc-action-sheet-backdrop')?.addEventListener('click', () => this._closeActionSheet());
    }

    _bindFloatingVolumeEvents() {
        const volInput = this._volFloating?.querySelector('#mc-vol-input-f');
        if (!volInput) return;
        const stop = (e) => e.stopPropagation();
        volInput.addEventListener('mousedown', (e) => { stop(e); this._draggingVolume = true; this._volumeFreezeUntil = Date.now() + 8000; });
        volInput.addEventListener('touchstart', (e) => { stop(e); this._draggingVolume = true; this._volumeFreezeUntil = Date.now() + 8000; });
        volInput.addEventListener('click', stop);
        volInput.addEventListener('input', (e) => {
            e.stopPropagation();
            this._draggingVolume = true;
            this._volumeFreezeUntil = Date.now() + 8000;
            const vol = Number(volInput.value) / 100;
            this.state.volume = vol;
            this._updateVolumeUI(vol);
            if (this._offscreenMode) {
                this._offscreenCommand('setVolume', vol);
            } else if (this._builtinMode && this._builtinAudio) {
                this._builtinAudio.volume = vol;
            }
        });
        volInput.addEventListener('change', (e) => {
            e.stopPropagation();
            this._draggingVolume = false;
            this._volumeFreezeUntil = Date.now() + 5000;
            const vol = Number(volInput.value) / 100;
            this.state.volume = vol;
            this._updateVolumeUI(vol);
            if (this._offscreenMode) {
                this._offscreenCommand('setVolume', vol);
            } else if (this._builtinMode && this._builtinAudio) {
                this._builtinAudio.volume = vol;
            }
            this._saveVolume(vol);
        });
        this._volFloating?.addEventListener('click', stop);
        this._volFloating?.addEventListener('mousedown', stop);
    }

    _toggleFloatingVolume() {
        const floating = this._volFloating;
        if (!floating) return;
        const isHidden = floating.classList.contains('hidden');
        if (isHidden) {
            this._positionFloatingVolume();
            floating.classList.remove('hidden');
            this._updateVolumeUI(this.state.volume);
        } else {
            floating.classList.add('hidden');
        }
    }

    _positionFloatingVolume() {
        const toggle = this._el?.querySelector('#mc-vol-toggle');
        const floating = this._volFloating;
        const island = this._el;
        if (!toggle || !floating || !island) return;

        const islandRect = island.getBoundingClientRect();
        const toggleRect = toggle.getBoundingClientRect();
        floating.style.bottom = (islandRect.bottom - toggleRect.top + 6) + 'px';
        floating.style.right = (islandRect.right - toggleRect.left - toggleRect.width / 2 - 20) + 'px';
    }

    _updatePanelExpand() {
        const panel = this._el?.querySelector('#mc-panel');
        if (!panel) return;
        panel.classList.toggle('mc-panel-expanded', this._expanded);
        if (this._expanded) {
            requestAnimationFrame(() => this._updateTabIndicator());
            setTimeout(() => this._updateTabIndicator(), 120);
            const activeTab = this._el?.querySelector('#mc-tabs .mc-tab.active')?.dataset?.mcTab;
            if (activeTab && !this._panelEverExpanded) {
                this._panelEverExpanded = true;
                this._switchTab(activeTab);
            }
        }
    }

    // ===================== v3.0.0: 独立模式 =====================

    async _checkNeteaseLogin() {
        try {
            const resp = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'check_netease_login' }, resolve);
            });
            if (resp?.loggedIn) {
                this._loggedIn = true;
                this._userProfile = resp.profile;
                return true;
            }
        } catch { /* ignore */ }
        return false;
    }

    async _startIndependentMode() {
        const connectEl = this._el?.querySelector('#mc-connect');
        const btn = connectEl?.querySelector('[data-platform="netease-independent"]');
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测登录…';

        const resp = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'check_netease_login' }, resolve);
        });

        if (resp?.loggedIn) {
            this._loggedIn = true;
            this._userProfile = resp.profile;
            this._offscreenMode = true;
            this._builtinMode = true;
            this.platform = 'netease';
            this.isActive = true;
            this._show();
            this._showMetaGuide('default');
            this._loadRecommended();
        } else {
            const reason = resp?.reason || 'no-cookie';
            this._show();
            this._showMetaGuide(reason);
        }
        if (btn) btn.innerHTML = '<i class="fas fa-play-circle"></i> 独立播放';
    }

    async _offscreenPlay(url, songId, title, artist, cover, album) {
        try {
            return await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    action: 'offscreen_play',
                    url, songId, title, artist, cover, album
                }, resolve);
            });
        } catch {
            return { ok: false };
        }
    }

    async _offscreenCommand(command, value) {
        try {
            return await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    action: 'offscreen_command',
                    command, value
                }, resolve);
            });
        } catch {
            return { ok: false };
        }
    }

    async _disconnectMusic() {
        if (this._offscreenMode) {
            await this._offscreenCommand('stop');
        }
        if (this._builtinMode) {
            this._stopBuiltinPlayback();
        }
        this.isActive = false;
        this.platform = null;
        this._offscreenMode = false;
        this._builtinMode = false;
        this._loggedIn = false;
        this.state = { isPlaying: false, title: '', artist: '', cover: '', currentTime: 0, duration: 0, volume: this.state.volume, lyricLine: '' };
        this._playlist = [];
        this._lyrics = [];
        this._currentLyricIndex = -1;
        this._lyricSongId = null;
        this._currentSongId = null;
        try { await chrome.storage.local.remove(['lastMusicState', 'musicPlaylistCache']); } catch { /* ignore */ }
        this._hide();
        this._showConnect();
    }

    // ===================== 通信 =====================

    _listenMessages() {
        if (!chrome.runtime?.onMessage?.addListener) return;
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'music_state_from_offscreen') {
                this._handleOffscreenState(msg.data);
            } else if (msg.action === 'music_track_ended') {
                this._onBuiltinTrackEnd(msg.songId);
            } else if (msg.action === 'music_media_action') {
                if (msg.command === 'prev') this._prevTrack();
                else if (msg.command === 'next') this._nextTrack();
            } else if (msg.action === 'music_playback_error') {
                this._handlePlaybackError(msg.error, msg.code, msg.songId);
            }
        });
    }

    // ===================== 网易云 API =====================

    async _neteaseApi(endpoint, params = {}, method = 'GET') {
        try {
            const resp = await new Promise((resolve) => {
                const timeout = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 15000);
                chrome.runtime.sendMessage({ action: 'netease_api', endpoint, params, method }, (r) => {
                    clearTimeout(timeout);
                    resolve(r || { ok: false });
                });
            });
            // v3.4.0: 增加业务code校验 — HTTP 200 但 body.code 非 200 时标记为失败
            if (resp?.ok && resp?.data && typeof resp.data.code === 'number' && resp.data.code !== 200) {
                return { ok: false, data: resp.data, error: `biz-code-${resp.data.code}`, message: resp.data.message };
            }
            return resp;
        } catch {
            return { ok: false, error: 'message failed' };
        }
    }

    // ===================== 状态处理 =====================

    

    _onSongChange(title, artist) {
        const strip = this._el?.querySelector('#mc-strip');
        if (strip) {
            strip.classList.add('mc-song-change');
            setTimeout(() => strip.classList.remove('mc-song-change'), 600);
        }
        // 歌曲变化时尝试获取歌词和 songId
        this._tryFetchLyricsForCurrentSong();
    }

    _handleOffscreenState(data) {
        if (!data || !this._offscreenMode) return;
        const prevTitle = this.state.title;
        const frozenVol = (Date.now() < this._volumeFreezeUntil) ? this.state.volume : null;

        const hasSongIdentity = data.songId !== undefined && data.songId !== null && data.songId !== '';
        const songIdMatch = hasSongIdentity
            ? (!this._currentSongId || String(data.songId) === String(this._currentSongId))
            : !this._currentSongId;
        if (songIdMatch) {
            this.state = { ...this.state, ...data };
        } else {
            // 乱序状态仍可更新进度、音量等传输态，但不能更新歌曲身份和元数据。
            const { title, artist, album, cover, songId, ...safeData } = data;
            this.state = { ...this.state, ...safeData };
        }
        if (frozenVol !== null) this.state.volume = frozenVol;
        this._lastUpdateTs = Date.now();
        this.isActive = true;
        this._updateUI();
        this._show();

        if (data.title && (!data.songId || String(data.songId) === String(this._currentSongId))) {
            if (data.title !== prevTitle) this._onSongChange(data.title, data.artist);
            this._hideMetaGuide(true);
        } else if (data.isPlaying && !data.title) {
            this._showMetaGuide('no-metadata');
        }

        this._throttleSaveState();
    }

    _throttleSaveState() {
        if (this._saveStateTimer) return;
        this._saveStateTimer = setTimeout(() => {
            this._saveStateTimer = null;
            if (!this.state.title) return;
            try {
                chrome.storage.local.set({
                    lastMusicState: {
                        title: this.state.title,
                        artist: this.state.artist,
                        cover: this.state.cover,
                        volume: this.state.volume,
                        platform: this.platform,
                        songId: this._currentSongId,
                        playlistName: this._currentPlaylistName || '',
                        savedAt: Date.now(),
                    }
                });
            } catch { /* ignore */ }
        }, 5000);
    }

    async _handlePlaybackError(error, code, songId = null) {
        if (songId !== null && this._currentSongId !== null && String(songId) !== String(this._currentSongId)) return;
        const now = Date.now();
        try {
            const { _musicErrorLock: lockTs } = await chrome.storage.session.get('_musicErrorLock');
            if (lockTs && now - lockTs < 2000) return;
            await chrome.storage.session.set({ _musicErrorLock: now });
        } catch { /* proceed */ }

        this.state.isPlaying = false;
        this._updateUI();

        const errHints = {
            1: '加载被中止',
            2: '网络错误',
            3: '解码失败',
            4: '链接已失效',
        };
        const hint = errHints[code] || '播放出错';
        this._showToast(`${hint}，正在切换下一首…`);
        if (this._fmMode) this._fmNext();
        else this._autoSkipOnError();
    }

    _autoSkipOnError() {
        const now = Date.now();
        if (!this._skipErrorTs) this._skipErrorTs = [];
        if (!this._failedSongIds) this._failedSongIds = new Set();
        this._skipErrorTs = this._skipErrorTs.filter(t => now - t < 30000);
        this._skipErrorTs.push(now);

        if (this._currentSongId) {
            this._failedSongIds.add(String(this._currentSongId));
        }

        const maxSkips = Math.min((this._playlist?.length || 3), 3);
        if (this._skipErrorTs.length > maxSkips) {
            const failedCount = this._failedSongIds.size;
            this._showToast(`连续 ${failedCount} 首播放失败，已暂停`);
            this._skipErrorTs = [];
            return;
        }
        setTimeout(() => this._skipToNextValid(), 800);
    }

    _skipToNextValid() {
        if (!this._failedSongIds) this._failedSongIds = new Set();
        if (this._playlist.length === 0) return;

        const currentIdx = this._playlist.findIndex(s => s.isActive || String(s.songId) === String(this._currentSongId));
        let tried = 0;
        let nextIdx = currentIdx;

        while (tried < this._playlist.length) {
            nextIdx = (nextIdx + 1) % this._playlist.length;
            tried++;
            const song = this._playlist[nextIdx];
            if (song && !this._failedSongIds.has(String(song.songId))) {
                this._playSongById(song.songId);
                return;
            }
        }
        this._showToast('队列中所有歌曲均无法播放');
    }

    // ===================== 播放控制 =====================

    async _togglePlay() {
        if (this._resuming) return;
        if (this._offscreenMode) {
            const resp = await this._offscreenCommand('togglePlay');
            if (resp && !resp.ok && (resp.error === 'no-src' || resp.error === 'play-failed')) {
                await this._resumeCurrentSong();
            }
        } else if (this._builtinMode && this._builtinAudio) {
            if (this._builtinAudio.paused) this._builtinAudio.play(); else this._builtinAudio.pause();
        }
    }

    async _resumeCurrentSong() {
        if (this._resuming) return;
        const songId = this._currentSongId;
        if (!songId) {
            this._showToast('无法恢复播放，请重新选择歌曲');
            return;
        }
        this._resuming = true;
        const savedTime = this.state.currentTime || 0;
        this._showToast('正在恢复播放…');
        try {
            await this._playSongById(songId);
            // 恢复到之前的播放位置，避免从头开始
            if (savedTime > 2) {
                setTimeout(() => {
                    if (this._offscreenMode) {
                        this._offscreenCommand('seekTo', savedTime);
                    } else if (this._builtinMode && this._builtinAudio) {
                        this._builtinAudio.currentTime = savedTime;
                    }
                    this.state.currentTime = savedTime;
                }, 500);
            }
        } finally {
            this._resuming = false;
        }
    }

    _prevTrack() {
        if (this._fmMode) {
            this._fmPrevious();
            return;
        }
        this._playAdjacentTrack(-1);
    }

    _nextTrack() {
        if (this._fmMode) {
            this._fmNext();
            return;
        }
        this._playAdjacentTrack(1);
    }

    // ===================== UI 更新 =====================

    _updateUI() {
        window.ProductUIV5?.updatePlayer?.({
            isPlaying: Boolean(this.state.isPlaying),
            title: this.state.title || '',
            artist: this.state.artist || '',
            cover: this.state.cover || '',
            currentTime: Number(this.state.currentTime || 0),
            duration: Number(this.state.duration || 0),
            volume: Number(this.state.volume ?? 1),
            playMode: this._playMode,
            queueLength: this._playlist.length,
        });
        const el = this._el;
        if (!el) return;

        const titleEl = el.querySelector('#mc-title');
        const subEl = el.querySelector('#mc-sub');
        const coverImg = el.querySelector('#mc-cover-img');
        const coverPlaceholder = el.querySelector('.mc-cover-placeholder');
        const playIcon = el.querySelector('#mc-play-icon');
        const lyricPreview = el.querySelector('#mc-lyric-preview');

        if (titleEl) {
            if (this.state.title) {
                titleEl.textContent = this.state.title;
                titleEl.classList.remove('mc-title-unknown');
            } else if (this.isActive) {
                titleEl.textContent = '歌曲信息获取中…';
                titleEl.classList.add('mc-title-unknown');
            } else {
                titleEl.textContent = '未检测到音乐';
                titleEl.classList.remove('mc-title-unknown');
            }
        }
        if (subEl) {
            const artistHtml = this._renderArtistLink(this.state.artists, this.state.artist);
            if (artistHtml) {
                subEl.innerHTML = artistHtml;
                subEl.querySelectorAll('.mc-artist-link').forEach(link => {
                    link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
                });
            } else {
                subEl.textContent = this.state.artist || '';
            }
        }

        if (coverImg && this.state.cover) {
            if (coverImg.src !== this.state.cover) {
                coverImg.onerror = () => { coverImg.style.display = 'none'; if (coverPlaceholder) coverPlaceholder.style.display = ''; };
                coverImg.src = this.state.cover;
            }
            coverImg.style.display = 'block';
            if (coverPlaceholder) coverPlaceholder.style.display = 'none';
        } else if (coverImg) {
            coverImg.style.display = 'none';
            if (coverPlaceholder) coverPlaceholder.style.display = '';
        }

        if (playIcon) playIcon.className = this.state.isPlaying ? 'fas fa-pause' : 'fas fa-play';

        if (!this._draggingProgress) {
            this._updateProgressUI(this.state.duration > 0 ? this.state.currentTime / this.state.duration : 0);
        }

        const timeCur = el.querySelector('#mc-time-cur');
        const timeTotal = el.querySelector('#mc-time-total');
        if (timeCur) timeCur.textContent = this._formatTime(this.state.currentTime);
        if (timeTotal) timeTotal.textContent = this._formatTime(this.state.duration);

        if (!this._draggingVolume) this._updateVolumeUI(this.state.volume);

        if (lyricPreview && this._showLyric) {
            const line = this.state.lyricLine || this._getCurrentLrcLine() || '';
            if (lyricPreview.textContent !== line) {
                lyricPreview.classList.add('mc-lyric-fade');
                setTimeout(() => { lyricPreview.textContent = line; lyricPreview.classList.remove('mc-lyric-fade'); }, 200);
            }
        }

        const v5Title = el.querySelector('#mc-v5-now-title');
        const v5Artist = el.querySelector('#mc-v5-now-artist');
        const v5Cover = el.querySelector('#mc-v5-now-cover');
        const v5Lyric = el.querySelector('#mc-v5-now-lyric');
        const v5PlayIcon = el.querySelector('#mc-v5-play i');
        const v5Mode = el.querySelector('#mc-v5-now-mode');
        const v5ContextSource = el.querySelector('#mc-v5-now-source');
        const v5Source = el.querySelector('#mc-v5-play-source');
        const v5QueueSize = el.querySelector('#mc-v5-queue-size');
        if (v5Title) v5Title.textContent = this.state.title || '未检测到音乐';
        if (v5Artist) {
            const artistHtml = this._renderArtistLink(this.state.artists, this.state.artist);
            if (artistHtml) {
                v5Artist.innerHTML = artistHtml;
                v5Artist.querySelectorAll('.mc-artist-link').forEach(link => {
                    link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
                });
            } else {
                v5Artist.textContent = this.state.artist || (this.isActive ? '歌曲信息获取中…' : '连接网易云后开始播放');
            }
        }
        if (v5Cover) {
            const currentCover = v5Cover.querySelector('img')?.getAttribute('src') || '';
            if (this.state.cover && currentCover !== this.state.cover) {
                v5Cover.innerHTML = `<img src="${this._esc(this.state.cover)}" alt="${this._esc(this.state.title || '当前歌曲')}封面"><span class="mc-now-cover-glow"></span>`;
            } else if (!this.state.cover && !v5Cover.querySelector('i')) {
                v5Cover.innerHTML = '<i class="fas fa-music"></i>';
            }
        }
        if (v5Lyric) v5Lyric.textContent = this.state.lyricLine || this._getCurrentLrcLine() || '选择音乐后，这里会显示当前歌词';
        if (v5PlayIcon) v5PlayIcon.className = this.state.isPlaying ? 'fas fa-pause' : 'fas fa-play';
        if (v5Mode) v5Mode.textContent = ({ sequence: '顺序播放', loop: '列表循环', single: '单曲循环', shuffle: '随机播放' })[this._playMode] || '顺序播放';
        const playbackSource = this._currentPlaylistName || (this._offscreenMode ? '网易云音乐' : '本地队列');
        if (v5ContextSource) v5ContextSource.textContent = playbackSource;
        if (v5Source) v5Source.textContent = playbackSource;
        if (v5QueueSize) v5QueueSize.textContent = `${this._playlist.length} 首`;



        // 恢复同一首歌或收到乱序的 offscreen 状态时，也不能残留空态引导。
        if (this.state.title) this._hideMetaGuide(true);
        this._updateLyricsHighlight();
    }

    _updateProgressUI(ratio) {
        const el = this._el;
        if (!el) return;
        const fill = el.querySelector('#mc-prg-fill');
        const input = el.querySelector('#mc-prg-input');
        const pct = Math.max(0, Math.min(1, ratio)) * 100;
        if (fill) fill.style.width = `${pct}%`;
        if (input && !this._draggingProgress) input.value = Math.round(ratio * 1000);
    }

    _updateVolumeUI(vol) {
        const el = this._el;
        if (!el) return;
        const pct = Math.max(0, Math.min(1, vol)) * 100;

        const fill = this._volFloating?.querySelector('#mc-vol-fill-f');
        const input = this._volFloating?.querySelector('#mc-vol-input-f');
        const pctEl = this._volFloating?.querySelector('#mc-vol-pct-f');
        const icon = el.querySelector('#mc-vol-icon');

        if (fill) fill.style.height = `${pct}%`;
        if (input && !this._draggingVolume) input.value = Math.round(pct);
        if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
        if (icon) {
            if (vol <= 0) icon.className = 'fas fa-volume-mute';
            else if (vol < 0.33) icon.className = 'fas fa-volume-off';
            else if (vol < 0.66) icon.className = 'fas fa-volume-down';
            else icon.className = 'fas fa-volume-up';
        }
    }

    _formatTime(seconds) {
        if (!seconds || !isFinite(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    _show() {
        const panel = this._el?.querySelector('#mc-panel');
        const connect = this._el?.querySelector('#mc-connect');
        if (panel) panel.classList.remove('hidden');
        if (connect) connect.classList.add('hidden');
    }

    _hide() {
        const panel = this._el?.querySelector('#mc-panel');
        if (panel) { panel.classList.add('hidden'); panel.classList.remove('mc-panel-expanded'); this._expanded = false; }
    }

    _showConnect() {
        const panel = this._el?.querySelector('#mc-panel');
        const connect = this._el?.querySelector('#mc-connect');
        if (panel) panel.classList.add('hidden');
        if (connect) connect.classList.remove('hidden');
        this._hideMetaGuide();
    }

    _showMetaGuide(reason) {
        let guide = this._el?.querySelector('#mc-meta-guide');
        if (!guide) {
            guide = document.createElement('div');
            guide.className = 'mc-meta-guide';
            guide.id = 'mc-meta-guide';
            const panel = this._el?.querySelector('#mc-panel');
            if (panel) panel.appendChild(guide);
        }
        const tips = {
            'no-cookie': {
                icon: 'fa-cookie-bite',
                title: '未检测到登录信息',
                desc: '请先在浏览器中访问 music.163.com 并登录你的账号',
                actions: [
                    { label: '前往登录', icon: 'fa-external-link-alt', id: 'mc-guide-login' },
                    { label: '重新检测', icon: 'fa-redo', id: 'mc-guide-retry' },
                ],
            },
            'api-error': {
                icon: 'fa-exclamation-triangle',
                title: '接口请求失败',
                desc: '登录态可能已过期，请重新登录网易云音乐',
                actions: [
                    { label: '前往登录', icon: 'fa-external-link-alt', id: 'mc-guide-login' },
                    { label: '重新检测', icon: 'fa-redo', id: 'mc-guide-retry' },
                ],
            },
            'no-metadata': {
                icon: 'fa-info-circle',
                title: '歌曲信息获取失败',
                desc: '音频正在播放，但暂时无法获取歌名和封面',
                actions: [
                    { label: '重试获取', icon: 'fa-redo', id: 'mc-guide-refetch' },
                    { label: '选择歌曲', icon: 'fa-search', id: 'mc-guide-search' },
                ],
            },
            'default': {
                icon: 'fa-music',
                title: '开始播放音乐',
                desc: '选择一首歌曲开始播放，或在"发现"中浏览推荐',
                actions: [
                    { label: '发现音乐', icon: 'fa-compass', id: 'mc-guide-discover' },
                    { label: '搜索歌曲', icon: 'fa-search', id: 'mc-guide-search' },
                ],
            },
        };
        const tip = tips[reason] || tips['default'];
        const isErrorSurface = ['no-cookie', 'api-error', 'no-metadata'].includes(reason);
        guide.dataset.guideReason = reason;
        guide.dataset.surfaceError = String(isErrorSurface);
        guide.setAttribute('role', isErrorSurface ? 'alert' : 'status');
        guide.setAttribute('aria-label', tip.title);
        this._setMetaGuideBackgroundDisabled(isErrorSurface);
        if (isErrorSurface) this._setMusicSurfacePage('connection-error');
        else this._restoreMusicSurfacePage();
        guide.innerHTML = `
            <div class="mc-guide-inner">
                <i class="fas ${tip.icon} mc-guide-icon"></i>
                <div class="mc-guide-text">
                    <div class="mc-guide-title">${tip.title}</div>
                    <div class="mc-guide-desc">${tip.desc}</div>
                </div>
                <div class="mc-guide-actions">
                    ${tip.actions.map(a => `<button class="mc-guide-btn" id="${a.id}" type="button"><i class="fas ${a.icon}"></i> ${a.label}</button>`).join('')}
                </div>
            </div>`;
        guide.classList.remove('hidden');
        if (isErrorSurface) {
            setTimeout(() => {
                const safeInitialAction = guide.querySelector('#mc-guide-retry')
                    || guide.querySelector('#mc-guide-refetch')
                    || guide.querySelector('#mc-guide-login');
                safeInitialAction?.focus();
            }, 0);
        }

        guide.querySelector('#mc-guide-login')?.addEventListener('click', (e) => { e.stopPropagation(); this._goToLogin(); });
        guide.querySelector('#mc-guide-retry')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._hideMetaGuide();
            this._startIndependentMode();
        });
        guide.querySelector('#mc-guide-refetch')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._retryFetchMetadata();
        });
        guide.querySelector('#mc-guide-search')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._hideMetaGuide();
            if (!this._expanded) { this._expanded = true; this._updatePanelExpand(); }
            this._switchTab('search');
        });
        guide.querySelector('#mc-guide-discover')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._hideMetaGuide();
            if (!this._expanded) { this._expanded = true; this._updatePanelExpand(); }
            this._switchTab('discover');
        });
    }

    _setMetaGuideBackgroundDisabled(active) {
        ['#mc-tabs', '#mc-drawer-wrapper'].forEach(selector => {
            const el = this._el?.querySelector(selector);
            if (!el) return;
            el.inert = active;
            if (active) el.setAttribute('aria-hidden', 'true');
            else el.removeAttribute('aria-hidden');
        });
    }

    _hideMetaGuide(automatic = false) {
        const guide = this._el?.querySelector('#mc-meta-guide');
        if (guide) {
            if (automatic && ['no-cookie', 'api-error'].includes(guide.dataset.guideReason) && !guide.classList.contains('hidden')) return;
            const wasErrorSurface = guide.dataset.surfaceError === 'true' && !guide.classList.contains('hidden');
            guide.classList.add('hidden');
            guide.dataset.guideReason = '';
            guide.dataset.surfaceError = 'false';
            if (wasErrorSurface) this._restoreMusicSurfacePage();
        }
        this._setMetaGuideBackgroundDisabled(false);
    }

    async _retryFetchMetadata() {
        if (!this._currentSongId) {
            this._showMetaGuide('no-metadata');
            return;
        }
        try {
            const resp = await this._neteaseApi('/api/v3/song/detail', { c: JSON.stringify([{ id: this._currentSongId }]) });
            if (resp?.ok && resp?.data?.songs?.[0]) {
                const s = resp.data.songs[0];
                const ar = (s.ar || []).map(a => ({ id: a.id, name: a.name }));
                this.state.title = s.name || '';
                this.state.artist = ar.map(a => a.name).join('/') || '';
                this.state.artists = ar;
                this.state.albumId = s.al?.id || null;
                this.state.cover = (s.al?.picUrl || '') + '?param=200y200';
                this.state.album = s.al?.name || '';
                this._updateUI();
                this._hideMetaGuide();
                this._syncMetaToOffscreen();
                return;
            }
        } catch { /* ignore */ }
        this._showMetaGuide('no-metadata');
    }

    _syncMetaToOffscreen() {
        if (!this._offscreenMode) return;
        chrome.runtime.sendMessage({
            action: 'offscreen_command',
            command: 'updateMeta',
            title: this.state.title,
            artist: this.state.artist,
            cover: this.state.cover,
            album: this.state.album || '',
            songId: this._currentSongId,
        }).catch(() => {});
    }

    // ===================== 轮询 & 进度补间 =====================

    _startPolling() {
        // offscreen 模式下通过消息广播获取状态，无需主动轮询
    }

    _startProgressInterpolation() {
        const tick = () => {
            if (this.isActive && this.state.isPlaying && !this._draggingProgress && this.state.duration > 0) {
                const elapsed = (Date.now() - this._lastUpdateTs) / 1000;
                const interpolated = Math.min(this.state.currentTime + elapsed, this.state.duration);
                const ratio = interpolated / this.state.duration;
                this._updateProgressUI(ratio);
                const timeCur = this._el?.querySelector('#mc-time-cur');
                if (timeCur) timeCur.textContent = this._formatTime(interpolated);
                this._syncLyricByTime(interpolated);
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ===================== Tab 切换 =====================

    _switchTab(tabName, skipLoad = false) {
        const el = this._el;
        if (!el) return;
        el.querySelectorAll('#mc-tabs .mc-tab').forEach(t => {
            const active = t.dataset.mcTab === tabName;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', String(active));
        });
        el.querySelector('#mc-search-tab')?.classList.toggle('active', tabName === 'search');
        el.querySelectorAll('.mc-pane').forEach(c => c.classList.toggle('active', c.dataset.mcPane === tabName));
        this._setMusicSurfacePage(tabName);
        this._syncMetaGuideForTab(tabName);
        this._updateTabIndicator();
        this._saveLastMusicTab(tabName);

        const loginPrompt = el.querySelector('#mc-login-prompt');
        if (loginPrompt) loginPrompt.classList.add('hidden');

        if (skipLoad) return;

        switch (tabName) {
            case 'now-playing':
                this._updateUI();
                break;
            case 'queue':
                if (!this._apiLoadingQueue) this._refreshPlaylist();
                break;
            case 'playlists': this._loadUserPlaylists(); break;
            case 'lyrics': this._tryFetchLyricsForCurrentSong(); break;
            case 'discover': this._loadRecommended(); break;
            case 'search':
                el.querySelector('#mc-search-input')?.focus();
                this._onSearchInputChange();
                this._renderSearchHistory();
                break;
        }
    }

    _syncMetaGuideForTab(tabName) {
        const guide = this._el?.querySelector('#mc-meta-guide');
        const visibleError = guide?.dataset.surfaceError === 'true' && !guide.classList.contains('hidden');
        if (visibleError) return;

        if (tabName === 'now-playing' && !this.state.title) {
            if (!guide || guide.classList.contains('hidden') || guide.dataset.guideReason !== 'default') {
                this._showMetaGuide('default');
            }
            return;
        }

        if (guide?.dataset.guideReason === 'default') this._hideMetaGuide();
    }

    _saveLastMusicTab(tabName) {
        try { chrome.storage.local.set({ musicLastTab: tabName }); } catch {}
    }

    _setMusicSurfacePage(pageName) {
        let canonical = window.ProductUIV5?.normalizeMusicPage?.(pageName) || pageName;
        const guide = this._el?.querySelector('#mc-meta-guide');
        if (canonical !== 'connection-error' && guide?.dataset.surfaceError === 'true' && !guide.classList.contains('hidden')) {
            canonical = 'connection-error';
        }
        this._el?.querySelector('#mc-panel')?.setAttribute('data-music-page', canonical);
        window.ProductUIV5?.setMusicPage?.(canonical);
        return canonical;
    }

    _restoreMusicSurfacePage() {
        const activePane = this._el?.querySelector('.mc-pane.active')?.dataset.mcPane || 'now-playing';
        this._setMusicSurfacePage(activePane);
    }

    async _restoreLastTab() {
        try {
            const { musicLastTab } = await chrome.storage.local.get('musicLastTab');
            if (musicLastTab && ['now-playing', 'queue', 'playlists', 'lyrics', 'discover', 'search'].includes(musicLastTab)) {
                if (this._expanded) {
                    this._switchTab(musicLastTab);
                } else {
                    this._switchTab(musicLastTab, true);
                    if (musicLastTab === 'discover') this._loadRecommended();
                }
            }
        } catch {}
    }

    _updateTabIndicator() {
        const el = this._el;
        if (!el) return;
        const active = el.querySelector('#mc-tabs .mc-tab.active');
        const indicator = el.querySelector('#mc-tab-indicator');
        if (active && indicator) {
            indicator.style.opacity = '1';
            indicator.style.left = active.offsetLeft + 'px';
            indicator.style.width = active.offsetWidth + 'px';
        } else if (indicator) {
            indicator.style.opacity = '0';
        }
    }

    // ===================== 播放模式 =====================

    _setPlayMode(mode) {
        if (!['sequence', 'loop', 'single', 'shuffle'].includes(mode)) return;
        this._playMode = mode;
        this._updateModeUI();
        this._savePlayMode(mode);
        if (mode === 'shuffle' && this._playlist.length > 0) {
            this._generateShuffleQueue();
        }
    }

    _cyclePlayMode() {
        const modes = ['sequence', 'loop', 'single', 'shuffle'];
        const currentIndex = modes.indexOf(this._playMode);
        this._setPlayMode(modes[(currentIndex + 1) % modes.length]);
    }

    _updateModeUI() {
        const el = this._el;
        if (!el) return;
        const labels = { sequence: '顺序播放', loop: '列表循环', single: '单曲循环', shuffle: '随机播放' };
        const icons = { sequence: 'fa-long-arrow-alt-right', loop: 'fa-retweet', single: 'fa-redo', shuffle: 'fa-random' };
        const label = el.querySelector('#mc-mode-label');
        if (label) label.textContent = labels[this._playMode] || '';
        const nowPlayingLabel = el.querySelector('#mc-v5-now-mode');
        if (nowPlayingLabel) nowPlayingLabel.textContent = labels[this._playMode] || '';
        const icon = el.querySelector('#mc-mode-icon');
        if (icon) icon.className = `fas ${icons[this._playMode] || icons.sequence}`;
        const cycleButton = el.querySelector('#mc-mode-cycle');
        if (cycleButton) {
            cycleButton.title = `${labels[this._playMode]}，点击切换`;
            cycleButton.setAttribute('aria-label', `当前为${labels[this._playMode]}，点击切换播放模式`);
        }
    }

    _generateShuffleQueue() {
        this._shuffleQueue = [...Array(this._playlist.length).keys()];
        for (let i = this._shuffleQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this._shuffleQueue[i], this._shuffleQueue[j]] = [this._shuffleQueue[j], this._shuffleQueue[i]];
        }
        this._shuffleIndex = 0;
    }

    // ===================== 播放列表 =====================

    async _refreshPlaylist() {
        const songs = Array.isArray(this._playlist) ? this._playlist : [];
        this._renderQueueWithApi(songs);
        const countEl = this._el?.querySelector('#mc-queue-count');
        if (countEl) countEl.textContent = songs.length > 0 ? ` ${songs.length}` : '';
    }

    // ===================== 用户歌单 =====================

    async _loadUserPlaylists() {
        const pane = this._el?.querySelector('#mc-pane-playlists');
        if (!pane) return;
        pane.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
        this._hideLoginPrompt('playlists');

        const ok = await this._loadPlaylistsViaApi(pane);
        if (!ok) {
            pane.innerHTML = `<div class="mc-empty">
                <p>未找到歌单</p>
                <p style="font-size:11px;opacity:0.4;margin-top:4px">请先在浏览器中登录 music.163.com</p>
                <button class="mc-retry-btn" id="mc-retry-pl"><i class="fas fa-redo"></i> 重新加载</button>
            </div>`;
            pane.querySelector('#mc-retry-pl')?.addEventListener('click', (e) => { e.stopPropagation(); this._loadUserPlaylists(); });
        }
    }

    async _loadPlaylistsViaApi(pane) {
        const profileResp = await this._neteaseApi('/api/nuser/account/get');
        if (!profileResp?.ok || !profileResp?.data?.account?.id) return false;
        const uid = profileResp.data.account.id;

        const resp = await this._neteaseApi('/api/user/playlist', { uid, limit: 30, offset: 0 });
        if (!resp?.ok || !resp?.data?.playlist?.length) return false;

        const playlists = resp.data.playlist.map((pl, idx) => ({
            index: idx, name: pl.name || '未命名歌单', id: pl.id,
            href: `https://music.163.com/#/playlist?id=${pl.id}`,
            trackCount: pl.trackCount || 0, isLiked: idx === 0, coverUrl: pl.coverImgUrl || '',
        }));
        this._renderUserPlaylists(pane, playlists);
        return true;
    }

    _renderUserPlaylists(pane, playlists) {
        const colors = ['#ff6b8a', '#ffa040', '#64b4ff', '#5cd85c', '#c478ff', '#64d8ff', '#ff8a65', '#7c4dff'];
        const recentEntry = `
            <div class="mc-fm-entry mc-recent-entry" id="mc-recent-play-entry">
                <div class="mc-fm-entry-icon mc-recent-icon"><i class="fas fa-history"></i></div>
                <div class="mc-fm-entry-text">
                    <div class="mc-fm-entry-title">最近播放</div>
                    <div class="mc-fm-entry-desc">查看听歌排行</div>
                </div>
                <div class="mc-fm-entry-play"><i class="fas fa-chevron-right"></i></div>
            </div>
        `;
        pane.innerHTML = recentEntry + '<div class="mc-pl-compact">' + playlists.map((pl, i) => `
            <div class="mc-pl-row" data-href="${this._esc(pl.href)}" data-id="${pl.id || ''}">
                <div class="mc-pl-dot" style="background:${colors[i % colors.length]}"></div>
                <span class="mc-pl-label">${this._esc(pl.name)}</span>
                <span class="mc-pl-num">${pl.trackCount || ''}</span>
                <i class="fas fa-chevron-right mc-pl-chev"></i>
            </div>
        `).join('') + '</div>';

        pane.querySelector('#mc-recent-play-entry')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._loadPlayRecord();
        });

        pane.querySelectorAll('.mc-pl-row').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const plId = item.dataset.id;
                if (plId) {
                    this._loadPlaylistSongsViaApi(plId, item);
                }
            });
        });
    }

    async _loadPlayRecord(type = 'local') {
        this._switchTab('queue', true);
        const pane = this._el?.querySelector('#mc-pane-queue');
        if (!pane) return;
        pane.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载播放记录...</div>';

        let songs = [];
        let subLabel = '';

        if (type === 'local') {
            const data = await new Promise(r => chrome.storage.local.get('musicLocalPlayHistory', d => r(d)));
            const history = data?.musicLocalPlayHistory || [];
            if (history.length === 0) {
                type = 1;
            } else {
                songs = history.slice(0, 100).map((h, i) => ({
                    title: h.title || '', artist: h.artist || '', artists: h.artists || [],
                    albumId: h.albumId || null, songId: h.songId, index: i,
                    playedAt: h.playedAt || 0, isActive: false,
                }));
                subLabel = '';
            }
        }
        if (type !== 'local') {
            const profileResp = await this._neteaseApi('/api/nuser/account/get');
            const uid = profileResp?.ok ? (profileResp?.data?.account?.id || profileResp?.data?.profile?.userId) : null;
            if (!uid) { pane.innerHTML = '<div class="mc-empty">请先登录网易云音乐</div>'; return; }
            const resp = await this._neteaseApi('/api/v1/play/record', { uid, type });
            const records = resp?.ok ? (type === 1 ? resp?.data?.weekData : resp?.data?.allData) : null;
            if (!records || records.length === 0) { pane.innerHTML = '<div class="mc-empty">暂无播放记录</div>'; return; }
            songs = records.slice(0, 100).map((r, i) => {
                const s = r.song || r;
                const ar = (s.ar || s.artists || []).map(a => ({ id: a.id, name: a.name }));
                return {
                    title: s.name || '', artist: ar.map(a => a.name).join('/'), artists: ar,
                    albumId: s.al?.id || s.album?.id || null, songId: s.id, index: i,
                    playCount: r.playCount || r.score || 0, isActive: false,
                };
            });
            subLabel = type === 1 ? '（按播放次数排序）' : '（按播放次数排序）';
        }

        if (songs.length === 0) {
            pane.innerHTML = '<div class="mc-empty">暂无播放记录</div>';
            return;
        }

        const tabHtml = `
            <div class="mc-pl-detail-header">
                <button class="mc-pl-back" id="mc-pl-back" title="返回歌单列表"><i class="fas fa-arrow-left"></i></button>
                <div class="mc-pl-detail-cover mc-pl-cover-ph"><i class="fas fa-history"></i></div>
                <div class="mc-pl-detail-info">
                    <div class="mc-pl-detail-name">最近播放</div>
                    <div class="mc-pl-detail-count">${songs.length} 首歌曲${subLabel}</div>
                </div>
                <div class="mc-pl-detail-actions">
                    <button class="mc-pl-action-btn mc-pl-play-all" id="mc-pl-play-all" title="播放全部"><i class="fas fa-play"></i></button>
                    <button class="mc-pl-action-btn mc-pl-shuffle-all" id="mc-pl-shuffle-all" title="随机播放"><i class="fas fa-random"></i></button>
                </div>
            </div>
            <div class="mc-record-tabs">
                <button class="mc-record-tab${type === 'local' ? ' active' : ''}" data-rtype="local">本地记录</button>
                <button class="mc-record-tab${type === 1 ? ' active' : ''}" data-rtype="1">最近一周</button>
                <button class="mc-record-tab${type === 0 ? ' active' : ''}" data-rtype="0">所有时间</button>
            </div>
        `;

        const renderMeta = (song) => {
            if (type === 'local' && song.playedAt) {
                const ago = this._timeAgo(song.playedAt);
                return ` · <span style="color:rgba(200,160,255,0.4)">${ago}</span>`;
            }
            if (song.playCount) {
                return ` · <span style="color:rgba(200,160,255,0.4)">${song.playCount}次</span>`;
            }
            return '';
        };

        pane.innerHTML = tabHtml + songs.map((song, idx) => `
            <div class="mc-row" data-song-id="${song.songId || ''}" data-index="${idx}">
                <span class="mc-row-num">${idx + 1}</span>
                <div class="mc-row-info">
                    <span class="mc-row-title">${this._esc(song.title)}</span>
                    <span class="mc-row-artist">${this._renderArtistLink(song.artists, song.artist)}${renderMeta(song)}</span>
                </div>
                <button class="mc-row-play"><i class="fas fa-play"></i></button>
            </div>
        `).join('');

        pane.querySelector('#mc-pl-back')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._switchTab('playlists');
        });

        pane.querySelector('#mc-pl-play-all')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (songs.length > 0) {
                this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                this._currentPlaylistName = '最近播放';
                this._savePlaylistCache();
                this._setPlayMode('sequence');
                if (songs[0].songId) this._playSongById(songs[0].songId);
            }
        });

        pane.querySelector('#mc-pl-shuffle-all')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (songs.length > 0) {
                this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                this._currentPlaylistName = '最近播放';
                this._savePlaylistCache();
                this._setPlayMode('shuffle');
                this._generateShuffleQueue();
                const randIdx = this._shuffleQueue[0];
                if (songs[randIdx]?.songId) this._playSongById(songs[randIdx].songId);
            }
        });

        pane.querySelectorAll('.mc-record-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                const rt = tab.dataset.rtype;
                this._loadPlayRecord(rt === 'local' ? 'local' : Number(rt));
            });
        });

        pane.querySelectorAll('.mc-artist-link').forEach(link => {
            link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
        });

        pane.querySelectorAll('.mc-row').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-play') || e.target.closest('.mc-artist-link')) return;
                e.stopPropagation();
                const songId = item.dataset.songId;
                if (songId) {
                    this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                    this._currentPlaylistName = '最近播放';
                    this._savePlaylistCache();
                    this._playSongById(songId);
                }
            });
        });

        pane.querySelectorAll('.mc-row-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.mc-row');
                const songId = row?.dataset.songId;
                if (songId) this._playSongById(songId);
            });
        });

        pane.querySelectorAll('.mc-row').forEach((row, idx) => {
            row.addEventListener('contextmenu', (e) => { e.preventDefault(); this._showSongContextMenu(e, songs[idx] || {}); });
        });
    }

    _timeAgo(ts) {
        const diff = Date.now() - ts;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}小时前`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}天前`;
        return `${Math.floor(days / 30)}月前`;
    }

    async _loadPlaylistSongsViaApi(playlistId, itemEl) {
        const playlistName = itemEl?.querySelector('.mc-pl-label')?.textContent || '歌单';
        if (itemEl) {
            const chev = itemEl.querySelector('.mc-pl-chev');
            if (chev) { chev.className = 'fas fa-spinner fa-spin'; chev.style.opacity = '0.8'; }
        }

        this._apiLoadingQueue = true;
        this._currentPlaylistId = playlistId;
        this._currentPlaylistName = playlistName;
        this._switchTab('queue', true);
        const pane = this._el?.querySelector('#mc-pane-queue');
        if (pane) pane.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载歌单中...</div>';

        const resp = await this._neteaseApi('/api/v6/playlist/detail', { id: playlistId, n: 100000 });
        if (!resp?.ok || !resp?.data?.playlist?.trackIds) {
            this._apiLoadingQueue = false;
            if (pane) pane.innerHTML = '<div class="mc-empty">加载失败<br><button class="mc-retry-btn" id="mc-retry-pldetail"><i class="fas fa-redo"></i> 重试</button></div>';
            pane?.querySelector('#mc-retry-pldetail')?.addEventListener('click', (e) => { e.stopPropagation(); this._loadPlaylistSongsViaApi(playlistId, null); });
            return;
        }

        const plInfo = resp.data.playlist;
        const coverUrl = plInfo.coverImgUrl ? plInfo.coverImgUrl + '?param=200y200' : '';
        const trackIds = plInfo.trackIds.map(t => t.id);
        const totalCount = trackIds.length;
        const allSongs = [];

        for (let i = 0; i < Math.min(trackIds.length, 300); i += 50) {
            const batch = trackIds.slice(i, i + 50);
            const songResp = await this._neteaseApi('/api/v3/song/detail', { c: JSON.stringify(batch.map(id => ({ id }))) });
            if (songResp?.ok && songResp?.data?.songs) {
                songResp.data.songs.forEach(s => {
                    const ar = (s.ar || []).map(a => ({ id: a.id, name: a.name }));
                    allSongs.push({
                        title: s.name || '未知歌曲',
                        artist: ar.map(a => a.name).join('/') || '',
                        artists: ar,
                        albumId: s.al?.id || null,
                        index: allSongs.length, isActive: s.name === this.state.title, songId: s.id,
                    });
                });
            }
        }

        this._playlist = allSongs;
        this._savePlaylistCache();
        this._apiLoadingQueue = false;
        this._renderPlaylistDetail(pane, allSongs, playlistName, coverUrl, totalCount, false);
    }

    _renderPlaylistDetail(pane, songs, name, coverUrl, totalCount, isQueue = false) {
        if (!pane) return;
        if (songs.length === 0) { pane.innerHTML = '<div class="mc-empty">歌单为空</div>'; return; }

        const headerHtml = `
            <div class="mc-pl-detail-header">
                <button class="mc-pl-back" id="mc-pl-back" title="${isQueue ? '返回正在播放' : '返回歌单列表'}"><i class="fas fa-arrow-left"></i></button>
                ${coverUrl ? `<img class="mc-pl-detail-cover" src="${this._esc(coverUrl)}" alt="">` : '<div class="mc-pl-detail-cover mc-pl-cover-ph"><i class="fas fa-music"></i></div>'}
                <div class="mc-pl-detail-info">
                    <div class="mc-pl-detail-name">${this._esc(name)}</div>
                    <div class="mc-pl-detail-count">${totalCount || songs.length} 首歌曲</div>
                </div>
                <div class="mc-pl-detail-actions">
                    <button class="mc-pl-action-btn mc-pl-play-all" id="mc-pl-play-all" title="播放全部"><i class="fas fa-play"></i></button>
                    <button class="mc-pl-action-btn mc-pl-shuffle-all" id="mc-pl-shuffle-all" title="随机播放"><i class="fas fa-random"></i></button>
                    ${this._currentPlaylistId ? '<button class="mc-pl-action-btn mc-pl-heartbeat" id="mc-pl-heartbeat" title="心动模式"><i class="fas fa-heartbeat"></i></button>' : ''}
                    ${this._currentPlaylistId ? `<button class="mc-pl-action-btn mc-pl-subscribe" id="mc-pl-subscribe" data-pl-id="${this._currentPlaylistId}" title="收藏歌单"><i class="fas fa-folder-plus"></i></button>` : ''}
                    ${isQueue ? '<button class="mc-pl-action-btn mc-pl-clear-all" id="mc-pl-clear-all" title="清空队列"><i class="fas fa-trash-alt"></i></button>' : ''}
                </div>
            </div>
        `;

        pane.innerHTML = headerHtml + songs.map((song, idx) => `
            <div class="mc-row${song.isActive ? ' mc-row-active' : ''}" data-song-id="${song.songId || ''}" data-index="${idx}">
                <span class="mc-row-num">${song.isActive ? '<i class="fas fa-volume-up" style="font-size:9px"></i>' : (idx + 1)}</span>
                <div class="mc-row-info">
                    <span class="mc-row-title">${this._esc(song.title)}</span>
                    <span class="mc-row-artist">${this._renderArtistLink(song.artists, song.artist)}</span>
                </div>
                <button class="mc-row-like" data-song-id="${song.songId || ''}" title="添加到我喜欢"><i class="fas fa-heart"></i></button>
                ${isQueue ? `<button class="mc-row-remove" data-song-id="${song.songId || ''}" title="从队列移除"><i class="fas fa-times"></i></button>` : ''}
                <button class="mc-row-play"><i class="fas fa-play"></i></button>
            </div>
        `).join('');
        const pageName = isQueue ? 'queue' : 'playlist-detail';
        this._setMusicSurfacePage(pageName);

        pane.querySelector('#mc-pl-back')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._switchTab(isQueue ? 'now-playing' : 'playlists');
        });

        pane.querySelector('#mc-pl-play-all')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (songs.length > 0 && songs[0].songId) {
                this._setPlayMode('sequence');
                this._playSongById(songs[0].songId);
            }
        });

        pane.querySelector('#mc-pl-shuffle-all')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (songs.length > 0) {
                this._setPlayMode('shuffle');
                this._generateShuffleQueue();
                const randIdx = this._shuffleQueue[0];
                if (songs[randIdx]?.songId) this._playSongById(songs[randIdx].songId);
            }
        });

        pane.querySelector('#mc-pl-heartbeat')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._startHeartbeatMode(songs);
        });

        pane.querySelector('#mc-pl-subscribe')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const plId = btn.dataset.plId;
            if (plId) this._subscribePlaylist(plId, name, btn);
        });

        pane.querySelectorAll('.mc-row').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-like') || e.target.closest('.mc-row-play') || e.target.closest('.mc-artist-link')) return;
                e.stopPropagation();
                const songId = item.dataset.songId;
                if (songId) {
                    this._playSongById(songId);
                }
            });
        });

        pane.querySelectorAll('.mc-artist-link').forEach(link => {
            link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
        });

        pane.querySelectorAll('.mc-row-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.mc-row');
                const songId = row?.dataset.songId;
                if (songId) this._playSongById(songId);
            });
        });

        pane.querySelectorAll('.mc-row-like').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                if (songId) this._likeSong(songId, btn);
            });
        });

        pane.querySelector('#mc-pl-clear-all')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._confirmClearPlaylist();
        });

        pane.querySelectorAll('.mc-row-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                if (songId) this._removeSongFromQueue(songId);
            });
        });

        pane.querySelectorAll('.mc-row').forEach((row, idx) => {
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showSongContextMenu(e, songs[idx] || {});
            });
        });

        const active = pane.querySelector('.mc-row-active');
        if (active) this._scrollToCenter(pane, active);
    }

    _renderQueueWithApi(songs) {
        const pane = this._el?.querySelector('#mc-pane-queue');
        if (!pane) return;
        if (!Array.isArray(songs) || songs.length === 0) {
            pane.innerHTML = '<div class="mc-empty">暂无歌曲，请先播放音乐</div>';
            return;
        }
        this._renderPlaylistDetail(pane, songs, '播放队列', '', songs.length, true);
    }

    async _playSongById(songId, options = {}) {
        if (!songId) return;
        const requestId = ++this._playRequestSeq;
        const isCurrentRequest = () => requestId === this._playRequestSeq && String(this._currentSongId) === String(songId);
        const queueSong = options.knownSong || this._playlist.find(s => String(s.songId) === String(songId)) || {};

        if (!options.fm) this._fmMode = false;
        this._currentSongId = songId;
        this._updatePlaylistActiveState(songId);
        this._applySongIdentity({ ...queueSong, songId }, { isPlaying: true });
        this._setRowLoading(songId, true);

        const [songUrl, detailResp] = await Promise.all([
            this._getSongUrl(songId, requestId),
            this._neteaseApi('/api/v3/song/detail', { c: JSON.stringify([{ id: songId }]) }),
        ]);
        if (!isCurrentRequest()) {
            this._setRowLoading(songId, false);
            return;
        }
        if (!songUrl) {
            this._setRowLoading(songId, false);
            if (options.fm) {
                this._showToast('当前 FM 歌曲不可播放，已跳过');
                await this._fmNext();
            } else {
                this._autoSkipOnError();
            }
            return;
        }

        if (this._failedSongIds) this._failedSongIds.delete(String(songId));
        this._skipErrorTs = [];

        let songMeta = { ...queueSong, songId };
        if (detailResp?.ok && detailResp?.data?.songs?.[0]) {
            const s = detailResp.data.songs[0];
            const artists = (s.ar || []).map(a => ({ id: a.id, name: a.name }));
            songMeta = {
                ...songMeta,
                title: s.name || songMeta.title || '',
                artist: artists.map(a => a.name).join('/') || songMeta.artist || '',
                artists,
                cover: s.al?.picUrl ? `${s.al.picUrl}?param=200y200` : (songMeta.cover || ''),
                album: s.al?.name || songMeta.album || '',
                albumId: s.al?.id || songMeta.albumId || null,
            };
        }
        this._applySongIdentity(songMeta, { isPlaying: true });

        if (this._offscreenMode) {
            // 独立播放场景如果是“单曲触发”，确保队列不会是空的（否则队列/next/prev 会显得不连贯）
            if (!Array.isArray(this._playlist) || this._playlist.length === 0) {
                this._playlist = [{ ...songMeta, index: 0, isActive: true, songId }];
                this._currentPlaylistName = this._currentPlaylistName || '播放队列';
                this._savePlaylistCache();
            }

            await this._offscreenPlay(songUrl, songId, songMeta.title, songMeta.artist, songMeta.cover, songMeta.album);
            if (!isCurrentRequest()) return;
            this._setRowLoading(songId, false);
            this._tryFetchLyricsForCurrentSong();
            this._updatePlaylistActiveState(songId);
            this._recordLocalPlayHistory(songMeta);
            return;
        }

        this._setRowLoading(songId, false);
        await this._playWithBuiltinAudio(songUrl, songId, requestId, songMeta);
    }

    _applySongIdentity(song, transport = {}) {
        if (!song) return;
        this.state = {
            ...this.state,
            ...transport,
            songId: song.songId ?? this._currentSongId,
            title: song.title || '',
            artist: song.artist || '',
            artists: Array.isArray(song.artists) ? song.artists : [],
            albumId: song.albumId || null,
            cover: song.cover || '',
            album: song.album || '',
            currentTime: 0,
            duration: Number(song.duration || 0) > 10000 ? Number(song.duration) / 1000 : Number(song.duration || 0),
            lyricLine: '',
        };
        this._lyrics = [];
        this._lyricsTranslation = {};
        this._currentLyricIndex = -1;
        this._lyricSongId = null;
        this._lastUpdateTs = Date.now();
        this._updateUI();
        this._show();
        this._hideMetaGuide();
    }

    _setRowLoading(songId, loading) {
        const rows = this._el?.querySelectorAll(`.mc-row[data-song-id="${songId}"], .mc-search-row[data-song-id="${songId}"], .mc-rec-row[data-song-id="${songId}"]`);
        if (!rows) return;
        rows.forEach(row => {
            const icon = row.querySelector('.mc-row-play i');
            if (!icon) return;
            if (loading) {
                icon.className = 'fas fa-spinner fa-spin';
            } else {
                icon.className = 'fas fa-play';
            }
        });
    }

    async _getSongUrl(songId, requestId = null) {
        const strategies = [
            { endpoint: '/api/song/enhance/player/url/v1', params: { ids: `[${songId}]`, level: 'exhigh', encodeType: 'mp3' }, extract: d => d?.data?.[0]?.url },
            { endpoint: '/api/song/enhance/player/url', params: { ids: `[${songId}]`, br: 320000 }, extract: d => d?.data?.[0]?.url },
            { endpoint: '/api/song/url/v1', params: { id: songId, level: 'standard' }, extract: d => d?.data?.[0]?.url },
        ];

        for (const { endpoint, params, extract } of strategies) {
            try {
                const resp = await this._neteaseApi(endpoint, params);
                if (resp?.ok) {
                    const url = extract(resp.data);
                    if (url) return url;
                }
            } catch { /* try next */ }
        }

        if (requestId === null || requestId === this._playRequestSeq) {
            this._showToast('该歌曲暂无版权或链接获取失败');
        }
        return null;
    }

    _showToast(msg, duration = 3000) {
        let toast = this._el?.querySelector('.mc-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'mc-toast';
            this._el?.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('mc-toast-show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('mc-toast-show'), duration);
    }

    async _likeSong(songId, btnEl) {
        if (!songId) return;
        const icon = btnEl?.querySelector('i');
        const wasLiked = btnEl?.classList.contains('mc-row-liked');
        const like = !wasLiked;

        if (icon) icon.className = 'fas fa-spinner fa-spin';

        try {
            const resp = await this._neteaseApi('/api/song/like', { trackId: songId, like, time: 3 }, 'POST');
            if (resp?.ok || resp?.data?.code === 200) {
                if (like) {
                    btnEl?.classList.add('mc-row-liked');
                    this._showToast('已添加到我喜欢');
                } else {
                    btnEl?.classList.remove('mc-row-liked');
                    this._showToast('已取消喜欢');
                }
            } else {
                this._showToast('操作失败，请重试');
            }
        } catch {
            this._showToast('网络错误，请重试');
        }
        if (icon) icon.className = 'fas fa-heart';
    }

    _updatePlaylistActiveState(songId) {
        this._playlist.forEach(s => { s.isActive = (String(s.songId) === String(songId)); });
        const pane = this._el?.querySelector('#mc-pane-queue');
        if (pane) {
            pane.querySelectorAll('.mc-row').forEach(row => {
                const active = row.dataset.songId === String(songId);
                row.classList.toggle('mc-row-active', active);
                const numEl = row.querySelector('.mc-row-num');
                if (numEl) {
                    numEl.innerHTML = active ? '<i class="fas fa-volume-up" style="font-size:9px"></i>' : (parseInt(row.dataset.index) + 1);
                }
            });
        }
    }

    // ===================== 歌词 API =====================

    async _tryFetchLyricsForCurrentSong() {
        if (this.platform !== 'netease' || !this.state.title) return;

        if (!this._currentSongId) {
            const searchResp = await this._neteaseApi('/api/cloudsearch/get/web', {
                s: `${this.state.title} ${this.state.artist}`.trim(), type: 1, limit: 5, offset: 0,
            }, 'POST');
            if (searchResp?.ok && searchResp?.data?.result?.songs?.length > 0) {
                this._currentSongId = searchResp.data.result.songs[0].id;
            }
        }

        if (!this._currentSongId) return;
        if (this._lyricSongId === this._currentSongId && this._lyrics.length > 0) return;

        const resp = await this._neteaseApi('/api/song/lyric', { id: this._currentSongId, lv: 1, tv: 1 });
        if (!resp?.ok || !resp?.data) return;

        const lrcStr = resp.data.lrc?.lyric || '';
        const tlyricStr = resp.data.tlyric?.lyric || '';

        this._lyrics = this._parseLrc(lrcStr);
        this._lyricsTranslation = this._parseLrcToMap(tlyricStr);
        this._lyricSongId = this._currentSongId;
        this._currentLyricIndex = -1;
        this._renderLyricsPanel();
    }

    _parseLrc(lrcStr) {
        if (!lrcStr) return [];
        const lines = [];
        const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/g;
        let match;
        while ((match = regex.exec(lrcStr)) !== null) {
            const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3].padEnd(3, '0')) / 1000;
            const text = match[4].trim();
            if (text) lines.push({ time, text });
        }
        return lines.sort((a, b) => a.time - b.time);
    }

    _parseLrcToMap(lrcStr) {
        if (!lrcStr) return {};
        const map = {};
        const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/g;
        let match;
        while ((match = regex.exec(lrcStr)) !== null) {
            const time = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3].padEnd(3, '0')) / 1000;
            const text = match[4].trim();
            if (text) map[time.toFixed(1)] = text;
        }
        return map;
    }

    _renderLyricsPanel() {
        const pane = this._el?.querySelector('#mc-pane-lyrics');
        if (!pane) return;
        if (this._lyrics.length === 0) {
            pane.innerHTML = '<div class="mc-lrc-pane"><div class="mc-empty">暂无歌词</div></div>';
            return;
        }

        const lrcHtml = this._lyrics.map((line, idx) => {
            const trans = this._lyricsTranslation[line.time.toFixed(1)] || '';
            return `<div class="mc-lrc" data-lrc-idx="${idx}">${this._esc(line.text)}</div>` +
                (trans ? `<div class="mc-lrc-sub">${this._esc(trans)}</div>` : '');
        }).join('');

        pane.innerHTML = `<div class="mc-lrc-pane">${lrcHtml}</div>
            <div class="mc-comments-section" id="mc-comments-section">
                <button class="mc-comments-toggle" id="mc-comments-toggle">
                    <i class="fas fa-comment-dots"></i> 查看热门评论
                </button>
                <div class="mc-comments-list" id="mc-comments-list"></div>
            </div>`;

        pane.querySelectorAll('.mc-lrc').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(el.dataset.lrcIdx);
                if (isFinite(idx) && this._lyrics[idx]) {
                    const targetTime = this._lyrics[idx].time;
                    if (this._offscreenMode) {
                        this._offscreenCommand('seekTo', targetTime);
                    } else if (this._builtinMode && this._builtinAudio) {
                        this._builtinAudio.currentTime = targetTime;
                    }
                }
            });
        });

        pane.querySelector('#mc-comments-toggle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._loadHotComments();
        });
    }

    async _loadHotComments() {
        const songId = this._currentSongId;
        if (!songId) return;

        const listEl = this._el?.querySelector('#mc-comments-list');
        const toggleBtn = this._el?.querySelector('#mc-comments-toggle');
        if (!listEl) return;

        if (listEl.innerHTML && this._commentsSongId === songId) {
            const isVisible = listEl.classList.toggle('show');
            if (toggleBtn) toggleBtn.innerHTML = isVisible
                ? '<i class="fas fa-comment-dots"></i> 收起评论'
                : '<i class="fas fa-comment-dots"></i> 查看热门评论';
            return;
        }

        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载评论...';

        try {
            const resp = await this._neteaseApi(`/api/v1/resource/comments/R_SO_4_${songId}`, {
                rid: songId, limit: 10, offset: 0,
            }, 'POST');

            const hotComments = resp?.ok ? (resp?.data?.hotComments || []) : [];
            const comments = resp?.ok ? (resp?.data?.comments || []) : [];
            const allComments = hotComments.length > 0 ? hotComments : comments;
            const total = resp?.data?.total || 0;

            if (allComments.length === 0) {
                if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-comment-dots"></i> 暂无评论';
                return;
            }

            this._commentsSongId = songId;
            listEl.innerHTML = `
                <div class="mc-comments-header"><i class="fas fa-fire"></i> 热门评论 (${total})</div>
                ${allComments.slice(0, 10).map(c => {
                    const user = c.user || {};
                    const time = c.time ? new Date(c.time).toLocaleDateString('zh-CN') : '';
                    return `<div class="mc-comment-item">
                        <div class="mc-comment-avatar">${user.avatarUrl ? `<img src="${this._esc(user.avatarUrl)}?param=40y40" alt="">` : '<i class="fas fa-user"></i>'}</div>
                        <div class="mc-comment-body">
                            <div class="mc-comment-meta">
                                <span class="mc-comment-user">${this._esc(user.nickname || '匿名')}</span>
                                <span class="mc-comment-time">${time}</span>
                            </div>
                            <div class="mc-comment-content">${this._esc(c.content || '')}</div>
                            <div class="mc-comment-likes"><i class="fas fa-thumbs-up"></i> ${c.likedCount || 0}</div>
                        </div>
                    </div>`;
                }).join('')}
            `;
            listEl.classList.add('show');
            if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-comment-dots"></i> 收起评论';
        } catch {
            if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-comment-dots"></i> 加载评论失败';
        }
    }

    _syncLyricByTime(currentTime) {
        if (this._lyrics.length === 0) return;
        let idx = -1;
        for (let i = this._lyrics.length - 1; i >= 0; i--) {
            if (currentTime >= this._lyrics[i].time) { idx = i; break; }
        }
        if (idx !== this._currentLyricIndex) {
            this._currentLyricIndex = idx;
            this._updateLyricsHighlight();
        }
    }

    _updateLyricsHighlight() {
        const pane = this._el?.querySelector('#mc-pane-lyrics');
        if (!pane) return;
        const lrcEls = pane.querySelectorAll('.mc-lrc');
        lrcEls.forEach((el, i) => {
            const idx = parseInt(el.dataset.lrcIdx);
            el.classList.toggle('mc-lrc-on', idx === this._currentLyricIndex);
            el.classList.toggle('mc-lrc-adj', Math.abs(idx - this._currentLyricIndex) === 1);
        });
        if (this._lrcScrollTimer) return;
        this._lrcScrollTimer = setTimeout(() => {
            this._lrcScrollTimer = null;
            const active = pane.querySelector('.mc-lrc-on');
            if (active) this._scrollToCenter(pane, active);
        }, 300);
    }

    _getCurrentLrcLine() {
        if (this._currentLyricIndex >= 0 && this._lyrics[this._currentLyricIndex]) {
            return this._lyrics[this._currentLyricIndex].text;
        }
        return '';
    }

    // ===================== 私人FM (v3.13.0) =====================

    async _startPersonalFM() {
        this._fmMode = true;

        if (this._fmQueue && this._fmQueue.length > 0 && this._fmIndex < this._fmQueue.length) {
            const currentFmSong = this._fmQueue[this._fmIndex];
            if (currentFmSong && String(currentFmSong.songId) === String(this._currentSongId)) {
                this._renderFMUI();
                return;
            }
        }

        this._fmTrashIds = new Set();
        this._showToast('正在加载私人FM...');
        await this._loadFMSongs();
    }

    async _loadFMSongs() {
        const resp = await this._neteaseApi('/api/v1/radio/get');
        const songs = resp?.ok ? (resp?.data?.data || []) : [];
        if (songs.length === 0) {
            this._showToast('私人FM暂无推荐');
            this._fmMode = false;
            return;
        }
        this._fmQueue = songs.map(s => {
            const ar = (s.artists || []).map(a => ({ id: a.id, name: a.name }));
            return {
                songId: s.id,
                title: s.name || '',
                artist: ar.map(a => a.name).join('/'),
                artists: ar,
                albumId: s.album?.id || null,
                cover: (s.album?.picUrl || '') + '?param=200y200',
                album: s.album?.name || '',
                duration: s.duration || 0,
            };
        });
        this._fmIndex = 0;
        await this._playFMCurrent();
    }

    async _playFMCurrent() {
        if (!this._fmQueue || this._fmIndex >= this._fmQueue.length) {
            await this._loadFMSongs();
            return;
        }
        const song = this._fmQueue[this._fmIndex];
        this._playlist = this._fmQueue.map((s, i) => ({
            title: s.title, artist: s.artist, artists: s.artists, albumId: s.albumId,
            cover: s.cover, album: s.album, duration: s.duration,
            songId: s.songId, index: i, isActive: i === this._fmIndex,
        }));
        this._currentPlaylistName = '私人FM';
        this._savePlaylistCache();
        const expectedIndex = this._fmIndex;
        await this._playSongById(song.songId, { fm: true, knownSong: song });
        if (this._fmMode && expectedIndex === this._fmIndex && String(this._currentSongId) === String(song.songId)) {
            this._renderFMUI();
        }
    }

    async _fmNext() {
        this._fmIndex++;
        if (this._fmIndex >= (this._fmQueue?.length || 0)) {
            await this._loadFMSongs();
        } else {
            await this._playFMCurrent();
        }
    }

    async _fmPrevious() {
        if (!this._fmQueue?.length) return;
        this._fmIndex = Math.max(0, this._fmIndex - 1);
        await this._playFMCurrent();
    }

    async _fmTrash() {
        if (!this._fmQueue || !this._fmQueue[this._fmIndex]) return;
        const songId = this._fmQueue[this._fmIndex].songId;
        this._fmTrashIds.add(songId);
        this._neteaseApi('/api/radio/trash/add', { songId, alg: 'RT', time: 25 }, 'POST').catch(() => {});
        this._showToast('已标记为不感兴趣');
        await this._fmNext();
    }

    async _subscribePlaylist(playlistId, playlistName, btnEl) {
        if (!playlistId) return;
        if (btnEl) {
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btnEl.disabled = true;
        }
        const resp = await this._neteaseApi('/api/playlist/subscribe', { id: playlistId, t: 1 }, 'POST');
        if (resp?.ok && resp?.data?.code === 200) {
            this._showToast(`已收藏: ${playlistName || '歌单'}`);
            if (btnEl) {
                btnEl.innerHTML = '<i class="fas fa-check"></i>';
                btnEl.title = '已收藏';
                btnEl.classList.add('mc-pl-card-collected');
            }
        } else {
            const errCode = resp?.data?.code;
            if (errCode === 501) {
                this._showToast('已经收藏过了');
                if (btnEl) {
                    btnEl.innerHTML = '<i class="fas fa-check"></i>';
                    btnEl.title = '已收藏';
                    btnEl.classList.add('mc-pl-card-collected');
                }
            } else {
                this._showToast('收藏失败，请重试');
                if (btnEl) {
                    btnEl.innerHTML = '<i class="fas fa-folder-plus"></i>';
                    btnEl.disabled = false;
                }
            }
        }
    }

    _isDailyCheckedIn() {
        const today = new Date().toISOString().slice(0, 10);
        try { return localStorage.getItem('mc_checkin_date') === today; } catch { return false; }
    }

    _markDailyCheckedIn() {
        const today = new Date().toISOString().slice(0, 10);
        try { localStorage.setItem('mc_checkin_date', today); } catch { /* noop */ }
    }

    async _doDailyCheckin() {
        const entry = this._el?.querySelector('#mc-checkin-entry');
        if (entry) {
            entry.querySelector('.mc-fm-entry-title').textContent = '签到中...';
            entry.querySelector('.mc-fm-entry-icon i').className = 'fas fa-spinner fa-spin';
        }
        const resp = await this._neteaseApi('/api/point/dailyTask', { type: 0 }, 'POST');
        if (resp?.ok && (resp?.data?.code === 200 || resp?.data?.code === -2)) {
            const alreadyDone = resp?.data?.code === -2;
            this._markDailyCheckedIn();
            this._showToast(alreadyDone ? '今日已签到' : `签到成功${resp?.data?.point ? '，获得 ' + resp.data.point + ' 云贝' : ''}`);
            if (entry) {
                entry.classList.add('mc-checkin-done');
                entry.querySelector('.mc-fm-entry-title').textContent = '已签到';
                entry.querySelector('.mc-fm-entry-desc').textContent = '今日已完成签到';
                entry.querySelector('.mc-fm-entry-icon i').className = 'fas fa-check-circle';
                const playDiv = entry.querySelector('.mc-fm-entry-play');
                if (playDiv) { playDiv.className = 'mc-fm-entry-play mc-checkin-check'; playDiv.innerHTML = '<i class="fas fa-check"></i>'; }
            }
        } else {
            this._showToast('签到失败，请重试');
            if (entry) {
                entry.querySelector('.mc-fm-entry-title').textContent = '每日签到';
                entry.querySelector('.mc-fm-entry-icon i').className = 'fas fa-calendar-check';
            }
        }
    }

    async _showAddToPlaylistPicker(songId, songTitle) {
        if (!songId) return;

        let playlists = this._userPlaylists;
        if (!playlists || playlists.length === 0) {
            const profileResp = await this._neteaseApi('/api/nuser/account/get');
            const uid = profileResp?.ok ? (profileResp?.data?.account?.id || profileResp?.data?.profile?.userId) : null;
            if (!uid) { this._showToast('请先登录网易云音乐'); return; }
            const resp = await this._neteaseApi('/api/user/playlist', { uid, limit: 50, offset: 0 });
            playlists = resp?.ok ? (resp?.data?.playlist || []) : [];
            this._userPlaylists = playlists;
            this._userId = uid;
        }

        const myPlaylists = playlists.filter(pl => pl.creator?.userId === this._userId || pl.userId === this._userId);
        if (myPlaylists.length === 0) { this._showToast('未找到可用歌单'); return; }

        let existing = this._el?.querySelector('.mc-playlist-picker-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'mc-playlist-picker-overlay';
        overlay.innerHTML = `
            <div class="mc-playlist-picker">
                <div class="mc-playlist-picker-header">
                    <span>收藏到歌单</span>
                    <button class="mc-playlist-picker-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="mc-playlist-picker-list">
                    ${myPlaylists.map(pl => `
                        <div class="mc-playlist-picker-item" data-pl-id="${pl.id}" data-pl-name="${this._esc(pl.name || '')}">
                            <div class="mc-playlist-picker-cover">
                                ${pl.coverImgUrl ? `<img src="${this._esc(pl.coverImgUrl)}?param=40y40" alt="">` : '<i class="fas fa-music"></i>'}
                            </div>
                            <div class="mc-playlist-picker-info">
                                <div class="mc-playlist-picker-name">${this._esc(pl.name || '未命名歌单')}</div>
                                <div class="mc-playlist-picker-count">${pl.trackCount || 0} 首</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        this._el?.appendChild(overlay);

        overlay.querySelector('.mc-playlist-picker-close')?.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelectorAll('.mc-playlist-picker-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const pid = item.dataset.plId;
                const pName = item.dataset.plName;
                item.style.opacity = '0.5';
                item.style.pointerEvents = 'none';
                const resp = await this._neteaseApi('/api/playlist/manipulate/tracks', { op: 'add', pid, trackIds: songId }, 'POST');
                if (resp?.ok && (resp?.data?.code === 200 || resp?.data?.body?.code === 200)) {
                    this._showToast(`已添加到: ${pName}`);
                    overlay.remove();
                } else if (resp?.data?.code === 502 || resp?.data?.body?.code === 502) {
                    this._showToast('歌曲已存在于该歌单');
                    item.style.opacity = '1';
                    item.style.pointerEvents = 'auto';
                } else {
                    this._showToast('添加失败，请重试');
                    item.style.opacity = '1';
                    item.style.pointerEvents = 'auto';
                }
            });
        });
    }

    async _showSimiSongs(songId, songTitle) {
        if (!songId) return;
        this._showToast('正在查找相似歌曲...');
        const resp = await this._neteaseApi('/api/v1/discovery/simiSong', { songid: songId, limit: 10, offset: 0 }, 'POST');
        const simiSongs = resp?.ok ? (resp?.data?.songs || []) : [];
        if (simiSongs.length === 0) {
            this._showToast('暂无相似歌曲推荐');
            return;
        }

        const songs = simiSongs.map((s, i) => {
            const ar = (s.artists || s.ar || []).map(a => ({ id: a.id, name: a.name }));
            return { title: s.name || '', artist: ar.map(a => a.name).join('/'), artists: ar, albumId: s.album?.id || s.al?.id || null, songId: s.id, index: i };
        });

        this._actionSheetEl?.classList.remove('mc-artist-workspace');
        this._actionSheetEl?.classList.add('mc-similar-workspace');
        const headerHtml = `
            <div class="mc-simi-header">
                <div class="mc-workspace-kicker"><i class="fas fa-project-diagram"></i> SONG RADIO</div>
                <div class="mc-simi-heading">
                    <div><span>从这首歌继续发现</span><strong>${this._esc(songTitle)}</strong></div>
                    <button class="mc-as-close" id="mc-as-close" type="button" aria-label="返回播放"><i class="fas fa-arrow-left"></i><span>返回播放</span></button>
                </div>
                <p>相似结果会形成独立队列；开始播放后，底部播放条与队列高亮会保持同一首歌。</p>
            </div>
        `;

        this._openActionSheet(headerHtml, [{
            key: 'simi', label: '相似歌曲',
            onActivate: (body) => {
                body.innerHTML = songs.map((song, idx) => `
                    <div class="mc-row mc-simi-row" data-song-id="${song.songId || ''}" data-index="${idx}">
                        <span class="mc-row-num">${idx + 1}</span>
                        <div class="mc-row-info">
                            <span class="mc-row-title">${this._esc(song.title)}</span>
                            <span class="mc-row-artist">${this._renderArtistLink(song.artists, song.artist)}</span>
                        </div>
                        <button class="mc-row-add-queue" data-song-id="${song.songId || ''}" title="加入队列"><i class="fas fa-plus"></i></button>
                        <button class="mc-row-play"><i class="fas fa-play"></i></button>
                    </div>
                `).join('');

                body.querySelectorAll('.mc-artist-link').forEach(link => {
                    link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
                });

                body.querySelectorAll('.mc-simi-row').forEach(item => {
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.mc-row-add-queue') || e.target.closest('.mc-artist-link')) return;
                        e.stopPropagation();
                        const sid = item.dataset.songId;
                        if (sid) {
                            this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                            this._currentPlaylistName = `相似: ${songTitle}`;
                            this._savePlaylistCache();
                            this._playSongById(sid);
                            this._closeActionSheet();
                        }
                    });
                });

                body.querySelectorAll('.mc-row-add-queue').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const sid = btn.dataset.songId;
                        const s = songs.find(x => String(x.songId) === String(sid));
                        if (s) {
                            this._addSongToQueue(s);
                            this._showToast(`已加入队列: ${s.title}`);
                            btn.innerHTML = '<i class="fas fa-check"></i>';
                            btn.disabled = true;
                        }
                    });
                });

                body.querySelectorAll('.mc-simi-row').forEach((row, idx) => {
                    row.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this._showSongContextMenu(e, songs[idx] || {});
                    });
                });
            }
        }], 'simi');
        this._actionSheetEl?.querySelector('#mc-as-close')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeActionSheet();
        });
    }

    _renderFMUI() {
        const pane = this._el?.querySelector('#mc-pane-discover');
        if (!pane || !this._fmMode || !this._fmQueue) return;
        const song = this._fmQueue[this._fmIndex];
        if (!song) return;

        pane.innerHTML = `
            <div class="mc-fm-container">
                <div class="mc-fm-header">
                    <div class="mc-fm-badge"><i class="fas fa-broadcast-tower"></i> 私人FM</div>
                    <button class="mc-fm-exit" title="退出私人FM"><i class="fas fa-arrow-left"></i><span>退出 FM</span></button>
                </div>
                <div class="mc-fm-reason">
                    <div class="mc-fm-reason-icon"><i class="fas fa-wand-magic-sparkles"></i></div>
                    <div>
                        <div class="mc-fm-reason-title">根据你的音乐口味推荐</div>
                        <div class="mc-fm-reason-desc">喜欢会优化后续推荐；不喜欢将跳过并减少相似内容。</div>
                    </div>
                </div>
                <div class="mc-fm-sync-status" data-song-id="${song.songId}">
                    <span><i class="fas fa-volume-up"></i> 此刻播放</span>
                    <strong>${this._esc(song.title)}</strong>
                    <small>${this._esc(song.artist)} · 队列第 ${this._fmIndex + 1} 首</small>
                    <em><i class="fas fa-check-circle"></i> 已与底部播放条同步</em>
                </div>
                <div class="mc-fm-controls">
                    <button class="mc-fm-btn mc-fm-like" title="喜欢"><i class="fas fa-heart"></i><span>喜欢</span></button>
                    <button class="mc-fm-btn mc-fm-trash" title="不喜欢"><i class="fas fa-heart-broken"></i><span>不喜欢</span></button>
                    <button class="mc-fm-btn mc-fm-next" title="下一首"><i class="fas fa-step-forward"></i><span>下一首</span></button>
                </div>
            </div>
        `;

        pane.querySelector('.mc-fm-exit')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._fmMode = false;
            this._loadRecommended();
        });
        pane.querySelector('.mc-fm-trash')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._fmTrash();
        });
        pane.querySelector('.mc-fm-like')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleLike(song.songId);
        });
        pane.querySelector('.mc-fm-next')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._fmNext();
        });
    }

    // ===================== 心动模式 (v3.13.0) =====================

    async _startHeartbeatMode(songs) {
        if (!songs || songs.length === 0) return;
        const pid = this._currentPlaylistId;
        if (!pid) {
            this._showToast('心动模式需要在歌单中使用');
            return;
        }

        const startSong = songs.find(s => s.songId == this._currentSongId) || songs[0];
        this._showToast('正在加载心动模式...');

        const resp = await this._neteaseApi('/api/playmode/intelligence/list', {
            id: startSong.songId,
            pid: pid,
            sid: startSong.songId,
            type: 'fromPlayOne',
        });

        const intelligenceList = resp?.ok ? (resp?.data?.data || []) : [];
        if (intelligenceList.length === 0) {
            this._showToast('心动模式暂无推荐');
            return;
        }

        const heartSongs = intelligenceList.map((item, i) => {
            const s = item.songInfo || item;
            return {
                title: s.name || '',
                artist: (s.ar || s.artists || []).map(a => a.name).join('/'),
                songId: s.id,
                index: i,
                isActive: false,
            };
        });

        this._playlist = heartSongs;
        this._currentPlaylistName = '心动模式';
        this._savePlaylistCache();
        this._setPlayMode('sequence');

        if (heartSongs[0]?.songId) {
            this._playSongById(heartSongs[0].songId);
        }
        this._showToast(`心动模式已开启，${heartSongs.length} 首推荐`);
    }

    // ===================== 分类随机听 (v3.13.0) =====================

    _CAT_PRESETS = [
        { name: '华语', icon: 'music' },
        { name: '流行', icon: 'fire' },
        { name: '摇滚', icon: 'guitar' },
        { name: '民谣', icon: 'leaf' },
        { name: '电子', icon: 'bolt' },
        { name: '说唱', icon: 'microphone' },
        { name: '古风', icon: 'feather' },
        { name: '轻音乐', icon: 'cloud' },
        { name: 'R&B/Soul', icon: 'heart' },
        { name: '爵士', icon: 'wine-glass' },
        { name: '古典', icon: 'theater-masks' },
        { name: '乡村', icon: 'tree' },
        { name: '欧美', icon: 'globe-americas' },
        { name: '日语', icon: 'sun' },
        { name: '韩语', icon: 'star' },
        { name: '粤语', icon: 'comment' },
        { name: 'ACG', icon: 'gamepad' },
        { name: '影视原声', icon: 'film' },
        { name: '学习', icon: 'book' },
        { name: '工作', icon: 'briefcase' },
        { name: '运动', icon: 'running' },
        { name: '睡眠', icon: 'moon' },
        { name: '放松', icon: 'spa' },
        { name: '驾车', icon: 'car' },
    ];

    _loadCategoryTags(pane) {
        const container = pane?.querySelector('#mc-cat-tags');
        if (!container) return;

        container.innerHTML = this._CAT_PRESETS.map(cat =>
            `<button class="mc-cat-tag" data-cat="${this._esc(cat.name)}" title="随机播放${cat.name}歌单"><i class="fas fa-${cat.icon}"></i> ${this._esc(cat.name)}</button>`
        ).join('');

        container.querySelectorAll('.mc-cat-tag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._playCategoryRandom(btn.dataset.cat, btn);
            });
        });
    }

    async _playCategoryRandom(cat, btn) {
        if (this._catLoading) return;
        this._catLoading = true;
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.classList.add('mc-cat-tag-loading');

        try {
            const offset = Math.floor(Math.random() * 10) * 6;
            const resp = await this._neteaseApi('/api/playlist/list', {
                cat,
                order: 'hot',
                limit: 6,
                offset,
                total: true,
            });

            const playlists = resp?.ok ? (resp?.data?.playlists || []) : [];
            if (playlists.length === 0) {
                this._showToast(`"${cat}" 分类暂无歌单`);
                return;
            }

            const picked = playlists[Math.floor(Math.random() * playlists.length)];
            this._showToast(`正在加载「${picked.name}」...`);
            this._loadPlaylistSongsViaApi(picked.id, null);
        } catch (e) {
            this._showToast('加载失败，请重试');
        } finally {
            btn.innerHTML = origHtml;
            btn.classList.remove('mc-cat-tag-loading');
            this._catLoading = false;
        }
    }

    // ===================== 推荐歌曲 API (v2.9.0) =====================

    async _loadRecommended() {
        const pane = this._el?.querySelector('#mc-pane-discover');
        if (!pane) return;

        if (this._fmMode) {
            this._renderFMUI();
            return;
        }

        const loadId = (this._discoverLoadId = (this._discoverLoadId || 0) + 1);
        const isStale = () => this._discoverLoadId !== loadId;

        pane.innerHTML = `
            <div id="mc-discover-songs"><div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div></div>
            <div id="mc-discover-playlists"></div>
            <div id="mc-discover-toplist"></div>
            <div id="mc-discover-newsongs"></div>
        `;

        const loadSongs = async () => {
            const songsEl = pane.querySelector('#mc-discover-songs');
            if (!songsEl || isStale()) return false;
            try {
                const dailySongs = await this._fetchDailyRecommendationSongs();
                if (isStale()) return false;
                if (dailySongs?.length > 0) {
                    this._recommendSongs = dailySongs;
                    if (!isStale()) { songsEl.innerHTML = ''; this._renderRecommend(songsEl, this._recommendSongs, '每日推荐'); }
                    return true;
                }
            } catch { /* fallback below */ }

            if (isStale()) return false;
            try {
                const hotResp = await this._neteaseApi('/api/playlist/detail', { id: 3778678, n: 20 });
                if (isStale()) return false;
                const hotPlaylist = hotResp?.ok ? (hotResp?.data?.playlist || hotResp?.data?.result?.playlist) : null;
                if (hotPlaylist?.tracks?.length > 0) {
                    const songs = hotPlaylist.tracks.slice(0, 20).map((s, i) => {
                        const ar = (s.ar || []).map(a => ({ id: a.id, name: a.name }));
                        return { title: s.name, artist: ar.map(a => a.name).join('/'), artists: ar, albumId: s.al?.id || null, songId: s.id, index: i };
                    });
                    this._recommendSongs = songs;
                    if (!isStale()) { songsEl.innerHTML = ''; this._renderRecommend(songsEl, songs, '热门歌曲'); }
                    return true;
                }
            } catch { /* ignore */ }

            if (!isStale()) songsEl.innerHTML = '';
            return false;
        };

        const loadPlaylists = async (hasSongsPromise) => {
            const target = pane.querySelector('#mc-discover-playlists');
            if (!target || isStale()) return;
            const hasSongs = await hasSongsPromise;
            if (!isStale()) await this._loadRecommendPlaylists(target, hasSongs);
        };

        const loadToplist = async () => {
            const target = pane.querySelector('#mc-discover-toplist');
            if (!target || isStale()) return;
            await this._loadToplistSection(target);
        };

        const loadNewSongs = async () => {
            const target = pane.querySelector('#mc-discover-newsongs');
            if (!target || isStale()) return;
            await this._loadNewSongsSection(target);
        };

        const songsPromise = loadSongs();
        await Promise.allSettled([songsPromise, loadPlaylists(songsPromise), loadToplist(), loadNewSongs()]);

        if (!isStale() && pane.querySelector('#mc-discover-songs')?.innerHTML === '' &&
            pane.querySelector('#mc-discover-playlists')?.innerHTML === '' &&
            pane.querySelector('#mc-discover-toplist')?.innerHTML === '' &&
            pane.querySelector('#mc-discover-newsongs')?.innerHTML === '') {
            pane.innerHTML = '<div class="mc-empty">加载失败，请切换 Tab 后重试</div>';
        }
    }

    async _fetchDailyRecommendationSongs() {
        const resp = await this._neteaseApi('/api/v3/discovery/recommend/songs');
        const dailySongs = resp?.ok ? (resp?.data?.data?.dailySongs || resp?.data?.dailySongs) : [];
        return Array.isArray(dailySongs) ? dailySongs.map((song, index) => {
            const artists = (song.ar || []).map(artist => ({ id: artist.id, name: artist.name }));
            return {
                title: song.name || '',
                artist: artists.map(artist => artist.name).join('/'),
                artists,
                albumId: song.al?.id || null,
                cover: song.al?.picUrl ? `${song.al.picUrl}?param=200y200` : '',
                album: song.al?.name || '',
                duration: song.dt || song.duration || 0,
                songId: song.id,
                index,
            };
        }).filter(song => song.songId) : [];
    }

    async _loadRecommendPlaylists(pane, hasSongs) {
        if (!pane) return;

        const [plResp, dailyResp] = await Promise.allSettled([
            this._neteaseApi('/api/personalized/playlist', { limit: 6 }),
            this._neteaseApi('/api/recommend/resource', {}, 'POST'),
        ]);
        const playlists = plResp.status === 'fulfilled' && plResp.value?.ok ? (plResp.value?.data?.result || []) : [];
        const dailyPl = dailyResp.status === 'fulfilled' && dailyResp.value?.ok ? (dailyResp.value?.data?.recommend || []) : [];

        const allPlaylists = [];
        const seenIds = new Set();
        for (const pl of dailyPl.slice(0, 6)) {
            if (pl.id && !seenIds.has(pl.id)) { seenIds.add(pl.id); allPlaylists.push({ ...pl, copywriter: pl.copywriter || '' }); }
        }
        for (const pl of playlists) {
            if (pl.id && !seenIds.has(pl.id)) { seenIds.add(pl.id); allPlaylists.push(pl); }
        }

        if (allPlaylists.length === 0 && !hasSongs) {
            pane.innerHTML = '<div class="mc-empty">暂无推荐，请确认已登录网易云</div>';
            return;
        }
        if (allPlaylists.length === 0) return;

        const plHtml = `
            <div class="mc-discover-playlists">
                <div class="mc-rec-header" style="margin-top:8px">
                    <div class="mc-rec-tag"><i class="fas fa-compact-disc"></i> 推荐歌单</div>
                </div>
                <div class="mc-pl-grid">
                    ${allPlaylists.slice(0, 9).map(pl => `
                        <div class="mc-pl-card" data-pl-id="${pl.id || ''}" title="${this._esc((pl.copywriter ? pl.copywriter + '\n' : '') + (pl.name || ''))}">
                            <div class="mc-pl-card-cover">
                                ${pl.picUrl ? `<img src="${this._esc(pl.picUrl)}?param=120y120" alt="" loading="lazy" onerror="this.style.display='none'">` : '<i class="fas fa-music"></i>'}
                                <div class="mc-pl-card-play"><i class="fas fa-play"></i></div>
                                ${pl.playCount || pl.playcount ? `<span class="mc-pl-card-count"><i class="fas fa-headphones"></i> ${this._formatCount(pl.playCount || pl.playcount)}</span>` : ''}
                            </div>
                            <div class="mc-pl-card-name">${this._esc(pl.name || '未命名歌单')}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        pane.insertAdjacentHTML('beforeend', plHtml);

        pane.querySelectorAll('.mc-pl-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const plId = card.dataset.plId;
                if (plId) this._loadPlaylistSongsViaApi(plId, null);
            });
        });
    }

    async _loadToplistSection(pane) {
        if (!pane) return;
        const resp = await this._neteaseApi('/api/toplist');
        const list = resp?.ok ? (resp?.data?.list || []) : [];
        if (list.length === 0) return;

        const topCharts = list.slice(0, 6);

        const html = `
            <div class="mc-toplist-section">
                <div class="mc-rec-header" style="margin-top:8px">
                    <div class="mc-rec-tag"><i class="fas fa-chart-line"></i> 排行榜</div>
                </div>
                <div class="mc-toplist-grid">
                    ${topCharts.map(chart => `
                        <div class="mc-toplist-card" data-pl-id="${chart.id || ''}" title="${this._esc(chart.name || '')}">
                            <div class="mc-toplist-cover">
                                ${chart.coverImgUrl ? `<img src="${this._esc(chart.coverImgUrl)}?param=80y80" alt="" loading="lazy" onerror="this.style.display='none'">` : '<i class="fas fa-trophy"></i>'}
                                <div class="mc-toplist-play-overlay"><i class="fas fa-play"></i></div>
                                ${chart.updateFrequency ? `<span class="mc-toplist-freq">${this._esc(chart.updateFrequency)}</span>` : ''}
                            </div>
                            <div class="mc-toplist-name">${this._esc(chart.name || '')}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        pane.insertAdjacentHTML('beforeend', html);

        pane.querySelectorAll('.mc-toplist-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const plId = card.dataset.plId;
                if (plId) this._loadPlaylistSongsViaApi(plId, null);
            });
        });
    }

    async _loadNewSongsSection(pane) {
        if (!pane) return;
        const types = [{ type: 0, label: '全部' }, { type: 7, label: '华语' }, { type: 96, label: '欧美' }, { type: 8, label: '日语' }, { type: 16, label: '韩语' }];

        const html = `
            <div class="mc-newsong-section">
                <div class="mc-rec-header" style="margin-top:8px">
                    <div class="mc-rec-tag"><i class="fas fa-fire"></i> 新歌速递</div>
                </div>
                <div class="mc-newsong-tabs">
                    ${types.map((t, i) => `<button class="mc-newsong-tab${i === 0 ? ' active' : ''}" data-type="${t.type}">${t.label}</button>`).join('')}
                </div>
                <div class="mc-newsong-list" id="mc-newsong-list">
                    <div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>
                </div>
            </div>
        `;
        pane.insertAdjacentHTML('beforeend', html);

        const listEl = pane.querySelector('#mc-newsong-list');
        const loadType = async (type) => {
            if (!listEl) return;
            listEl.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
            const resp = await this._neteaseApi('/api/v1/discovery/new/songs', { areaId: type, total: true }, 'POST');
            const data = resp?.ok ? (resp?.data?.data || resp?.data?.result || []) : [];
            if (data.length === 0) { listEl.innerHTML = '<div class="mc-empty">暂无新歌</div>'; return; }

            const songs = data.slice(0, 10).map((s, i) => {
                const ar = (s.artists || s.ar || []).map(a => ({ id: a.id, name: a.name }));
                return { title: s.name || '', artist: ar.map(a => a.name).join('/'), artists: ar, albumId: s.album?.id || s.al?.id || null, songId: s.id, index: i };
            });

            listEl.innerHTML = songs.map((song, idx) => `
                <div class="mc-row mc-newsong-row" data-song-id="${song.songId || ''}" data-index="${idx}">
                    <span class="mc-row-num">${idx + 1}</span>
                    <div class="mc-row-info">
                        <span class="mc-row-title">${this._esc(song.title)}</span>
                        <span class="mc-row-artist">${this._renderArtistLink(song.artists, song.artist)}</span>
                    </div>
                    <button class="mc-row-add-queue" data-song-id="${song.songId || ''}" title="加入队列"><i class="fas fa-plus"></i></button>
                    <button class="mc-row-play"><i class="fas fa-play"></i></button>
                </div>
            `).join('');

            listEl.querySelectorAll('.mc-artist-link').forEach(link => {
                link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
            });

            listEl.querySelectorAll('.mc-newsong-row').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.mc-row-add-queue') || e.target.closest('.mc-artist-link')) return;
                    e.stopPropagation();
                    const sid = item.dataset.songId;
                    if (sid) {
                        this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                        this._currentPlaylistName = '新歌速递';
                        this._savePlaylistCache();
                        this._playSongById(sid);
                    }
                });
            });

            listEl.querySelectorAll('.mc-row-add-queue').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sid = btn.dataset.songId;
                    const s = songs.find(x => String(x.songId) === String(sid));
                    if (s) { this._addSongToQueue(s); this._showToast(`已加入队列: ${s.title}`); btn.innerHTML = '<i class="fas fa-check"></i>'; btn.disabled = true; }
                });
            });

            listEl.querySelectorAll('.mc-newsong-row').forEach((row, idx) => {
                row.addEventListener('contextmenu', (e) => { e.preventDefault(); this._showSongContextMenu(e, songs[idx] || {}); });
            });
        };

        pane.querySelectorAll('.mc-newsong-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                pane.querySelectorAll('.mc-newsong-tab').forEach(t => t.classList.toggle('active', t === tab));
                loadType(Number(tab.dataset.type));
            });
        });

        await loadType(0);
    }

    _formatCount(n) {
        if (!n) return '0';
        if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
        if (n >= 10000) return (n / 10000).toFixed(1) + '万';
        return String(n);
    }

    _renderRecommend(pane, songs, label) {
        const gradients = [0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06];
        const checkedIn = this._isDailyCheckedIn();
        pane.innerHTML = `
        <div class="mc-fm-entry" id="mc-fm-entry">
            <div class="mc-fm-entry-icon"><i class="fas fa-broadcast-tower"></i></div>
            <div class="mc-fm-entry-text">
                <div class="mc-fm-entry-title">私人FM</div>
                <div class="mc-fm-entry-desc">根据你的口味推荐歌曲</div>
            </div>
            <div class="mc-fm-entry-play"><i class="fas fa-play"></i></div>
        </div>
        <div class="mc-fm-entry mc-checkin-entry${checkedIn ? ' mc-checkin-done' : ''}" id="mc-checkin-entry">
            <div class="mc-fm-entry-icon mc-checkin-icon"><i class="fas ${checkedIn ? 'fa-check-circle' : 'fa-calendar-check'}"></i></div>
            <div class="mc-fm-entry-text">
                <div class="mc-fm-entry-title">${checkedIn ? '已签到' : '每日签到'}</div>
                <div class="mc-fm-entry-desc">${checkedIn ? '今日已完成签到' : '签到领取云贝奖励'}</div>
            </div>
            ${checkedIn ? '<div class="mc-fm-entry-play mc-checkin-check"><i class="fas fa-check"></i></div>' : '<div class="mc-fm-entry-play"><i class="fas fa-arrow-right"></i></div>'}
        </div>
        <div class="mc-cat-section">
            <div class="mc-rec-header">
                <div class="mc-rec-tag"><i class="fas fa-th-large"></i> 分类随机听</div>
            </div>
            <div class="mc-cat-tags" id="mc-cat-tags"></div>
        </div>
        <div class="mc-rec-compact">
            <div class="mc-rec-header">
                <div class="mc-rec-tag"><i class="fas fa-calendar-day"></i> ${this._esc(label)}</div>
                <div class="mc-rec-actions">
                    <button class="mc-rec-action-btn" id="mc-rec-play-all" title="播放全部"><i class="fas fa-play"></i> 全部</button>
                    <button class="mc-rec-action-btn" id="mc-rec-shuffle" title="随机播放"><i class="fas fa-random"></i></button>
                </div>
            </div>
            ${songs.map((song, idx) => `
                <div class="mc-row mc-rec-row" data-song-id="${song.songId || ''}" data-index="${idx}">
                    <span class="mc-row-num" style="color:rgba(200,160,255,${gradients[idx] || 0.06})">${idx + 1}</span>
                    <div class="mc-row-info">
                        <span class="mc-row-title">${this._esc(song.title)}</span>
                        <span class="mc-row-artist">${this._renderArtistLink(song.artists, song.artist)}</span>
                    </div>
                    <button class="mc-row-add-queue" data-song-id="${song.songId || ''}" title="加入队列"><i class="fas fa-plus"></i></button>
                    <button class="mc-row-like" data-song-id="${song.songId || ''}" title="添加到我喜欢"><i class="fas fa-heart"></i></button>
                    <button class="mc-row-play"><i class="fas fa-play"></i></button>
                </div>
            `).join('')}
        </div>`;

        pane.querySelector('#mc-fm-entry')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._startPersonalFM();
        });

        pane.querySelector('#mc-checkin-entry')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this._isDailyCheckedIn()) this._doDailyCheckin();
        });

        this._loadCategoryTags(pane);

        pane.querySelector('#mc-rec-play-all')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (songs.length > 0) {
                this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                this._currentPlaylistName = label;
                this._savePlaylistCache();
                this._setPlayMode('sequence');
                if (songs[0].songId) this._playSongById(songs[0].songId);
            }
        });

        pane.querySelector('#mc-rec-shuffle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (songs.length > 0) {
                this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                this._currentPlaylistName = label;
                this._savePlaylistCache();
                this._setPlayMode('shuffle');
                this._generateShuffleQueue();
                const randIdx = this._shuffleQueue[0];
                if (songs[randIdx]?.songId) this._playSongById(songs[randIdx].songId);
            }
        });

        pane.querySelectorAll('.mc-rec-row .mc-artist-link').forEach(link => {
            link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
        });

        pane.querySelectorAll('.mc-rec-row').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-like') || e.target.closest('.mc-row-play') || e.target.closest('.mc-row-add-queue') || e.target.closest('.mc-artist-link')) return;
                e.stopPropagation();
                const songId = item.dataset.songId;
                if (songId) {
                    if (this._playlist.length === 0 || this._currentPlaylistName !== label) {
                        this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                        this._currentPlaylistName = label;
                        this._savePlaylistCache();
                    }
                    this._playSongById(songId);
                }
            });
        });

        pane.querySelectorAll('.mc-rec-row .mc-row-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.mc-rec-row');
                const songId = row?.dataset.songId;
                if (songId) {
                    if (this._playlist.length === 0 || this._currentPlaylistName !== label) {
                        this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                        this._currentPlaylistName = label;
                        this._savePlaylistCache();
                    }
                    this._playSongById(songId);
                }
            });
        });

        pane.querySelectorAll('.mc-rec-row .mc-row-add-queue').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                const song = songs.find(s => String(s.songId) === String(songId));
                if (song) {
                    this._addSongToQueue(song);
                    this._showToast(`已加入队列: ${song.title}`);
                    btn.innerHTML = '<i class="fas fa-check"></i>';
                    btn.disabled = true;
                }
            });
        });

        pane.querySelectorAll('.mc-rec-row .mc-row-like').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                if (songId) this._likeSong(songId, btn);
            });
        });

        pane.querySelectorAll('.mc-rec-row').forEach((row, idx) => {
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showSongContextMenu(e, songs[idx] || {});
            });
        });
    }

    // ===================== 搜索 (v2.9.0 增强) =====================

    _onSearchInputChange() {
        const input = this._el?.querySelector('#mc-search-input');
        const clearBtn = this._el?.querySelector('#mc-search-clear');
        const q = input?.value?.trim() || '';
        if (input && clearBtn) {
            clearBtn.classList.toggle('hidden', !q);
        }
        if (this._suggestTimer) clearTimeout(this._suggestTimer);
        if (!q) {
            this._hideSuggest();
            return;
        }
        this._suggestTimer = setTimeout(() => this._fetchSuggest(q), 300);
    }

    async _fetchSuggest(query) {
        if (!query) return;
        try {
            const resp = await this._neteaseApi('/api/search/suggest/web', { s: query }, 'POST');
            const result = resp?.ok ? resp?.data?.result : null;
            if (!result) { this._hideSuggest(); return; }

            const input = this._el?.querySelector('#mc-search-input');
            if (input?.value?.trim() !== query) return;

            const items = [];
            const songs = (result.songs || []).slice(0, 4);
            const artists = (result.artists || []).slice(0, 2);
            const albums = (result.albums || []).slice(0, 2);
            const playlists = (result.playlists || []).slice(0, 2);

            songs.forEach(s => items.push({ type: 'song', id: s.id, name: s.name, sub: (s.artists || []).map(a => a.name).join('/'), icon: 'fa-music' }));
            artists.forEach(a => items.push({ type: 'artist', id: a.id, name: a.name, sub: '', icon: 'fa-user' }));
            albums.forEach(a => items.push({ type: 'album', id: a.id, name: a.name, sub: a.artist?.name || '', icon: 'fa-compact-disc' }));
            playlists.forEach(p => items.push({ type: 'playlist', id: p.id, name: p.name, sub: `${p.trackCount || 0}首`, icon: 'fa-list' }));

            if (items.length === 0) { this._hideSuggest(); return; }
            this._renderSuggest(items, query);
        } catch { this._hideSuggest(); }
    }

    _renderSuggest(items, query) {
        let container = this._el?.querySelector('#mc-suggest-dropdown');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mc-suggest-dropdown';
            container.className = 'mc-suggest-dropdown';
            const searchBar = this._el?.querySelector('.mc-search-bar');
            if (searchBar) { searchBar.style.position = 'relative'; searchBar.appendChild(container); }
            else return;
        }
        container.innerHTML = items.map((item, i) => `
            <div class="mc-suggest-item" data-type="${item.type}" data-id="${item.id}" data-name="${this._esc(item.name)}">
                <i class="fas ${item.icon} mc-suggest-icon"></i>
                <div class="mc-suggest-text">
                    <span class="mc-suggest-name">${this._esc(item.name)}</span>
                    ${item.sub ? `<span class="mc-suggest-sub">${this._esc(item.sub)}</span>` : ''}
                </div>
                <span class="mc-suggest-type">${item.type === 'song' ? '歌曲' : item.type === 'artist' ? '歌手' : item.type === 'album' ? '专辑' : '歌单'}</span>
            </div>
        `).join('');
        container.classList.add('show');

        container.querySelectorAll('.mc-suggest-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this._hideSuggest();
                const type = el.dataset.type;
                const id = el.dataset.id;
                const name = el.dataset.name;
                if (type === 'song') {
                    this._playSongById(Number(id));
                } else if (type === 'artist') {
                    this._openArtistActionSheet(Number(id), name, '');
                } else if (type === 'album') {
                    this._openAlbumFromCtx(Number(id));
                } else if (type === 'playlist') {
                    this._loadPlaylistSongsViaApi(id, null);
                }
            });
        });
    }

    _hideSuggest() {
        const container = this._el?.querySelector('#mc-suggest-dropdown');
        if (container) container.classList.remove('show');
    }

    _resetSearchView() {
        const resultsEl = this._el?.querySelector('#mc-search-results');
        if (resultsEl) {
            resultsEl.innerHTML = '<div class="mc-search-history" id="mc-search-history-area"></div>';
        }
        this._renderSearchHistory();
    }

    _renderSearchHistory() {
        const area = this._el?.querySelector('#mc-search-history-area');
        if (!area) return;
        if (this._searchHistory.length === 0) { area.innerHTML = ''; return; }
        area.innerHTML = `
            <div class="mc-rec-compact" style="padding-top:4px">
                <div class="mc-search-history-header">
                    <div class="mc-rec-tag"><i class="fas fa-history"></i> 搜索历史</div>
                    <button class="mc-search-history-clear" title="清除搜索历史"><i class="fas fa-trash-alt"></i> 清除</button>
                </div>
                <div class="mc-hot-tags">
                    ${this._searchHistory.map(q => `<span class="mc-hot-tag mc-history-tag" data-query="${this._esc(q)}">${this._esc(q)}<i class="fas fa-times mc-history-tag-del" data-query="${this._esc(q)}"></i></span>`).join('')}
                </div>
            </div>
        `;
        area.querySelectorAll('.mc-history-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                if (e.target.closest('.mc-history-tag-del')) return;
                e.stopPropagation();
                const q = tag.dataset.query;
                const input = this._el?.querySelector('#mc-search-input');
                if (input) input.value = q;
                this._performSearch(q);
            });
        });
        area.querySelectorAll('.mc-history-tag-del').forEach(del => {
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                const q = del.dataset.query;
                this._searchHistory = this._searchHistory.filter(h => h !== q);
                this._saveSearchHistory();
                this._renderSearchHistory();
            });
        });
        area.querySelector('.mc-search-history-clear')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._clearSearchHistory();
        });
    }

    _clearSearchHistory() {
        this._searchHistory = [];
        this._saveSearchHistory();
        this._searchType = 1;
        const el = this._el;
        if (el) {
            el.querySelectorAll('.mc-search-type').forEach(b => b.classList.toggle('active', b.dataset.type === '1'));
        }
        const input = this._el?.querySelector('#mc-search-input');
        if (input) input.value = '';
        this._onSearchInputChange();
        this._resetSearchView();
    }

    async _performSearch(query) {
        if (!query?.trim()) return;
        this._hideSuggest();
        const resultsEl = this._el?.querySelector('#mc-search-results');
        if (!resultsEl) return;

        this._searchHistory = [query.trim(), ...this._searchHistory.filter(q => q !== query.trim())].slice(0, 10);
        this._saveSearchHistory();
        this._onSearchInputChange();

        const searchType = this._searchType || 1;
        const searchVer = ++this._searchVer;
        resultsEl.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 搜索中...</div>';

        if (searchType === 1000) {
            await this._searchPlaylists(query.trim(), resultsEl, searchVer);
        } else if (searchType === 100) {
            await this._searchArtists(query.trim(), resultsEl, searchVer);
        } else {
            await this._searchSongs(query.trim(), resultsEl, searchVer);
        }
    }

    async _searchSongs(query, resultsEl, ver) {
        const apiResp = await this._neteaseApi('/api/search/get/web', { s: query, type: 1, limit: 20, offset: 0 });
        if (ver !== undefined && ver !== this._searchVer) return;
        const results = (apiResp?.ok && apiResp?.data?.result?.songs)
            ? apiResp.data.result.songs.map((s, idx) => {
                const ar = (s.artists || s.ar || []).map(a => ({ id: a.id, name: a.name }));
                return { index: idx, title: s.name || '', artist: ar.map(a => a.name).join('/') || '', artists: ar, albumId: s.album?.id || s.al?.id || null, songId: s.id };
            })
            : [];

        if (results.length === 0) {
            resultsEl.innerHTML = '<div class="mc-empty">未找到相关歌曲</div>';
            return;
        }

        resultsEl.innerHTML = results.map((song, idx) => `
            <div class="mc-row mc-search-row" data-song-id="${song.songId || ''}" data-index="${song.index}">
                <span class="mc-row-num">${idx + 1}</span>
                <div class="mc-row-info">
                    <span class="mc-row-title">${this._esc(song.title)}</span>
                    <span class="mc-row-artist">${this._renderArtistLink(song.artists, song.artist)}</span>
                </div>
                <button class="mc-row-add-queue" data-song-id="${song.songId || ''}" title="加入队列"><i class="fas fa-plus"></i></button>
                <button class="mc-row-like" data-song-id="${song.songId || ''}" title="添加到我喜欢"><i class="fas fa-heart"></i></button>
                <button class="mc-row-play"><i class="fas fa-play"></i></button>
            </div>
        `).join('');

        resultsEl.querySelectorAll('.mc-artist-link').forEach(link => {
            link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
        });

        resultsEl.querySelectorAll('.mc-search-row').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-like') || e.target.closest('.mc-row-add-queue') || e.target.closest('.mc-artist-link')) return;
                e.stopPropagation();
                item.querySelector('.mc-row-play i')?.classList.replace('fa-play', 'fa-spinner');
                item.querySelector('.mc-row-play i')?.classList.add('fa-spin');
                const songId = item.dataset.songId;
                if (songId) {
                    const searchLabel = `搜索: ${query}`;
                    if (this._playlist.length === 0 || this._currentPlaylistName !== searchLabel) {
                        this._playlist = results.map((s, i) => ({ ...s, index: i, isActive: false }));
                        this._currentPlaylistName = searchLabel;
                        this._savePlaylistCache();
                    }
                    this._playSongById(songId);
                }
            });
        });

        resultsEl.querySelectorAll('.mc-search-row .mc-row-add-queue').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                const song = results.find(s => String(s.songId) === String(songId));
                if (song) {
                    this._addSongToQueue(song);
                    this._showToast(`已加入队列: ${song.title}`);
                    btn.innerHTML = '<i class="fas fa-check"></i>';
                    btn.disabled = true;
                }
            });
        });

        resultsEl.querySelectorAll('.mc-search-row .mc-row-like').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                if (songId) this._likeSong(songId, btn);
            });
        });

        resultsEl.querySelectorAll('.mc-search-row').forEach((row, idx) => {
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showSongContextMenu(e, results[idx] || {});
            });
        });
    }

    async _searchPlaylists(query, resultsEl, ver) {
        const apiResp = await this._neteaseApi('/api/search/get/web', { s: query, type: 1000, limit: 20, offset: 0 });
        if (ver !== undefined && ver !== this._searchVer) return;
        const playlists = apiResp?.ok ? (apiResp?.data?.result?.playlists || []) : [];

        if (playlists.length === 0) {
            resultsEl.innerHTML = '<div class="mc-empty">未找到相关歌单</div>';
            return;
        }

        resultsEl.innerHTML = `<div class="mc-pl-grid mc-search-pl-grid">
            ${playlists.map(pl => `
                <div class="mc-pl-card" data-pl-id="${pl.id || ''}" title="${this._esc(pl.name || '')}">
                    <div class="mc-pl-card-cover">
                        ${pl.coverImgUrl ? `<img src="${this._esc(pl.coverImgUrl)}?param=120y120" alt="" loading="lazy" onerror="this.style.display='none'">` : '<i class="fas fa-music"></i>'}
                        <div class="mc-pl-card-play"><i class="fas fa-play"></i></div>
                        ${pl.playCount ? `<span class="mc-pl-card-count"><i class="fas fa-headphones"></i> ${this._formatCount(pl.playCount)}</span>` : ''}
                    </div>
                    <div class="mc-pl-card-name">${this._esc(pl.name || '未命名歌单')}</div>
                    <div class="mc-pl-card-meta">
                        <span class="mc-pl-card-creator">${this._esc(pl.creator?.nickname || '')}</span>
                        <button class="mc-pl-card-collect" data-pl-id="${pl.id || ''}" data-pl-name="${this._esc(pl.name || '')}" title="收藏歌单"><i class="fas fa-folder-plus"></i></button>
                    </div>
                </div>
            `).join('')}
        </div>`;

        resultsEl.querySelectorAll('.mc-pl-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.mc-pl-card-collect')) return;
                e.stopPropagation();
                const plId = card.dataset.plId;
                if (plId) this._loadPlaylistSongsViaApi(plId, null);
            });
        });

        resultsEl.querySelectorAll('.mc-pl-card-collect').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const plId = btn.dataset.plId;
                const plName = btn.dataset.plName;
                if (plId) this._subscribePlaylist(plId, plName, btn);
            });
        });
    }

    async _searchArtists(query, resultsEl, ver) {
        const apiResp = await this._neteaseApi('/api/search/get/web', { s: query, type: 100, limit: 20, offset: 0 });
        if (ver !== undefined && ver !== this._searchVer) return;
        const artists = apiResp?.ok ? (apiResp?.data?.result?.artists || []) : [];

        if (artists.length === 0) {
            resultsEl.innerHTML = '<div class="mc-empty">未找到相关歌手</div>';
            return;
        }

        resultsEl.innerHTML = `<div class="mc-artist-list">` + artists.map((ar, idx) => `
            <div class="mc-row mc-artist-row" data-artist-id="${ar.id || ''}" data-artist-name="${this._esc(ar.name || '')}"
                 data-artist-img="${this._esc(ar.img1v1Url || '')}">
                <div class="mc-artist-avatar">
                    ${ar.img1v1Url ? `<img src="${this._esc(ar.img1v1Url)}?param=80y80" alt="">` : '<i class="fas fa-user"></i>'}
                </div>
                <div class="mc-row-info">
                    <span class="mc-row-title">${this._esc(ar.name || '')}</span>
                    <span class="mc-row-artist">${ar.albumSize ? ar.albumSize + ' 张专辑' : ''}${ar.albumSize && ar.musicSize ? ' · ' : ''}${ar.musicSize ? ar.musicSize + ' 首歌曲' : ''}</span>
                </div>
                <i class="fas fa-chevron-right mc-artist-chev"></i>
            </div>
        `).join('') + `</div>`;

        resultsEl.querySelectorAll('.mc-artist-row').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const artistId = item.dataset.artistId;
                const artistName = item.dataset.artistName;
                const artistImg = item.dataset.artistImg;
                if (!artistId) return;
                this._openArtistActionSheet(artistId, artistName, artistImg);
            });
        });
    }

    // ===================== 操作台浮层 (v3.15.0) =====================

    _openActionSheet(headerHtml, tabsConfig, defaultTab) {
        const overlay = this._actionSheetEl;
        if (!overlay) return;
        if (overlay.classList.contains('hidden')) this._actionSheetReturnFocus = document.activeElement;
        const header = overlay.querySelector('#mc-as-header');
        const tabsEl = overlay.querySelector('#mc-as-tabs');
        const body = overlay.querySelector('#mc-as-body');
        if (header) header.innerHTML = headerHtml;

        if (tabsConfig && tabsConfig.length > 1) {
            tabsEl.innerHTML = tabsConfig.map(t =>
                `<button class="mc-as-tab${t.key === defaultTab ? ' active' : ''}" data-as-tab="${t.key}">${t.label}</button>`
            ).join('');
            tabsEl.style.display = '';
            tabsEl.querySelectorAll('.mc-as-tab').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tabsEl.querySelectorAll('.mc-as-tab').forEach(b => b.classList.toggle('active', b === btn));
                    const cfg = tabsConfig.find(c => c.key === btn.dataset.asTab);
                    if (cfg?.onActivate) cfg.onActivate(body);
                });
            });
        } else {
            tabsEl.innerHTML = '';
            tabsEl.style.display = 'none';
        }

        if (body) body.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        this._setActionSheetBackgroundInert(true);
        document.body.classList.add('mc-as-open');

        const activeCfg = tabsConfig?.find(t => t.key === defaultTab);
        if (activeCfg?.onActivate) activeCfg.onActivate(body);
        setTimeout(() => overlay.querySelector('#mc-as-close, .mc-as-tab')?.focus(), 0);
    }

    _setActionSheetBackgroundInert(active) {
        if (active) {
            this._actionSheetInertSiblings = [...document.body.children]
                .filter(child => child !== this._actionSheetEl && !child.inert);
            this._actionSheetInertSiblings.forEach(child => { child.inert = true; });
            return;
        }
        (this._actionSheetInertSiblings || []).forEach(child => { child.inert = false; });
        this._actionSheetInertSiblings = [];
    }

    _closeActionSheet() {
        if (this._actionSheetEl) {
            this._actionSheetEl.classList.add('hidden');
            this._actionSheetEl.setAttribute('aria-hidden', 'true');
            this._actionSheetEl.querySelector('#mc-as-body')?.replaceChildren();
            this._actionSheetEl.classList.remove('mc-artist-workspace', 'mc-similar-workspace');
        }
        this._setActionSheetBackgroundInert(false);
        document.body.classList.remove('mc-as-open');
        this._artistNavStack = [];
        this._restoreMusicSurfacePage();
        this._actionSheetReturnFocus?.focus?.();
        this._actionSheetReturnFocus = null;
    }

    async _openArtistActionSheet(artistId, artistName, artistImg) {
        this._setMusicSurfacePage('artist-album');
        this._actionSheetEl?.classList.remove('mc-similar-workspace');
        this._actionSheetEl?.classList.add('mc-artist-workspace');
        let coverImg = artistImg || '';
        let briefDesc = '';

        if (artistId) {
            try {
                const detailResp = await this._neteaseApi('/api/artist/head/info/get', { id: artistId }, 'POST');
                const ad = detailResp?.ok ? (detailResp?.data?.data?.artist || detailResp?.data?.artist) : null;
                if (ad) {
                    coverImg = ad.cover || ad.img1v1Url || coverImg;
                    briefDesc = ad.briefDesc || '';
                }
            } catch { /* fallback to existing img */ }
        }

        const headerHtml = `
            <div class="mc-as-artist-header mc-as-artist-header-enhanced">
                ${coverImg ? `<div class="mc-as-artist-banner" style="background-image:url('${this._esc(coverImg)}?param=1200y420')"></div>` : ''}
                <div class="mc-as-artist-header-content">
                    <div class="mc-as-artist-avatar">
                        ${coverImg ? `<img src="${this._esc(coverImg)}?param=240y240" alt="">` : '<i class="fas fa-user"></i>'}
                    </div>
                    <div class="mc-as-artist-info">
                        <div class="mc-workspace-kicker">ARTIST SPACE</div>
                        <div class="mc-as-artist-name">${this._esc(artistName)}</div>
                        <div class="mc-as-artist-sub">热门歌曲 · 专辑 · 相似艺人</div>
                        ${briefDesc ? `<p class="mc-as-artist-desc">${this._esc(briefDesc.slice(0, 120))}${briefDesc.length > 120 ? '…' : ''}</p>` : ''}
                    </div>
                    <button class="mc-as-close" id="mc-as-close" type="button" aria-label="返回播放"><i class="fas fa-arrow-left"></i><span>返回播放</span></button>
                </div>
            </div>
        `;

        const cached = this._getArtistCacheEntry(artistId) || {};

        const tabs = [
            {
                key: 'hot', label: '<i class="fas fa-fire"></i> 热门歌曲',
                onActivate: async (body) => {
                    if (cached.hotSongs) { this._renderArtistHotSongs(body, cached.hotSongs, artistName); return; }
                    body.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
                    const songs = await this._fetchArtistHotSongs(artistId, artistName);
                    if (songs && songs.length > 0) {
                        cached.hotSongs = songs;
                        this._setArtistCache(artistId, 'hotSongs', songs);
                    }
                    this._renderArtistHotSongs(body, songs || [], artistName);
                }
            },
            {
                key: 'albums', label: '<i class="fas fa-compact-disc"></i> 专辑',
                onActivate: async (body) => {
                    if (cached.albums) { this._renderArtistAlbums(body, cached.albums); return; }
                    body.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
                    const albums = await this._fetchArtistAlbums(artistId, artistName);
                    if (albums && albums.length > 0) {
                        cached.albums = albums;
                        this._setArtistCache(artistId, 'albums', albums);
                    }
                    this._renderArtistAlbums(body, albums || []);
                }
            },
            {
                key: 'similar', label: '<i class="fas fa-users"></i> 相似艺人',
                onActivate: async (body) => {
                    if (cached.similar) { this._renderSimilarArtists(body, cached.similar); return; }
                    body.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
                    const artists = await this._fetchSimilarArtists(artistId);
                    if (artists && artists.length > 0) {
                        cached.similar = artists;
                        this._setArtistCache(artistId, 'similar', artists);
                    }
                    this._renderSimilarArtists(body, artists || []);
                }
            }
        ];

        this._openActionSheet(headerHtml, tabs, 'hot');

        this._actionSheetEl.querySelector('#mc-as-close')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._artistNavStack.length > 1) {
                this._artistNavStack.pop();
                const prev = this._artistNavStack.pop();
                this._openArtistActionSheet(prev.id, prev.name, prev.img);
            } else {
                this._closeActionSheet();
            }
        });

        if (this._artistNavStack.length >= 5) this._artistNavStack.splice(0, this._artistNavStack.length - 4);
        this._artistNavStack.push({ id: artistId, name: artistName, img: coverImg });

        const closeBtn = this._actionSheetEl.querySelector('#mc-as-close');
        if (this._artistNavStack.length > 1 && closeBtn) {
            closeBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
            closeBtn.title = '返回上一位歌手';
        }
    }

    _renderArtistHotSongs(body, hotSongs, artistName) {
        if (!body) return;
        if (hotSongs.length === 0) {
            body.innerHTML = '<div class="mc-empty">暂无热门歌曲<br><button class="mc-retry-btn mc-as-retry">重试</button></div>';
            body.querySelector('.mc-as-retry')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const tab = this._actionSheetEl?.querySelector('.mc-as-tab.active');
                if (tab) tab.click();
            });
            return;
        }

        // 兼容 /api/v1/artist (ar) 和 /api/artist/top/song (artists) 两种返回格式
        const songs = hotSongs.slice(0, 50).map((s, i) => {
            const ar = (s.ar || s.artists || []).map(a => ({ id: a.id, name: a.name }));
            return {
                title: s.name || '',
                artist: ar.map(a => a.name).join('/') || '',
                artists: ar,
                albumId: (s.al || s.album)?.id || null,
                songId: s.id, index: i, isActive: false,
            };
        });

        body.innerHTML = `
            <div class="mc-as-actions">
                <button class="mc-as-action-btn" id="mc-as-play-all"><i class="fas fa-play"></i> 播放全部</button>
                <button class="mc-as-action-btn" id="mc-as-add-all"><i class="fas fa-plus"></i> 全部加入队列</button>
            </div>
            <div class="mc-as-song-list">
                ${songs.map((song, idx) => {
                    const numColor = idx < 3 ? 'rgba(200,160,255,0.7)' : idx < 10 ? `rgba(200,160,255,${0.4 - idx * 0.03})` : 'rgba(255,255,255,0.15)';
                    return `
                    <div class="mc-row mc-as-row" data-song-id="${song.songId}" data-index="${idx}">
                        <span class="mc-row-num${idx < 3 ? ' mc-row-num-top' : ''}" style="color:${numColor}">${idx + 1}</span>
                        <div class="mc-row-info">
                            <span class="mc-row-title">${this._esc(song.title)}</span>
                            <span class="mc-row-artist">${this._renderArtistLink(song.artists, song.artist)}</span>
                        </div>
                        <button class="mc-row-add-queue" data-song-id="${song.songId}" title="加入队列"><i class="fas fa-plus"></i></button>
                        <button class="mc-row-play"><i class="fas fa-play"></i></button>
                    </div>`;
                }).join('')}
            </div>
        `;

        body.querySelector('#mc-as-play-all')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
            this._currentPlaylistName = `${artistName} 热门`;
            this._savePlaylistCache();
            this._setPlayMode('sequence');
            if (songs[0]?.songId) this._playSongById(songs[0].songId);
            this._closeActionSheet();
        });

        body.querySelector('#mc-as-add-all')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._addSongsToQueue(songs);
            this._showToast(`已将 ${songs.length} 首歌加入队列`);
        });

        body.querySelectorAll('.mc-as-song-list .mc-artist-link').forEach(link => {
            link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
        });

        body.querySelectorAll('.mc-as-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-add-queue') || e.target.closest('.mc-row-play') || e.target.closest('.mc-artist-link')) return;
                e.stopPropagation();
                const songId = row.dataset.songId;
                if (songId) {
                    this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                    this._currentPlaylistName = `${artistName} 热门`;
                    this._savePlaylistCache();
                    this._playSongById(songId);
                    this._closeActionSheet();
                }
            });
        });

        body.querySelectorAll('.mc-row-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.mc-row');
                const songId = row?.dataset.songId;
                if (songId) {
                    this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                    this._currentPlaylistName = `${artistName} 热门`;
                    this._savePlaylistCache();
                    this._playSongById(songId);
                    this._closeActionSheet();
                }
            });
        });

        body.querySelectorAll('.mc-row-add-queue').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                const song = songs.find(s => String(s.songId) === String(songId));
                if (song) {
                    this._addSongToQueue(song);
                    this._showToast(`已加入队列: ${song.title}`);
                    btn.innerHTML = '<i class="fas fa-check"></i>';
                    btn.disabled = true;
                }
            });
        });
    }

    _renderArtistAlbums(body, albums) {
        if (!body) return;
        if (albums.length === 0) {
            body.innerHTML = '<div class="mc-empty">暂无专辑<br><button class="mc-retry-btn mc-as-retry">重试</button></div>';
            body.querySelector('.mc-as-retry')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const tab = this._actionSheetEl?.querySelector('.mc-as-tab.active');
                if (tab) tab.click();
            });
            return;
        }

        body.innerHTML = `<div class="mc-as-album-grid">
            ${albums.map(al => `
                <div class="mc-as-album-card" data-album-id="${al.id || ''}">
                    <div class="mc-as-album-cover">
                        ${al.picUrl ? `<img src="${this._esc(al.picUrl)}?param=120y120" alt="" loading="lazy" onerror="this.style.display='none'">` : '<i class="fas fa-compact-disc"></i>'}
                        <div class="mc-as-album-play-overlay"><i class="fas fa-play"></i></div>
                    </div>
                    <div class="mc-as-album-name">${this._esc(al.name || '未知专辑')}</div>
                    <div class="mc-as-album-info">${al.size ? al.size + ' 首' : ''} ${al.publishTime ? new Date(al.publishTime).getFullYear() : ''}</div>
                </div>
            `).join('')}
        </div>`;

        body.querySelectorAll('.mc-as-album-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const albumId = card.dataset.albumId;
                if (albumId) this._loadAlbumSongs(albumId, body);
            });
        });
    }

    async _loadAlbumSongs(albumId, body) {
        if (!body) return;
        body.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载专辑...</div>';

        const resp = await this._neteaseApi(`/api/v1/album/${albumId}`, {}, 'POST');
        const album = resp?.ok ? resp?.data?.album : null;
        const songs = resp?.ok ? (resp?.data?.songs || []) : [];

        if (songs.length === 0) { body.innerHTML = '<div class="mc-empty">专辑无歌曲</div>'; return; }

        const albumName = album?.name || '专辑';
        const albumCover = album?.picUrl ? album.picUrl + '?param=200y200' : '';
        const albumArtists = (album?.artists || (album?.artist ? [album.artist] : [])).map(a => ({ id: a.id, name: a.name }));
        const albumArtistName = albumArtists.map(a => a.name).join('/') || '';
        const publishTime = album?.publishTime ? new Date(album.publishTime).getFullYear() : '';
        const mappedSongs = songs.map((s, i) => {
            const ar = (s.ar || s.artists || []).map(a => ({ id: a.id, name: a.name }));
            return {
                title: s.name || '', artist: ar.map(a => a.name).join('/') || '',
                artists: ar, albumId: albumId,
                songId: s.id, index: i, isActive: false,
            };
        });

        body.innerHTML = `
            <div class="mc-album-hero">
                <button class="mc-as-back mc-album-back" id="mc-as-album-back"><i class="fas fa-arrow-left"></i></button>
                ${albumCover ? `<img class="mc-album-hero-cover" src="${this._esc(albumCover)}" alt="">` : '<div class="mc-album-hero-cover mc-album-cover-ph"><i class="fas fa-compact-disc"></i></div>'}
                <div class="mc-album-hero-info">
                    <div class="mc-album-hero-name">${this._esc(albumName)}</div>
                    <div class="mc-album-hero-artist">${this._renderArtistLink(albumArtists, albumArtistName)}</div>
                    <div class="mc-album-hero-meta">${publishTime ? publishTime + ' · ' : ''}${songs.length} 首歌曲</div>
                </div>
                <div class="mc-album-hero-actions">
                    <button class="mc-as-action-btn mc-as-action-sm" id="mc-as-album-play"><i class="fas fa-play"></i> 播放</button>
                    <button class="mc-as-action-btn mc-as-action-sm" id="mc-as-album-add"><i class="fas fa-plus"></i> 加入</button>
                </div>
            </div>
            <div class="mc-as-song-list">
                ${mappedSongs.map((song, idx) => `
                    <div class="mc-row mc-as-row" data-song-id="${song.songId}" data-index="${idx}">
                        <span class="mc-row-num">${idx + 1}</span>
                        <div class="mc-row-info">
                            <span class="mc-row-title">${this._esc(song.title)}</span>
                            <span class="mc-row-artist">${this._renderArtistLink(song.artists, song.artist)}</span>
                        </div>
                        <button class="mc-row-add-queue" data-song-id="${song.songId}" title="加入队列"><i class="fas fa-plus"></i></button>
                        <button class="mc-row-play"><i class="fas fa-play"></i></button>
                    </div>
                `).join('')}
            </div>
        `;

        body.querySelector('#mc-as-album-back')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tabs = this._actionSheetEl?.querySelector('.mc-as-tab.active');
            const tabKey = tabs?.dataset.asTab;
            if (tabKey === 'albums') tabs?.click();
        });

        body.querySelector('#mc-as-album-play')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._playlist = mappedSongs.map((s, i) => ({ ...s, index: i, isActive: false }));
            this._currentPlaylistName = albumName;
            this._savePlaylistCache();
            this._setPlayMode('sequence');
            if (mappedSongs[0]?.songId) this._playSongById(mappedSongs[0].songId);
            this._closeActionSheet();
        });

        body.querySelector('#mc-as-album-add')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._addSongsToQueue(mappedSongs);
            this._showToast(`已将 ${mappedSongs.length} 首歌加入队列`);
        });

        body.querySelectorAll('.mc-album-hero .mc-artist-link').forEach(link => {
            link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
        });

        this._bindAsSongRowEvents(body, mappedSongs, albumName);
    }

    _renderSimilarArtists(body, artists) {
        if (!body) return;
        if (artists.length === 0) {
            body.innerHTML = '<div class="mc-empty">暂无相似歌手推荐<br><button class="mc-retry-btn mc-as-retry">重试</button></div>';
            body.querySelector('.mc-as-retry')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const tab = this._actionSheetEl?.querySelector('.mc-as-tab.active');
                if (tab) tab.click();
            });
            return;
        }

        body.innerHTML = `<div class="mc-as-similar-list">
            ${artists.map(ar => `
                <div class="mc-row mc-as-similar-row" data-artist-id="${ar.id || ''}" data-artist-name="${this._esc(ar.name || '')}"
                     data-artist-img="${this._esc(ar.img1v1Url || '')}">
                    <div class="mc-artist-avatar">
                        ${ar.img1v1Url ? `<img src="${this._esc(ar.img1v1Url)}?param=80y80" alt="">` : '<i class="fas fa-user"></i>'}
                    </div>
                    <div class="mc-row-info">
                        <span class="mc-row-title">${this._esc(ar.name || '')}</span>
                    </div>
                    <i class="fas fa-chevron-right mc-artist-chev"></i>
                </div>
            `).join('')}
        </div>`;

        body.querySelectorAll('.mc-as-similar-row').forEach(row => {
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = row.dataset.artistId;
                const name = row.dataset.artistName;
                const img = row.dataset.artistImg;
                if (id) {
                    this._closeActionSheet();
                    setTimeout(() => this._openArtistActionSheet(id, name, img), 200);
                }
            });
        });
    }

    // 多端点回退策略获取歌手热门歌曲
    _getArtistCacheEntry(artistId) {
        const entry = this._artistCache.get(artistId);
        if (entry && (Date.now() - entry.ts < 10 * 60 * 1000)) return entry;
        if (entry) this._artistCache.delete(artistId);
        return null;
    }

    _setArtistCache(artistId, key, data) {
        const entry = this._artistCache.get(artistId) || { ts: Date.now() };
        entry[key] = data;
        entry.ts = Date.now();
        this._artistCache.set(artistId, entry);
    }

    async _fetchArtistHotSongs(artistId, artistName) {
        const cached = this._getArtistCacheEntry(artistId);
        if (cached?.hotSongs) return cached.hotSongs;

        const strategies = [
            {
                endpoint: '/api/artist/top/song', params: { id: artistId }, method: 'POST',
                extract: d => d?.songs,
            },
            {
                endpoint: '/api/v1/artist', params: { id: artistId }, method: 'POST',
                extract: d => d?.hotSongs,
            },
            {
                endpoint: '/api/v1/artist', params: { id: artistId },
                extract: d => d?.hotSongs,
            },
        ];

        for (const { endpoint, params, extract, method } of strategies) {
            try {
                const resp = await this._neteaseApi(endpoint, params, method || 'GET');
                if (resp?.ok) {
                    const songs = extract(resp.data);
                    if (songs?.length > 0) return songs;
                }
                // 即使 biz-code 不是 200，也尝试提取数据（有些接口 code 非 200 但数据仍有效）
                if (resp?.data) {
                    const songs = extract(resp.data);
                    if (songs?.length > 0) return songs;
                }
            } catch { /* try next */ }
        }

        // 最终回退：用歌手名搜索歌曲
        if (artistName) {
            try {
                const searchResp = await this._neteaseApi('/api/search/get/web', {
                    s: artistName, type: 1, limit: 30, offset: 0,
                });
                if (searchResp?.ok && searchResp?.data?.result?.songs?.length > 0) {
                    return searchResp.data.result.songs;
                }
            } catch { /* give up */ }
        }

        return [];
    }

    async _fetchArtistAlbums(artistId, artistName) {
        const extractors = [d => d?.hotAlbums, d => d?.albums, d => d?.data?.albums, d => d?.data?.hotAlbums];
        const strategies = [
            { endpoint: '/api/artist/albums', params: { id: artistId, limit: 50, offset: 0 }, method: 'POST' },
            { endpoint: '/api/artist/albums', params: { id: artistId, limit: 50, offset: 0 } },
            { endpoint: '/api/v1/artist/albums', params: { id: artistId, limit: 50, offset: 0, total: true }, method: 'POST' },
            { endpoint: '/api/v1/artist/albums', params: { id: artistId, limit: 50, offset: 0, total: true } },
        ];

        for (const { endpoint, params, method } of strategies) {
            try {
                const resp = await this._neteaseApi(endpoint, params, method || 'GET');
                const src = resp?.ok ? resp.data : resp?.data;
                if (!src) continue;
                for (const ext of extractors) {
                    const albums = ext(src);
                    if (albums?.length > 0) return albums;
                }
            } catch { /* try next */ }
        }

        // 回退：通过歌手详情接口获取
        try {
            const detailResp = await this._neteaseApi('/api/v1/artist', { id: artistId });
            const src = detailResp?.ok ? detailResp.data : detailResp?.data;
            if (src) {
                for (const ext of extractors) {
                    const albums = ext(src);
                    if (albums?.length > 0) return albums;
                }
            }
        } catch { /* try next */ }

        // 最终回退：通过搜索歌手名获取专辑
        if (artistName) {
            try {
                const searchResp = await this._neteaseApi('/api/search/get/web', {
                    s: artistName, type: 10, limit: 30, offset: 0,
                });
                const albums = searchResp?.data?.result?.albums;
                if (albums?.length > 0) return albums;
            } catch { /* give up */ }
        }

        return [];
    }

    async _fetchSimilarArtists(artistId) {
        const strategies = [
            {
                endpoint: '/api/discovery/simiArtist', params: { artistid: artistId }, method: 'POST',
                extract: d => d?.artists,
            },
            {
                endpoint: '/api/discovery/simiArtist', params: { artistid: artistId },
                extract: d => d?.artists,
            },
        ];

        for (const { endpoint, params, extract, method } of strategies) {
            try {
                const resp = await this._neteaseApi(endpoint, params, method || 'GET');
                if (resp?.ok) {
                    const artists = extract(resp.data);
                    if (artists?.length > 0) return artists;
                }
                if (resp?.data) {
                    const artists = extract(resp.data);
                    if (artists?.length > 0) return artists;
                }
            } catch { /* try next */ }
        }
        return [];
    }

    _bindAsSongRowEvents(body, songs, listName) {
        body.querySelectorAll('.mc-artist-link').forEach(link => {
            link.addEventListener('click', (e) => this._handleArtistLinkClick(e));
        });

        body.querySelectorAll('.mc-as-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-add-queue') || e.target.closest('.mc-row-play') || e.target.closest('.mc-artist-link')) return;
                e.stopPropagation();
                const songId = row.dataset.songId;
                if (songId) {
                    this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                    this._currentPlaylistName = listName;
                    this._savePlaylistCache();
                    this._playSongById(songId);
                    this._closeActionSheet();
                }
            });
        });

        body.querySelectorAll('.mc-row-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.mc-row');
                const songId = row?.dataset.songId;
                if (songId) {
                    this._playlist = songs.map((s, i) => ({ ...s, index: i, isActive: false }));
                    this._currentPlaylistName = listName;
                    this._savePlaylistCache();
                    this._playSongById(songId);
                    this._closeActionSheet();
                }
            });
        });

        body.querySelectorAll('.mc-row-add-queue').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                const song = songs.find(s => String(s.songId) === String(songId));
                if (song) {
                    this._addSongToQueue(song);
                    this._showToast(`已加入队列: ${song.title}`);
                    btn.innerHTML = '<i class="fas fa-check"></i>';
                    btn.disabled = true;
                }
            });
        });
    }

    // ===================== 队列管理 =====================

    _confirmClearPlaylist() {
        const overlay = document.createElement('div');
        overlay.className = 'mc-confirm-overlay';
        overlay.innerHTML = `
            <div class="mc-confirm-box">
                <div class="mc-confirm-msg">确定清空播放队列？<br><span style="font-size:11px;opacity:0.5">共 ${this._playlist.length} 首歌曲</span></div>
                <div class="mc-confirm-actions">
                    <button class="mc-confirm-cancel">取消</button>
                    <button class="mc-confirm-ok">清空</button>
                </div>
            </div>
        `;
        this._el?.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('mc-confirm-show'));

        overlay.querySelector('.mc-confirm-cancel')?.addEventListener('click', () => {
            overlay.classList.remove('mc-confirm-show');
            setTimeout(() => overlay.remove(), 200);
        });
        overlay.querySelector('.mc-confirm-ok')?.addEventListener('click', () => {
            overlay.classList.remove('mc-confirm-show');
            setTimeout(() => overlay.remove(), 200);
            this._clearPlaylist();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('mc-confirm-show');
                setTimeout(() => overlay.remove(), 200);
            }
        });
    }

    _clearPlaylist() {
        if (this.state.isPlaying) {
            if (this._offscreenMode) {
                this._offscreenCommand('pause');
            } else if (this._builtinAudio) {
                this._builtinAudio.pause();
                this._builtinAudio.src = '';
            }
        }
        this._playlist = [];
        this._currentSongId = null;
        this._currentPlaylistId = null;
        this._currentPlaylistName = '';
        this._shuffleQueue = [];
        this._shuffleIndex = -1;
        this.state = { ...this.state, isPlaying: false, title: '', artist: '', cover: '', currentTime: 0, duration: 0, lyricLine: '' };
        this._lyrics = [];
        this._lyricsTranslation = {};
        this._currentLyricIndex = -1;
        this._lyricSongId = null;
        this._skipErrorTs = [];
        this._savePlaylistCache();
        this._refreshPlaylist();
        this._updateUI();
        this._showToast('队列已清空');
        try { chrome.storage.local.remove('lastMusicState'); } catch {}
    }

    _removeSongFromQueue(songId) {
        const idx = this._playlist.findIndex(s => String(s.songId) === String(songId));
        if (idx < 0) return;
        const isPlaying = String(this._currentSongId) === String(songId);
        this._playlist.splice(idx, 1);
        this._playlist.forEach((s, i) => { s.index = i; });
        this._savePlaylistCache();

        if (isPlaying && this._playlist.length > 0) {
            const nextIdx = Math.min(idx, this._playlist.length - 1);
            this._playSongById(this._playlist[nextIdx].songId);
        } else if (this._playlist.length === 0) {
            this._clearPlaylist();
            return;
        }
        this._refreshPlaylist();
        this._showToast('已从队列移除');
    }

    // ===================== 睡眠定时器 =====================

    _showSleepTimerMenu(e) {
        const island = document.getElementById('music-island');
        const existing = island?.querySelector('.mc-sleep-menu');
        if (existing) { this._closeSleepTimerMenu(true); return; }
        this._closeMoreMenu();

        const options = [
            { label: '15 分钟', mins: 15 },
            { label: '30 分钟', mins: 30 },
            { label: '45 分钟', mins: 45 },
            { label: '60 分钟', mins: 60 },
            { label: '播完当前歌曲', mins: -1 },
        ];

        const menu = document.createElement('div');
        menu.className = 'mc-sleep-menu';
        menu.id = 'mc-sleep-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', '睡眠定时');
        menu.innerHTML = options.map(o => `
            <button class="mc-sleep-option${this._sleepTimerMins === o.mins ? ' mc-sleep-active' : ''}" type="button" role="menuitemradio" aria-checked="${this._sleepTimerMins === o.mins}" data-mins="${o.mins}">${o.label}</button>
        `).join('') + (this._sleepTimerMins ? '<button class="mc-sleep-option mc-sleep-cancel" type="button" role="menuitem" data-mins="0">取消定时</button>' : '');

        const btn = e.target.closest('.mc-sleep-toggle');
        const rect = btn.getBoundingClientRect();
        const islandRect = island?.getBoundingClientRect() || { left: 0, top: 0 };
        menu.style.position = 'absolute';
        menu.style.left = (rect.left - islandRect.left + rect.width / 2 - 65) + 'px';
        menu.style.bottom = (islandRect.top + islandRect.height - rect.top + 8) + 'px';
        island?.appendChild(menu);
        btn.setAttribute('aria-expanded', 'true');
        this._setMusicSurfacePage('more-sleep-timer');
        setTimeout(() => menu.querySelector('.mc-sleep-active, .mc-sleep-option')?.focus(), 0);

        menu.addEventListener('click', (ev) => {
            const opt = ev.target.closest('.mc-sleep-option');
            if (!opt) return;
            const mins = parseInt(opt.dataset.mins);
            this._closeSleepTimerMenu(true);
            if (mins === 0) {
                this._cancelSleepTimer();
            } else {
                this._setSleepTimer(mins);
            }
        });

        menu.addEventListener('keydown', (ev) => {
            const items = [...menu.querySelectorAll('.mc-sleep-option')];
            const currentIndex = items.indexOf(document.activeElement);
            let nextIndex = null;
            if (ev.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
            if (ev.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
            if (ev.key === 'Home') nextIndex = 0;
            if (ev.key === 'End') nextIndex = items.length - 1;
            if (nextIndex === null) return;
            ev.preventDefault();
            items[nextIndex]?.focus();
        });

        const dismiss = (ev) => {
            if (!menu.contains(ev.target) && !btn.contains(ev.target)) {
                this._closeSleepTimerMenu();
            }
        };
        this._sleepMenuDismiss = dismiss;
        setTimeout(() => document.addEventListener('click', dismiss), 0);
    }

    _closeSleepTimerMenu(restoreFocus = false) {
        this._el?.querySelector('.mc-sleep-menu')?.remove();
        const btn = this._el?.querySelector('#mc-sleep-toggle');
        btn?.setAttribute('aria-expanded', 'false');
        if (this._sleepMenuDismiss) {
            document.removeEventListener('click', this._sleepMenuDismiss);
            this._sleepMenuDismiss = null;
        }
        this._restoreMusicSurfacePage();
        if (restoreFocus) btn?.focus();
    }

    _closeMoreMenu(restoreFocus = false) {
        const menu = this._el?.querySelector('#mc-more-menu');
        const btn = this._el?.querySelector('#mc-more-toggle');
        menu?.classList.add('hidden');
        btn?.setAttribute('aria-expanded', 'false');
        this._restoreMusicSurfacePage();
        if (restoreFocus) btn?.focus();
    }

    _setSleepTimer(mins) {
        this._cancelSleepTimer();
        this._sleepTimerMins = mins;

        if (mins === -1) {
            this._sleepAfterCurrent = true;
            this._updateSleepBadge('1曲');
            this._showToast('将在当前歌曲播完后停止');
            return;
        }

        this._sleepEndTime = Date.now() + mins * 60 * 1000;
        this._updateSleepBadge(`${mins}m`);
        this._showToast(`将在 ${mins} 分钟后停止播放`);

        this._sleepTickTimer = setInterval(() => {
            const remain = Math.max(0, this._sleepEndTime - Date.now());
            const remMins = Math.ceil(remain / 60000);
            if (remain <= 0) {
                this._executeSleepStop();
                return;
            }
            this._updateSleepBadge(remMins <= 1 ? `${Math.ceil(remain / 1000)}s` : `${remMins}m`);
        }, 1000);
    }

    _cancelSleepTimer() {
        if (this._sleepTickTimer) { clearInterval(this._sleepTickTimer); this._sleepTickTimer = null; }
        this._sleepEndTime = null;
        this._sleepTimerMins = null;
        this._sleepAfterCurrent = false;
        this._updateSleepBadge(null);
    }

    _executeSleepStop() {
        this._cancelSleepTimer();
        if (this._offscreenMode) {
            this._offscreenCommand('pause');
        } else if (this._builtinAudio) {
            this._builtinAudio.pause();
        }
        this.state.isPlaying = false;
        this._updateUI();
        this._showToast('定时停止，晚安~');
    }

    _updateSleepBadge(text) {
        const badge = this._el?.querySelector('#mc-sleep-badge');
        const icon = this._el?.querySelector('#mc-sleep-icon');
        if (badge) {
            if (text) {
                badge.textContent = text;
                badge.classList.remove('hidden');
                icon?.classList.add('mc-sleep-active-icon');
            } else {
                badge.classList.add('hidden');
                icon?.classList.remove('mc-sleep-active-icon');
            }
        }
    }

    // ===================== 加入队列 (v3.15.0) =====================

    _addSongToQueue(song) {
        if (!song || !song.songId) return;
        const exists = this._playlist.some(s => String(s.songId) === String(song.songId));
        if (exists) return;
        this._playlist.push({
            title: song.title || '', artist: song.artist || '',
            songId: song.songId, index: this._playlist.length, isActive: false,
        });
        this._savePlaylistCache();
        this._refreshPlaylist();
    }

    _addSongsToQueue(songs) {
        if (!Array.isArray(songs) || songs.length === 0) return;
        let added = 0;
        for (const song of songs) {
            if (!song.songId) continue;
            const exists = this._playlist.some(s => String(s.songId) === String(song.songId));
            if (exists) continue;
            this._playlist.push({
                title: song.title || '', artist: song.artist || '',
                artists: song.artists || undefined, albumId: song.albumId || undefined,
                songId: song.songId, index: this._playlist.length, isActive: false,
            });
            added++;
        }
        if (added > 0) {
            this._savePlaylistCache();
            this._refreshPlaylist();
        }
        return added;
    }

    _showSongContextMenu(e, song) {
        e.stopPropagation();
        const menu = this._ctxMenuEl;
        if (!menu) return;

        const artistItems = this._buildCtxArtistItems(song);
        const albumItem = (song.albumId) ? `<div class="mc-ctx-item" data-action="view-album" data-album-id="${song.albumId}"><i class="fas fa-compact-disc"></i> 查看专辑</div>` : '';

        menu.innerHTML = `
            <div class="mc-ctx-item" data-action="play"><i class="fas fa-play"></i> 播放</div>
            <div class="mc-ctx-item" data-action="add-queue"><i class="fas fa-plus"></i> 加入队列</div>
            <div class="mc-ctx-item" data-action="play-next"><i class="fas fa-step-forward"></i> 下一首播放</div>
            <div class="mc-ctx-item" data-action="like"><i class="fas fa-heart"></i> 我喜欢</div>
            <div class="mc-ctx-item" data-action="add-to-playlist"><i class="fas fa-folder-plus"></i> 收藏到歌单</div>
            <div class="mc-ctx-item" data-action="simi-songs"><i class="fas fa-magic"></i> 相似歌曲</div>
            ${artistItems}
            ${albumItem}
        `;

        menu.classList.remove('hidden');
        menu.style.left = '-9999px';
        menu.style.top = '-9999px';

        const rect = (e.target.closest('.mc-row') || e.target).getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const menuW = menuRect.width || 160;
        const menuH = menuRect.height || 200;
        let left = rect.right - menuW;
        let top = rect.bottom + 4;
        if (left < 4) left = 4;
        if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 4;
        if (top + menuH > window.innerHeight) top = rect.top - menuH - 4;
        if (top < 4) top = 4;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';

        menu.querySelectorAll('.mc-ctx-item').forEach(item => {
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                menu.classList.add('hidden');
                const action = item.dataset.action;
                if (action === 'play') {
                    if (song.songId) this._playSongById(song.songId);
                } else if (action === 'add-queue') {
                    this._addSongToQueue(song);
                    this._showToast(`已加入队列: ${song.title}`);
                } else if (action === 'play-next') {
                    this._addSongPlayNext(song);
                    this._showToast(`下一首播放: ${song.title}`);
                } else if (action === 'like') {
                    if (song.songId) this._likeSong(song.songId, null);
                } else if (action === 'add-to-playlist') {
                    if (song.songId) this._showAddToPlaylistPicker(song.songId, song.title);
                } else if (action === 'simi-songs') {
                    if (song.songId) this._showSimiSongs(song.songId, song.title);
                } else if (action === 'view-artist') {
                    const aId = Number(item.dataset.artistId);
                    const aName = item.dataset.artistName || '';
                    if (aId) this._openArtistActionSheet(aId, aName, '');
                    else if (aName) this._openArtistByName(aName);
                } else if (action === 'view-album') {
                    const albumId = item.dataset.albumId;
                    if (albumId) this._openAlbumFromCtx(Number(albumId));
                }
            }, { once: true });
        });
    }

    _buildCtxArtistItems(song) {
        const artists = song.artists;
        if (Array.isArray(artists) && artists.length > 0) {
            if (artists.length === 1) {
                return `<div class="mc-ctx-item" data-action="view-artist" data-artist-id="${artists[0].id || ''}" data-artist-name="${this._esc(artists[0].name)}"><i class="fas fa-user"></i> 查看歌手</div>`;
            }
            return artists.map(a =>
                `<div class="mc-ctx-item" data-action="view-artist" data-artist-id="${a.id || ''}" data-artist-name="${this._esc(a.name)}"><i class="fas fa-user"></i> ${this._esc(a.name)}</div>`
            ).join('');
        }
        if (song.artist) {
            return `<div class="mc-ctx-item" data-action="view-artist" data-artist-name="${this._esc(song.artist)}"><i class="fas fa-user"></i> 查看歌手</div>`;
        }
        return '';
    }

    async _openAlbumFromCtx(albumId) {
        if (!albumId) return;
        const resp = await this._neteaseApi(`/api/v1/album/${albumId}`, {}, 'POST');
        const album = resp?.ok ? resp?.data?.album : null;
        const songs = resp?.ok ? (resp?.data?.songs || []) : [];
        if (!album || songs.length === 0) { this._showToast('加载专辑失败'); return; }
        const artistName = (album.artists || album.artist ? [album.artist] : []).map(a => a?.name).filter(Boolean).join('/') || '';
        this._openArtistActionSheet(
            album.artists?.[0]?.id || album.artist?.id || 0,
            artistName,
            album.artists?.[0]?.img1v1Url || ''
        );
        setTimeout(() => {
            const albumsTab = this._actionSheetEl?.querySelector('[data-as-tab="albums"]');
            if (albumsTab) {
                albumsTab.click();
                setTimeout(() => {
                    const body = this._actionSheetEl?.querySelector('.mc-as-body');
                    if (body) this._loadAlbumSongs(albumId, body);
                }, 100);
            }
        }, 300);
    }

    _addSongPlayNext(song) {
        if (!song || !song.songId) return;
        const existIdx = this._playlist.findIndex(s => String(s.songId) === String(song.songId));
        if (existIdx >= 0) this._playlist.splice(existIdx, 1);
        const currentIdx = this._playlist.findIndex(s => s.isActive || String(s.songId) === String(this._currentSongId));
        const insertAt = currentIdx >= 0 ? currentIdx + 1 : this._playlist.length;
        this._playlist.splice(insertAt, 0, {
            title: song.title || '', artist: song.artist || '',
            songId: song.songId, index: insertAt, isActive: false,
        });
        this._playlist.forEach((s, i) => { s.index = i; });
        this._savePlaylistCache();
        this._refreshPlaylist();
    }

    // ===================== 内置 Audio 播放器 (v2.9.0) =====================

    async _playWithBuiltinAudio(url, songId, requestId = this._playRequestSeq, knownSong = null) {
        if (!this._builtinAudio || !url) return;
        const isCurrentRequest = () => requestId === this._playRequestSeq && String(this._currentSongId) === String(songId);

        this._builtinMode = true;
        this._builtinAudio.src = url;
        this._builtinAudio.volume = this.state.volume;
        this._currentSongId = songId;

        try {
            await this._builtinAudio.play();
        } catch (e) {
            console.warn('[MusicController] 内置播放器播放失败:', e);
            if (isCurrentRequest()) this._builtinMode = false;
            return;
        }
        if (!isCurrentRequest()) return;

        this.isActive = true;
        this.state.isPlaying = true;
        this._lastUpdateTs = Date.now();

        // 兼容旧调用；统一切歌链路会传入已解析元数据，避免再次请求造成状态漂移。
        if (songId && !knownSong) {
            const detailResp = await this._neteaseApi('/api/v3/song/detail', { c: JSON.stringify([{ id: songId }]) });
            if (!isCurrentRequest()) return;
            if (detailResp?.ok && detailResp?.data?.songs?.[0]) {
                const s = detailResp.data.songs[0];
                this.state.title = s.name || '';
                this.state.artist = (s.ar || []).map(a => a.name).join('/') || '';
                this.state.cover = (s.al?.picUrl || '') + '?param=200y200';
                this.state.album = s.al?.name || '';
            }
        }

        if ((!Array.isArray(this._playlist) || this._playlist.length === 0) && songId) {
            this._playlist = [{ title: this.state.title, artist: this.state.artist, index: 0, isActive: true, songId }];
            this._currentPlaylistName = this._currentPlaylistName || '播放队列';
            this._savePlaylistCache();
        }

        this._updateUI();
        this._show();
        this._tryFetchLyricsForCurrentSong();
        this._recordLocalPlayHistory({
            songId, title: this.state.title, artist: this.state.artist,
            artists: this.state.artists, albumId: this.state.albumId,
            cover: this.state.cover, album: this.state.album,
        });
    }

    _stopBuiltinPlayback() {
        if (this._builtinAudio) {
            this._builtinAudio.pause();
            this._builtinAudio.src = '';
        }
        this._builtinMode = false;
    }

    async _onBuiltinTrackEnd(songId = null) {
        if (songId !== null && this._currentSongId !== null && String(songId) !== String(this._currentSongId)) return;
        const now = Date.now();
        if (this._trackEndLock) return;
        if (now - (this._lastTrackEndTs || 0) < 2000) return;

        try {
            const { _musicTrackEndLock: lockTs } = await chrome.storage.session.get('_musicTrackEndLock');
            if (lockTs && now - lockTs < 3000) return;
            await chrome.storage.session.set({ _musicTrackEndLock: now });
        } catch { /* session storage unavailable, proceed anyway */ }

        this._lastTrackEndTs = now;
        this._trackEndLock = true;
        try {
            if (this._sleepAfterCurrent) {
                this._executeSleepStop();
                return;
            }
            if (this._fmMode) {
                await this._fmNext();
                return;
            }
            switch (this._playMode) {
                case 'single':
                    if (this._offscreenMode) {
                        this._offscreenCommand('seekTo', 0);
                        this._offscreenCommand('resume');
                    } else if (this._builtinAudio) {
                        this._builtinAudio.currentTime = 0;
                        this._builtinAudio.play();
                    }
                    break;
                case 'shuffle':
                    await this._playAdjacentTrack(1);
                    break;
                case 'loop':
                    await this._playAdjacentTrack(1);
                    break;
                case 'sequence':
                default:
                    await this._playAdjacentTrack(1);
                    break;
            }
        } finally {
            this._trackEndLock = false;
        }
    }

    async _playAdjacentTrack(direction) {
        if (this._playlist.length === 0) return;

        let nextIdx;
        if (this._playMode === 'shuffle') {
            if (this._shuffleQueue.length === 0) this._generateShuffleQueue();
            this._shuffleIndex = (this._shuffleIndex + direction + this._shuffleQueue.length) % this._shuffleQueue.length;
            nextIdx = this._shuffleQueue[this._shuffleIndex];
        } else {
            const currentIdx = this._playlist.findIndex(s => s.songId == this._currentSongId);
            nextIdx = currentIdx + direction;
            if (this._playMode === 'loop') {
                nextIdx = (nextIdx + this._playlist.length) % this._playlist.length;
            } else if (nextIdx < 0 || nextIdx >= this._playlist.length) {
                return;
            }
        }

        const song = this._playlist[nextIdx];
        if (!song) return;

        if (song.songId && this.platform === 'netease') {
            await this._playSongById(song.songId);
        }
    }

    // ===================== 登录提示 =====================

    _showLoginPrompt(tabName) {
        const prompt = this._el?.querySelector('#mc-login-prompt');
        const content = this._el?.querySelector(`.mc-pane[data-mc-pane="${tabName}"]`);
        if (prompt) prompt.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        this._setMusicSurfacePage('connection-error');
    }

    _hideLoginPrompt(tabName) {
        const prompt = this._el?.querySelector('#mc-login-prompt');
        const content = this._el?.querySelector(`.mc-pane[data-mc-pane="${tabName}"]`);
        if (prompt) prompt.classList.add('hidden');
        if (content) content.classList.remove('hidden');
        this._setMusicSurfacePage(tabName || 'now-playing');
    }

    async _goToLogin() {
        window.open('https://music.163.com/', '_blank');
    }

    // ===================== 工具 =====================

    _scrollToCenter(container, target) {
        if (!container || !target) return;
        const scrollParent = container.closest('.mc-pane') || container;
        let offsetTop = 0;
        let el = target;
        while (el && el !== scrollParent) {
            offsetTop += el.offsetTop;
            el = el.offsetParent;
        }
        const desiredScroll = offsetTop - scrollParent.clientHeight / 2 + target.offsetHeight / 2;
        scrollParent.scrollTo({ top: Math.max(0, desiredScroll), behavior: 'smooth' });
    }

    _renderArtistLink(artists, fallbackName) {
        if (Array.isArray(artists) && artists.length > 0) {
            return artists.map(a =>
                `<span class="mc-artist-link" data-artist-id="${a.id || ''}" data-artist-name="${this._esc(a.name)}">${this._esc(a.name)}</span>`
            ).join('<span class="mc-artist-sep">/</span>');
        }
        if (fallbackName) {
            return `<span class="mc-artist-link mc-artist-link-search" data-artist-name="${this._esc(fallbackName)}">${this._esc(fallbackName)}</span>`;
        }
        return '';
    }

    _handleArtistLinkClick(e) {
        const link = e.target.closest('.mc-artist-link');
        if (!link) return;
        e.stopPropagation();
        e.preventDefault();
        const artistId = link.dataset.artistId;
        const artistName = link.dataset.artistName;
        if (!artistName) return;
        if (artistId && artistId !== '' && artistId !== 'undefined' && artistId !== 'null') {
            this._openArtistActionSheet(Number(artistId), artistName, '');
        } else {
            this._openArtistByName(artistName);
        }
    }

    async _openArtistByName(name) {
        try {
            const resp = await this._neteaseApi('/api/cloudsearch/get/web', { s: name, type: 100, limit: 5 }, 'POST');
            const artists = resp?.ok ? (resp?.data?.result?.artists || []) : [];
            const match = artists.find(a => a.name === name) || artists[0];
            if (match) {
                this._openArtistActionSheet(match.id, match.name, match.img1v1Url || '');
            } else {
                this._showToast('未找到歌手信息');
            }
        } catch {
            this._showToast('获取歌手信息失败');
        }
    }

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    destroy() {
        if (this._pollTimer) clearInterval(this._pollTimer);
        if (this._builtinAudio) { this._builtinAudio.pause(); this._builtinAudio.remove(); }
        this._closeSleepTimerMenu();
        this._closeMoreMenu();
        this._setMetaGuideBackgroundDisabled(false);
        this._setActionSheetBackgroundInert(false);
        this._actionSheetEl?.remove();
        this._ctxMenuEl?.remove();
    }
}

window.musicController = new MusicController();
