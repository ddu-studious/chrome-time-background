/**
 * 音乐控制器模块 v3.16.0
 * UI 风格：Minimal Card（极简紧凑 + 滑动切换）— 基于 Demo 5
 * v3.0.0: 纯 API + Offscreen Document 独立播放器模式
 * v3.12.0: 音量浮层修复、发现全播、搜索队列、状态持久化、歌词防抖
 * v3.13.0: 音量浮层定位修正、歌单队列持久化（刷新不丢失）
 * v3.14.0: 队列列表UI优化（双行布局+喜欢按钮）、刷新后队列自动恢复
 * v3.15.0: 歌手操作台浮层（热门/专辑/相似）、歌曲加入队列能力、歌曲操作菜单
 * v3.16.0: 修复歌手专辑加载失败、搜索tab切换、搜索历史清除功能、搜索栏清除按钮
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
            if (lastMusicState && lastMusicState.title) {
                const age = Date.now() - (lastMusicState.savedAt || 0);
                if (age < 30 * 60 * 1000) {
                    this.state = { ...this.state, ...lastMusicState };
                    this.platform = lastMusicState.platform || null;
                    this._lastUpdateTs = Date.now();
                    if (lastMusicState.songId) this._currentSongId = lastMusicState.songId;
                }
            }
            if (musicPlaylistCache && Array.isArray(musicPlaylistCache.playlist) && musicPlaylistCache.playlist.length > 0) {
                const cacheAge = Date.now() - (musicPlaylistCache.savedAt || 0);
                if (cacheAge < 24 * 60 * 60 * 1000) {
                    this._playlist = musicPlaylistCache.playlist;
                    this._currentPlaylistId = musicPlaylistCache.playlistId || null;
                    this._currentPlaylistName = musicPlaylistCache.playlistName || '';
                    if (this._currentSongId || lastMusicState?.songId) {
                        const activeSongId = String(this._currentSongId || lastMusicState.songId);
                        this._playlist.forEach(s => { s.isActive = (String(s.songId) === activeSongId); });
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

        const container = document.createElement('div');
        container.className = 'music-island';
        container.id = 'music-island';
        container.innerHTML = `
            <div class="mc-panel hidden" id="mc-panel">
                <div class="mc-strip" id="mc-strip">
                    <div class="mc-cover" id="mc-cover">
                        <i class="fas fa-music mc-cover-placeholder"></i>
                        <img id="mc-cover-img" src="" alt="" style="display:none;">
                    </div>
                    <div class="mc-info">
                        <div class="mc-title" id="mc-title">未检测到音乐</div>
                        <div class="mc-sub" id="mc-sub"></div>
                        <div class="mc-lyric-preview" id="mc-lyric-preview"></div>
                    </div>
                    <div class="mc-strip-controls">
                        <button class="mc-ctrl-btn" id="mc-prev" title="上一曲"><i class="fas fa-step-backward"></i></button>
                        <button class="mc-ctrl-btn mc-play-btn" id="mc-play" title="播放/暂停"><i class="fas fa-play" id="mc-play-icon"></i></button>
                        <button class="mc-ctrl-btn" id="mc-next" title="下一曲"><i class="fas fa-step-forward"></i></button>
                    </div>
                </div>
                <div class="mc-progress" id="mc-progress">
                    <span class="mc-prg-time" id="mc-time-cur">0:00</span>
                    <div class="mc-prg-bar" id="mc-prg-bar">
                        <div class="mc-prg-fill" id="mc-prg-fill"></div>
                        <input type="range" class="mc-prg-input" id="mc-prg-input" min="0" max="1000" value="0">
                    </div>
                    <span class="mc-prg-time" id="mc-time-total">0:00</span>
                </div>
                <div class="mc-drawer-wrapper" id="mc-drawer-wrapper">
                  <div class="mc-drawer-inner">
                    <div class="mc-drawer-handle"><div class="mc-drawer-handle-bar"></div></div>
                    <div class="mc-tabs" id="mc-tabs">
                        <button class="mc-tab active" data-mc-tab="queue">队列</button>
                        <button class="mc-tab" data-mc-tab="playlists">歌单</button>
                        <button class="mc-tab" data-mc-tab="lyrics">歌词</button>
                        <button class="mc-tab" data-mc-tab="discover">发现</button>
                        <button class="mc-tab" data-mc-tab="search">搜索</button>
                        <div class="mc-tab-indicator" id="mc-tab-indicator"></div>
                    </div>
                    <div class="mc-content" id="mc-content">
                        <div class="mc-pane active" data-mc-pane="queue" id="mc-pane-queue">
                            <div class="mc-empty">暂无歌曲，请先播放音乐</div>
                        </div>
                        <div class="mc-pane" data-mc-pane="playlists" id="mc-pane-playlists">
                            <div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>
                        </div>
                        <div class="mc-pane" data-mc-pane="lyrics" id="mc-pane-lyrics">
                            <div class="mc-lrc-pane">
                                <div class="mc-empty">播放音乐后自动获取歌词</div>
                            </div>
                        </div>
                        <div class="mc-pane" data-mc-pane="discover" id="mc-pane-discover">
                            <div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>
                        </div>
                        <div class="mc-pane" data-mc-pane="search" id="mc-pane-search">
                            <div class="mc-search-bar">
                                <div class="mc-search-wrap">
                                    <i class="fas fa-search"></i>
                                    <input type="text" id="mc-search-input" placeholder="搜索歌曲、歌手..." maxlength="60">
                                    <button class="mc-search-clear-btn hidden" id="mc-search-clear" title="清除搜索"><i class="fas fa-times-circle"></i></button>
                                </div>
                                <div class="mc-search-type-tabs" id="mc-search-type-tabs">
                                    <button class="mc-search-type active" data-type="1">歌曲</button>
                                    <button class="mc-search-type" data-type="1000">歌单</button>
                                    <button class="mc-search-type" data-type="100">歌手</button>
                                </div>
                            </div>
                            <div id="mc-search-results">
                                <div class="mc-search-history" id="mc-search-history-area"></div>
                            </div>
                        </div>
                    </div>
                    <div class="mc-modes" id="mc-modes">
                        <button class="mc-mode-btn" data-mode="sequence" title="顺序播放"><i class="fas fa-long-arrow-alt-right"></i></button>
                        <button class="mc-mode-btn" data-mode="loop" title="列表循环"><i class="fas fa-retweet"></i></button>
                        <button class="mc-mode-btn" data-mode="single" title="单曲循环"><span class="mc-mode-single-icon"><i class="fas fa-redo"></i><span class="mc-mode-single-1">1</span></span></button>
                        <button class="mc-mode-btn" data-mode="shuffle" title="随机播放"><i class="fas fa-random"></i></button>
                        <div class="mc-mode-divider"></div>
                        <span class="mc-mode-label" id="mc-mode-label">顺序播放</span>
                        <div class="mc-mode-divider"></div>
                        <button class="mc-ctrl-btn mc-vol-toggle" id="mc-vol-toggle" title="音量"><i class="fas fa-volume-up" id="mc-vol-icon"></i></button>
                        <div class="mc-vol-slider hidden" id="mc-vol-slider">
                            <div class="mc-vol-pct" id="mc-vol-pct">100%</div>
                            <div class="mc-vol-track">
                                <div class="mc-vol-track-bg"></div>
                                <div class="mc-vol-fill" id="mc-vol-fill"></div>
                                <input type="range" class="mc-vol-input" id="mc-vol-input" min="0" max="100" value="100">
                            </div>
                        </div>
                        <div class="mc-mode-divider"></div>
                        <button class="mc-ctrl-btn mc-disconnect" id="mc-disconnect" title="断开连接"><i class="fas fa-times-circle"></i></button>
                    </div>
                  </div>
                </div>
                <div class="mc-login-prompt hidden" id="mc-login-prompt">
                    <i class="fas fa-user-lock"></i>
                    <span>请先在音乐平台登录后使用此功能</span>
                    <button class="mc-login-btn" id="mc-login-btn">前往登录</button>
                </div>
            </div>
            <div class="mc-connect hidden" id="mc-connect">
                <div class="mc-connect-inner">
                    <span class="mc-connect-label">连接音乐平台</span>
                    <div class="mc-connect-btns">
                        <button class="mc-connect-btn mc-connect-primary" data-platform="netease-independent" title="网易云独立播放">
                            <i class="fas fa-play-circle"></i> 网易云音乐
                        </button>
                    </div>
                    <div class="mc-connect-hint" id="mc-connect-hint">
                        <i class="fas fa-info-circle"></i>
                        <span>无需打开音乐网站，只需在浏览器中登录过网易云即可使用</span>
                    </div>
                </div>
            </div>
        `;

        // 操作台浮层（挂载在 body 上，避免被任何 overflow 裁剪）
        const actionSheet = document.createElement('div');
        actionSheet.className = 'mc-action-sheet-overlay hidden';
        actionSheet.id = 'mc-action-sheet-overlay';
        actionSheet.innerHTML = `
            <div class="mc-action-sheet-backdrop"></div>
            <div class="mc-action-sheet" id="mc-action-sheet">
                <div class="mc-as-header" id="mc-as-header"></div>
                <div class="mc-as-tabs" id="mc-as-tabs"></div>
                <div class="mc-as-body" id="mc-as-body"></div>
            </div>
        `;
        document.body.appendChild(actionSheet);
        this._actionSheetEl = actionSheet;

        // 歌曲上下文菜单
        const ctxMenu = document.createElement('div');
        ctxMenu.className = 'mc-ctx-menu hidden';
        ctxMenu.id = 'mc-ctx-menu';
        document.body.appendChild(ctxMenu);
        this._ctxMenuEl = ctxMenu;

        const timeContainer = wrapper.querySelector('.time-container');
        if (timeContainer) {
            timeContainer.after(container);
        } else {
            wrapper.appendChild(container);
        }
        this._el = container;
        this._initBuiltinAudio();
        this._initFloatingVolume();
        this._updateModeUI();
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

        this._builtinAudio.addEventListener('ended', () => this._onBuiltinTrackEnd());
        this._builtinAudio.addEventListener('timeupdate', () => {
            if (this._builtinMode) {
                this.state.currentTime = this._builtinAudio.currentTime;
                this.state.duration = this._builtinAudio.duration || 0;
                this._lastUpdateTs = Date.now();
            }
        });
        this._builtinAudio.addEventListener('play', () => {
            if (this._builtinMode) { this.state.isPlaying = true; this._updateUI(); }
        });
        this._builtinAudio.addEventListener('pause', () => {
            if (this._builtinMode) { this.state.isPlaying = false; this._updateUI(); }
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

        // Strip 点击展开/收起面板
        el.querySelector('#mc-strip')?.addEventListener('click', () => {
            this._expanded = !this._expanded;
            this._updatePanelExpand();
        });

        // Tab 切换
        el.querySelectorAll('#mc-tabs .mc-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                this._switchTab(tab.dataset.mcTab);
            });
        });

        // 播放模式
        el.querySelectorAll('.mc-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._setPlayMode(btn.dataset.mode);
            });
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

        // 断开连接
        el.querySelector('#mc-disconnect')?.addEventListener('click', (e) => {
            e.stopPropagation();
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

    async _offscreenPlay(url, songId, title, artist, cover) {
        try {
            return await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    action: 'offscreen_play',
                    url, songId, title, artist, cover
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
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'music_state_from_offscreen') {
                this._handleOffscreenState(msg.data);
            } else if (msg.action === 'music_track_ended') {
                this._onBuiltinTrackEnd();
            } else if (msg.action === 'music_media_action') {
                if (msg.command === 'prev') this._prevTrack();
                else if (msg.command === 'next') this._nextTrack();
            } else if (msg.action === 'music_playback_error') {
                this._handlePlaybackError(msg.error, msg.code);
            }
        });
    }

    

    // ===================== 网易云 API =====================

    async _neteaseApi(endpoint, params = {}, method = 'GET') {
        try {
            const resp = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'netease_api', endpoint, params, method }, (r) => resolve(r || { ok: false }));
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
        this.state = { ...this.state, ...data };
        if (frozenVol !== null) this.state.volume = frozenVol;
        this._lastUpdateTs = Date.now();
        this.isActive = true;
        this._updateUI();
        this._show();

        if (data.title && data.title !== prevTitle) {
            this._onSongChange(data.title, data.artist);
            this._hideMetaGuide();
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

    _handlePlaybackError(error, code) {
        this.state.isPlaying = false;
        this._updateUI();
        if (code === 4) {
            this._showToast('播放链接已失效，正在切换下一首…');
            setTimeout(() => this._nextTrack(), 1500);
        } else {
            this._showToast(error || '播放出错');
        }
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
        this._playAdjacentTrack(-1);
    }

    _nextTrack() {
        this._playAdjacentTrack(1);
    }

    // ===================== UI 更新 =====================

    _updateUI() {
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
        if (subEl) subEl.textContent = this.state.artist || '';

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
        guide.innerHTML = `
            <div class="mc-guide-inner">
                <i class="fas ${tip.icon} mc-guide-icon"></i>
                <div class="mc-guide-text">
                    <div class="mc-guide-title">${tip.title}</div>
                    <div class="mc-guide-desc">${tip.desc}</div>
                </div>
                <div class="mc-guide-actions">
                    ${tip.actions.map(a => `<button class="mc-guide-btn" id="${a.id}"><i class="fas ${a.icon}"></i> ${a.label}</button>`).join('')}
                </div>
            </div>`;
        guide.classList.remove('hidden');

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

    _hideMetaGuide() {
        const guide = this._el?.querySelector('#mc-meta-guide');
        if (guide) guide.classList.add('hidden');
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
                this.state.title = s.name || '';
                this.state.artist = (s.ar || []).map(a => a.name).join('/') || '';
                this.state.cover = (s.al?.picUrl || '') + '?param=200y200';
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
        el.querySelectorAll('#mc-tabs .mc-tab').forEach(t => t.classList.toggle('active', t.dataset.mcTab === tabName));
        el.querySelectorAll('.mc-pane').forEach(c => c.classList.toggle('active', c.dataset.mcPane === tabName));
        this._updateTabIndicator();
        this._saveLastMusicTab(tabName);

        const loginPrompt = el.querySelector('#mc-login-prompt');
        if (loginPrompt) loginPrompt.classList.add('hidden');

        if (skipLoad) return;

        switch (tabName) {
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

    _saveLastMusicTab(tabName) {
        try { chrome.storage.local.set({ musicLastTab: tabName }); } catch {}
    }

    async _restoreLastTab() {
        try {
            const { musicLastTab } = await chrome.storage.local.get('musicLastTab');
            if (musicLastTab && ['queue', 'playlists', 'lyrics', 'discover', 'search'].includes(musicLastTab)) {
                if (this._expanded) {
                    this._switchTab(musicLastTab);
                } else {
                    this._switchTab(musicLastTab, true);
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
            indicator.style.left = active.offsetLeft + 'px';
            indicator.style.width = active.offsetWidth + 'px';
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

    _updateModeUI() {
        const el = this._el;
        if (!el) return;
        const labels = { sequence: '顺序播放', loop: '列表循环', single: '单曲循环', shuffle: '随机播放' };
        el.querySelectorAll('.mc-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this._playMode);
        });
        const label = el.querySelector('#mc-mode-label');
        if (label) label.textContent = labels[this._playMode] || '';
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
        pane.innerHTML = '<div class="mc-pl-compact">' + playlists.map((pl, i) => `
            <div class="mc-pl-row" data-href="${this._esc(pl.href)}" data-id="${pl.id || ''}">
                <div class="mc-pl-dot" style="background:${colors[i % colors.length]}"></div>
                <span class="mc-pl-label">${this._esc(pl.name)}</span>
                <span class="mc-pl-num">${pl.trackCount || ''}</span>
                <i class="fas fa-chevron-right mc-pl-chev"></i>
            </div>
        `).join('') + '</div>';

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
                    allSongs.push({
                        title: s.name || '未知歌曲',
                        artist: (s.ar || []).map(a => a.name).join('/') || '',
                        index: allSongs.length, isActive: s.name === this.state.title, songId: s.id,
                    });
                });
            }
        }

        this._playlist = allSongs;
        this._savePlaylistCache();
        this._apiLoadingQueue = false;
        this._renderPlaylistDetail(pane, allSongs, playlistName, coverUrl, totalCount);
    }

    _renderPlaylistDetail(pane, songs, name, coverUrl, totalCount) {
        if (!pane) return;
        if (songs.length === 0) { pane.innerHTML = '<div class="mc-empty">歌单为空</div>'; return; }

        const headerHtml = `
            <div class="mc-pl-detail-header">
                <button class="mc-pl-back" id="mc-pl-back" title="返回歌单列表"><i class="fas fa-arrow-left"></i></button>
                ${coverUrl ? `<img class="mc-pl-detail-cover" src="${this._esc(coverUrl)}" alt="">` : '<div class="mc-pl-detail-cover mc-pl-cover-ph"><i class="fas fa-music"></i></div>'}
                <div class="mc-pl-detail-info">
                    <div class="mc-pl-detail-name">${this._esc(name)}</div>
                    <div class="mc-pl-detail-count">${totalCount || songs.length} 首歌曲</div>
                </div>
                <div class="mc-pl-detail-actions">
                    <button class="mc-pl-action-btn mc-pl-play-all" id="mc-pl-play-all" title="播放全部"><i class="fas fa-play"></i></button>
                    <button class="mc-pl-action-btn mc-pl-shuffle-all" id="mc-pl-shuffle-all" title="随机播放"><i class="fas fa-random"></i></button>
                </div>
            </div>
        `;

        pane.innerHTML = headerHtml + songs.map((song, idx) => `
            <div class="mc-row${song.isActive ? ' mc-row-active' : ''}" data-song-id="${song.songId || ''}" data-index="${idx}">
                <span class="mc-row-num">${song.isActive ? '<i class="fas fa-volume-up" style="font-size:9px"></i>' : (idx + 1)}</span>
                <div class="mc-row-info">
                    <span class="mc-row-title">${this._esc(song.title)}</span>
                    <span class="mc-row-artist">${this._esc(song.artist)}</span>
                </div>
                <button class="mc-row-like" data-song-id="${song.songId || ''}" title="添加到我喜欢"><i class="fas fa-heart"></i></button>
                <button class="mc-row-play"><i class="fas fa-play"></i></button>
            </div>
        `).join('');

        pane.querySelector('#mc-pl-back')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._switchTab('playlists');
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

        pane.querySelectorAll('.mc-row').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-like') || e.target.closest('.mc-row-play')) return;
                e.stopPropagation();
                const songId = item.dataset.songId;
                if (songId) {
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

        pane.querySelectorAll('.mc-row-like').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                if (songId) this._likeSong(songId, btn);
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
        this._renderPlaylistDetail(pane, songs, this._currentPlaylistName || '播放队列', '', songs.length);
    }

    async _playSongById(songId) {
        this._setRowLoading(songId, true);

        const songUrl = await this._getSongUrl(songId);
        if (!songUrl) {
            this._setRowLoading(songId, false);
            return;
        }

        this._currentSongId = songId;

        if (this._offscreenMode) {
            const detailResp = await this._neteaseApi('/api/v3/song/detail', { c: JSON.stringify([{ id: songId }]) });
            let title = '', artist = '', cover = '';
            if (detailResp?.ok && detailResp?.data?.songs?.[0]) {
                const s = detailResp.data.songs[0];
                title = s.name || '';
                artist = (s.ar || []).map(a => a.name).join('/') || '';
                cover = (s.al?.picUrl || '') + '?param=200y200';
            }

            // 独立播放场景如果是“单曲触发”，确保队列不会是空的（否则队列/next/prev 会显得不连贯）
            if (!Array.isArray(this._playlist) || this._playlist.length === 0) {
                this._playlist = [{ title, artist, index: 0, isActive: true, songId }];
                this._currentPlaylistName = this._currentPlaylistName || '播放队列';
                this._savePlaylistCache();
            }

            this.state.title = title;
            this.state.artist = artist;
            this.state.cover = cover;
            this.state.isPlaying = true;
            this._lastUpdateTs = Date.now();
            this._updateUI();
            this._show();
            this._hideMetaGuide();

            await this._offscreenPlay(songUrl, songId, title, artist, cover);
            this._setRowLoading(songId, false);
            this._tryFetchLyricsForCurrentSong();
            this._updatePlaylistActiveState(songId);
            return;
        }

        this._setRowLoading(songId, false);
        await this._playWithBuiltinAudio(songUrl, songId);
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

    async _getSongUrl(songId) {
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

        this._showToast('该歌曲暂无版权或链接获取失败');
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

        // 先通过搜索获取 songId（如果还不知道的话）
        if (!this._currentSongId || this._lyricSongId !== this._currentSongId) {
            const searchResp = await this._neteaseApi('/api/search/get/web', {
                s: `${this.state.title} ${this.state.artist}`.trim(), type: 1, limit: 5, offset: 0,
            });
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

        pane.innerHTML = '<div class="mc-lrc-pane">' + this._lyrics.map((line, idx) => {
            const trans = this._lyricsTranslation[line.time.toFixed(1)] || '';
            return `<div class="mc-lrc" data-lrc-idx="${idx}">${this._esc(line.text)}</div>` +
                (trans ? `<div class="mc-lrc-sub">${this._esc(trans)}</div>` : '');
        }).join('') + '</div>';

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

    // ===================== 推荐歌曲 API (v2.9.0) =====================

    async _loadRecommended() {
        const pane = this._el?.querySelector('#mc-pane-discover');
        if (!pane) return;
        pane.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

        let songRendered = false;

        const resp = await this._neteaseApi('/api/v3/discovery/recommend/songs');
        const dailySongs = resp?.ok ? (resp?.data?.data?.dailySongs || resp?.data?.dailySongs) : null;
        if (dailySongs?.length > 0) {
            this._recommendSongs = dailySongs.map((s, i) => ({
                title: s.name, artist: (s.ar || []).map(a => a.name).join('/'), songId: s.id, index: i,
            }));
            this._renderRecommend(pane, this._recommendSongs, '每日推荐');
            songRendered = true;
        }

        if (!songRendered) {
            const hotResp = await this._neteaseApi('/api/playlist/detail', { id: 3778678, n: 20 });
            const hotPlaylist = hotResp?.ok ? (hotResp?.data?.playlist || hotResp?.data?.result?.playlist) : null;
            if (hotPlaylist?.tracks?.length > 0) {
                const songs = hotPlaylist.tracks.slice(0, 20).map((s, i) => ({
                    title: s.name, artist: (s.ar || []).map(a => a.name).join('/'), songId: s.id, index: i,
                }));
                this._recommendSongs = songs;
                this._renderRecommend(pane, songs, '热门歌曲');
                songRendered = true;
            }
        }

        await this._loadRecommendPlaylists(pane, songRendered);
    }

    async _loadRecommendPlaylists(pane, hasSongs) {
        if (!pane) return;

        const plResp = await this._neteaseApi('/api/personalized/playlist', { limit: 6 });
        const playlists = plResp?.ok ? (plResp?.data?.result || []) : [];

        if (playlists.length === 0 && !hasSongs) {
            pane.innerHTML = '<div class="mc-empty">暂无推荐，请确认已登录网易云</div>';
            return;
        }
        if (playlists.length === 0) return;

        const plHtml = `
            <div class="mc-discover-playlists">
                <div class="mc-rec-header" style="margin-top:8px">
                    <div class="mc-rec-tag"><i class="fas fa-compact-disc"></i> 推荐歌单</div>
                </div>
                <div class="mc-pl-grid">
                    ${playlists.map(pl => `
                        <div class="mc-pl-card" data-pl-id="${pl.id || ''}" title="${this._esc(pl.name || '')}">
                            <div class="mc-pl-card-cover">
                                ${pl.picUrl ? `<img src="${this._esc(pl.picUrl)}?param=120y120" alt="">` : '<i class="fas fa-music"></i>'}
                                <div class="mc-pl-card-play"><i class="fas fa-play"></i></div>
                                ${pl.playCount ? `<span class="mc-pl-card-count"><i class="fas fa-headphones"></i> ${this._formatCount(pl.playCount)}</span>` : ''}
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

    _formatCount(n) {
        if (!n) return '0';
        if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
        if (n >= 10000) return (n / 10000).toFixed(1) + '万';
        return String(n);
    }

    _renderRecommend(pane, songs, label) {
        const gradients = [0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06];
        pane.innerHTML = `<div class="mc-rec-compact">
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
                        <span class="mc-row-artist">${this._esc(song.artist || '')}</span>
                    </div>
                    <button class="mc-row-add-queue" data-song-id="${song.songId || ''}" title="加入队列"><i class="fas fa-plus"></i></button>
                    <button class="mc-row-like" data-song-id="${song.songId || ''}" title="添加到我喜欢"><i class="fas fa-heart"></i></button>
                    <button class="mc-row-play"><i class="fas fa-play"></i></button>
                </div>
            `).join('')}
        </div>`;

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

        pane.querySelectorAll('.mc-rec-row').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-like') || e.target.closest('.mc-row-play') || e.target.closest('.mc-row-add-queue')) return;
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
    }

    // ===================== 搜索 (v2.9.0 增强) =====================

    _onSearchInputChange() {
        const input = this._el?.querySelector('#mc-search-input');
        const clearBtn = this._el?.querySelector('#mc-search-clear');
        if (input && clearBtn) {
            clearBtn.classList.toggle('hidden', !input.value.trim());
        }
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
            ? apiResp.data.result.songs.map((s, idx) => ({
                index: idx, title: s.name || '', artist: (s.artists || []).map(a => a.name).join('/') || '', songId: s.id,
            }))
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
                    <span class="mc-row-artist">${this._esc(song.artist || '')}</span>
                </div>
                <button class="mc-row-add-queue" data-song-id="${song.songId || ''}" title="加入队列"><i class="fas fa-plus"></i></button>
                <button class="mc-row-like" data-song-id="${song.songId || ''}" title="添加到我喜欢"><i class="fas fa-heart"></i></button>
                <button class="mc-row-play"><i class="fas fa-play"></i></button>
            </div>
        `).join('');

        resultsEl.querySelectorAll('.mc-search-row').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-like') || e.target.closest('.mc-row-add-queue')) return;
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
                        ${pl.coverImgUrl ? `<img src="${this._esc(pl.coverImgUrl)}?param=120y120" alt="">` : '<i class="fas fa-music"></i>'}
                        <div class="mc-pl-card-play"><i class="fas fa-play"></i></div>
                        ${pl.playCount ? `<span class="mc-pl-card-count"><i class="fas fa-headphones"></i> ${this._formatCount(pl.playCount)}</span>` : ''}
                    </div>
                    <div class="mc-pl-card-name">${this._esc(pl.name || '未命名歌单')}</div>
                    <div class="mc-pl-card-creator">${this._esc(pl.creator?.nickname || '')}</div>
                </div>
            `).join('')}
        </div>`;

        resultsEl.querySelectorAll('.mc-pl-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const plId = card.dataset.plId;
                if (plId) this._loadPlaylistSongsViaApi(plId, null);
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
        document.body.classList.add('mc-as-open');

        const activeCfg = tabsConfig?.find(t => t.key === defaultTab);
        if (activeCfg?.onActivate) activeCfg.onActivate(body);
    }

    _closeActionSheet() {
        if (this._actionSheetEl) {
            this._actionSheetEl.classList.add('hidden');
            this._actionSheetEl.querySelector('#mc-as-body')?.replaceChildren();
        }
        document.body.classList.remove('mc-as-open');
    }

    async _openArtistActionSheet(artistId, artistName, artistImg) {
        const headerHtml = `
            <div class="mc-as-artist-header">
                <div class="mc-as-artist-avatar">
                    ${artistImg ? `<img src="${this._esc(artistImg)}?param=120y120" alt="">` : '<i class="fas fa-user"></i>'}
                </div>
                <div class="mc-as-artist-info">
                    <div class="mc-as-artist-name">${this._esc(artistName)}</div>
                    <div class="mc-as-artist-sub">歌手</div>
                </div>
                <button class="mc-as-close" id="mc-as-close"><i class="fas fa-times"></i></button>
            </div>
        `;

        let cachedHotSongs = null;
        let cachedAlbums = null;
        let cachedSimilar = null;

        const tabs = [
            {
                key: 'hot', label: '<i class="fas fa-fire"></i> 热门',
                onActivate: async (body) => {
                    if (cachedHotSongs) { this._renderArtistHotSongs(body, cachedHotSongs, artistName); return; }
                    body.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
                    const songs = await this._fetchArtistHotSongs(artistId, artistName);
                    if (songs && songs.length > 0) {
                        cachedHotSongs = songs;
                    }
                    this._renderArtistHotSongs(body, songs || [], artistName);
                }
            },
            {
                key: 'albums', label: '<i class="fas fa-compact-disc"></i> 专辑',
                onActivate: async (body) => {
                    if (cachedAlbums) { this._renderArtistAlbums(body, cachedAlbums); return; }
                    body.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
                    const albums = await this._fetchArtistAlbums(artistId, artistName);
                    if (albums && albums.length > 0) {
                        cachedAlbums = albums;
                    }
                    this._renderArtistAlbums(body, albums || []);
                }
            },
            {
                key: 'similar', label: '<i class="fas fa-users"></i> 相似',
                onActivate: async (body) => {
                    if (cachedSimilar) { this._renderSimilarArtists(body, cachedSimilar); return; }
                    body.innerHTML = '<div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
                    const artists = await this._fetchSimilarArtists(artistId);
                    if (artists && artists.length > 0) {
                        cachedSimilar = artists;
                    }
                    this._renderSimilarArtists(body, artists || []);
                }
            }
        ];

        this._openActionSheet(headerHtml, tabs, 'hot');

        this._actionSheetEl.querySelector('#mc-as-close')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeActionSheet();
        });
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
        const songs = hotSongs.slice(0, 50).map((s, i) => ({
            title: s.name || '',
            artist: (s.ar || s.artists || []).map(a => a.name).join('/') || '',
            songId: s.id, index: i, isActive: false,
        }));

        body.innerHTML = `
            <div class="mc-as-actions">
                <button class="mc-as-action-btn" id="mc-as-play-all"><i class="fas fa-play"></i> 播放全部</button>
                <button class="mc-as-action-btn" id="mc-as-add-all"><i class="fas fa-plus"></i> 全部加入队列</button>
            </div>
            <div class="mc-as-song-list">
                ${songs.map((song, idx) => `
                    <div class="mc-row mc-as-row" data-song-id="${song.songId}" data-index="${idx}">
                        <span class="mc-row-num">${idx + 1}</span>
                        <div class="mc-row-info">
                            <span class="mc-row-title">${this._esc(song.title)}</span>
                            <span class="mc-row-artist">${this._esc(song.artist)}</span>
                        </div>
                        <button class="mc-row-add-queue" data-song-id="${song.songId}" title="加入队列"><i class="fas fa-plus"></i></button>
                        <button class="mc-row-play"><i class="fas fa-play"></i></button>
                    </div>
                `).join('')}
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

        body.querySelectorAll('.mc-as-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-add-queue') || e.target.closest('.mc-row-play')) return;
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
                        ${al.picUrl ? `<img src="${this._esc(al.picUrl)}?param=120y120" alt="">` : '<i class="fas fa-compact-disc"></i>'}
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

        const resp = await this._neteaseApi('/api/v1/album', { id: albumId });
        const album = resp?.ok ? resp?.data?.album : null;
        const songs = resp?.ok ? (resp?.data?.songs || []) : [];

        if (songs.length === 0) { body.innerHTML = '<div class="mc-empty">专辑无歌曲</div>'; return; }

        const albumName = album?.name || '专辑';
        const mappedSongs = songs.map((s, i) => ({
            title: s.name || '', artist: (s.ar || s.artists || []).map(a => a.name).join('/') || '',
            songId: s.id, index: i, isActive: false,
        }));

        body.innerHTML = `
            <div class="mc-as-album-detail-header">
                <button class="mc-as-back" id="mc-as-album-back"><i class="fas fa-arrow-left"></i></button>
                <div class="mc-as-album-detail-info">
                    <div class="mc-as-album-detail-name">${this._esc(albumName)}</div>
                    <div class="mc-as-album-detail-count">${songs.length} 首歌曲</div>
                </div>
                <button class="mc-as-action-btn mc-as-action-sm" id="mc-as-album-play"><i class="fas fa-play"></i> 播放</button>
                <button class="mc-as-action-btn mc-as-action-sm" id="mc-as-album-add"><i class="fas fa-plus"></i> 加入队列</button>
            </div>
            <div class="mc-as-song-list">
                ${mappedSongs.map((song, idx) => `
                    <div class="mc-row mc-as-row" data-song-id="${song.songId}" data-index="${idx}">
                        <span class="mc-row-num">${idx + 1}</span>
                        <div class="mc-row-info">
                            <span class="mc-row-title">${this._esc(song.title)}</span>
                            <span class="mc-row-artist">${this._esc(song.artist)}</span>
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
    async _fetchArtistHotSongs(artistId, artistName) {
        const strategies = [
            {
                endpoint: '/api/artist/top/song', params: { id: artistId },
                extract: d => d?.songs,
            },
            {
                endpoint: '/api/v1/artist', params: { id: artistId },
                extract: d => d?.hotSongs,
            },
            {
                endpoint: '/api/v1/artist', params: { id: artistId }, method: 'POST',
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
            { endpoint: '/api/artist/albums', params: { id: artistId, limit: 50, offset: 0 } },
            { endpoint: '/api/artist/albums', params: { id: artistId, limit: 50, offset: 0 }, method: 'POST' },
            { endpoint: '/api/v1/artist/albums', params: { id: artistId, limit: 50, offset: 0, total: true } },
            { endpoint: '/api/v1/artist/albums', params: { id: artistId, limit: 50, offset: 0, total: true }, method: 'POST' },
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
                endpoint: '/api/discovery/simiArtist', params: { artistid: artistId },
                extract: d => d?.artists,
            },
            {
                endpoint: '/api/discovery/simiArtist', params: { artistid: artistId }, method: 'POST',
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
        body.querySelectorAll('.mc-as-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.mc-row-add-queue') || e.target.closest('.mc-row-play')) return;
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

        menu.innerHTML = `
            <div class="mc-ctx-item" data-action="play"><i class="fas fa-play"></i> 播放</div>
            <div class="mc-ctx-item" data-action="add-queue"><i class="fas fa-plus"></i> 加入队列</div>
            <div class="mc-ctx-item" data-action="play-next"><i class="fas fa-step-forward"></i> 下一首播放</div>
            <div class="mc-ctx-item" data-action="like"><i class="fas fa-heart"></i> 我喜欢</div>
        `;

        const rect = (e.target.closest('.mc-row') || e.target).getBoundingClientRect();
        const menuW = 160, menuH = 160;
        let left = rect.right - menuW;
        let top = rect.bottom + 4;
        if (left < 4) left = 4;
        if (top + menuH > window.innerHeight) top = rect.top - menuH - 4;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.classList.remove('hidden');

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
                }
            }, { once: true });
        });
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

    async _playWithBuiltinAudio(url, songId) {
        if (!this._builtinAudio || !url) return;

        this._builtinMode = true;
        this._builtinAudio.src = url;
        this._builtinAudio.volume = this.state.volume;
        this._currentSongId = songId;

        try {
            await this._builtinAudio.play();
        } catch (e) {
            console.warn('[MusicController] 内置播放器播放失败:', e);
            this._builtinMode = false;
            return;
        }

        this.isActive = true;
        this.state.isPlaying = true;
        this._lastUpdateTs = Date.now();

        // 获取歌曲详情
        if (songId) {
            const detailResp = await this._neteaseApi('/api/v3/song/detail', { c: JSON.stringify([{ id: songId }]) });
            if (detailResp?.ok && detailResp?.data?.songs?.[0]) {
                const s = detailResp.data.songs[0];
                this.state.title = s.name || '';
                this.state.artist = (s.ar || []).map(a => a.name).join('/') || '';
                this.state.cover = (s.al?.picUrl || '') + '?param=200y200';
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
    }

    _stopBuiltinPlayback() {
        if (this._builtinAudio) {
            this._builtinAudio.pause();
            this._builtinAudio.src = '';
        }
        this._builtinMode = false;
    }

    async _onBuiltinTrackEnd() {
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
    }

    async _playAdjacentTrack(direction) {
        if (this._playlist.length === 0) return;

        let nextIdx;
        if (this._playMode === 'shuffle') {
            if (this._shuffleQueue.length === 0) this._generateShuffleQueue();
            this._shuffleIndex = (this._shuffleIndex + direction + this._shuffleQueue.length) % this._shuffleQueue.length;
            nextIdx = this._shuffleQueue[this._shuffleIndex];
        } else {
            const currentIdx = this._playlist.findIndex(s => s.isActive || s.songId == this._currentSongId);
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
    }

    _hideLoginPrompt(tabName) {
        const prompt = this._el?.querySelector('#mc-login-prompt');
        const content = this._el?.querySelector(`.mc-pane[data-mc-pane="${tabName}"]`);
        if (prompt) prompt.classList.add('hidden');
        if (content) content.classList.remove('hidden');
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

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    destroy() {
        if (this._pollTimer) clearInterval(this._pollTimer);
        if (this._builtinAudio) { this._builtinAudio.pause(); this._builtinAudio.remove(); }
        this._actionSheetEl?.remove();
        this._ctxMenuEl?.remove();
    }
}

window.musicController = new MusicController();
