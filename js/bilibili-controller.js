/**
 * 哔哩哔哩集成控制器 v3.16.0
 * 技术方案：Embed Player + Cookie API + declarativeNetRequest Cookie 注入
 * 功能：推荐/热门/直播/历史/稍后看/收藏/排行/课程/关注 九分类 + 搜索 + 嵌入播放器
 * v3.16.0: 新增个性化推荐 tab（换一换）+ 浮层刷新按钮
 */
class BilibiliController {
    constructor() {
        this._el = null;
        this._panelOpen = false;
        this._sidebarOpen = true;
        this._currentTab = 'recommend';
        this._currentVideo = null;
        this._loggedIn = false;
        this._userMid = 0;
        this._cache = {};
        this._loading = false;
        this._followGroups = null;
        this._activeGroupId = 'all';
        this._followPage = 1;
        this._followPageSize = 50;
        this._followTotal = 0;
        this._followAllTotal = 0;
        this._followHasMore = false;
        this._liveItems = [];
        this._liveFilter = 'all';
        this._livePlaybackSeq = 0;
        this._liveFallbackPlayer = null;
        this._liveFallbackTimer = null;
        this._favFolderId = 0;
        this._favFolders = null;
        this._activeFavId = 0;
        this._currentSpeed = 1;
        this._autoSpeedPending = false;
        this._currentQuality = 0;
        this._pendingQuality = 0;
        this._preferredQuality = 80;
        this._qualityList = [];
        this._qualityDescriptions = {};
        this._playerState = null;
        this._playerIdentitySeq = 0;
        this._playerIdentityLoading = '';
        this._pendingSeek = null;
        this._seekRetries = 0;
        this._commentSort = 0;
        this._commentPage = 1;
        this._commentLoading = false;
        this._commentsOpen = false;
        this._overviewItems = [];
        this._searchQuery = '';
        this._searchItems = [];
        this._searchSort = 'smart';
        this._creatorView = null;
        this._creatorReturn = null;
        this._creatorItems = [];
        this._creatorLayout = 'grid';
        this._creatorLoadSeq = 0;
        this._playerRecentItems = [];
        this._playerRecentMid = 0;
        this._playerRecentSeq = 0;
        this._watchMemory = {};
        this._rcmdFreshIdx = 1;
        this._returnFocus = null;
        this._backgroundInertSiblings = [];
        this._handleViewportResize = () => this._syncViewportHeight();
    }

    async init() {
        this._injectDOM();
        this._bindEvents();
        this._syncViewportHeight();
        window.addEventListener('resize', this._handleViewportResize, { passive: true });
        await this._restorePlayerPrefs();
        await this._loadWatchMemory();
        try {
            const loginInfo = await this._checkLogin();
            this._loggedIn = loginInfo.loggedIn;
            this._userMid = loginInfo.mid;
        } catch { this._loggedIn = false; }
        if (this._loggedIn) {
            await this._injectBiliCookies();
        }
        const initialTab = await this._restoreLastTab();
        try {
            this._syncTabs(initialTab);
            await this._loadTab(initialTab);
        } catch (e) { console.warn('[Bilibili] 初始化加载失败:', e.message); }
    }

    async _restoreLastTab() {
        try {
            const { biliLastTab } = await chrome.storage.local.get('biliLastTab');
            if (biliLastTab && ['recommend', 'popular', 'live', 'history', 'watchlater', 'favorite', 'ranking', 'course', 'following'].includes(biliLastTab)) {
                return biliLastTab;
            }
        } catch {}
        return 'recommend';
    }

    _saveLastTab(tab) {
        try { chrome.storage.local.set({ biliLastTab: tab }); } catch {}
    }

    async _restorePlayerPrefs() {
        try {
            const { biliPlayerPrefs } = await chrome.storage.local.get('biliPlayerPrefs');
            if (biliPlayerPrefs) {
                if (biliPlayerPrefs.speed > 0) this._currentSpeed = biliPlayerPrefs.speed;
                if (biliPlayerPrefs.quality > 0) this._preferredQuality = biliPlayerPrefs.quality;
                this._updateSpeedUI();
            }
        } catch {}
    }

    _savePlayerPrefs() {
        try {
            chrome.storage.local.set({
                biliPlayerPrefs: {
                    speed: this._currentSpeed,
                    quality: this._preferredQuality || 0,
                }
            });
        } catch {}
    }

    async _loadWatchMemory() {
        try {
            const { biliWatchMemory } = await chrome.storage.local.get('biliWatchMemory');
            this._watchMemory = biliWatchMemory || {};
        } catch {}
    }

    _saveWatchMemory(bvid, page, currentTime) {
        if (!bvid) return;
        this._watchMemory[bvid] = { page, time: currentTime, ts: Date.now() };
        const keys = Object.keys(this._watchMemory);
        if (keys.length > 200) {
            const sorted = keys.sort((a, b) => (this._watchMemory[a].ts || 0) - (this._watchMemory[b].ts || 0));
            for (let i = 0; i < keys.length - 200; i++) delete this._watchMemory[sorted[i]];
        }
        try { chrome.storage.local.set({ biliWatchMemory: this._watchMemory }); } catch {}
    }

    _getWatchMemory(bvid) {
        return bvid ? (this._watchMemory[bvid] || null) : null;
    }

    // ===================== API =====================

    _biliApi(endpoint, params = {}, method = 'GET') {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'bilibili_api', endpoint, params, method },
                resp => {
                    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                    if (!resp) return reject(new Error('无响应'));
                    if (resp.ok) resolve(resp.data);
                    else reject(new Error(resp.error || 'API 错误'));
                }
            );
        });
    }

    _checkLiveBackend() {
        return new Promise(resolve => {
            let settled = false;
            const finish = ready => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(ready);
            };
            const timer = setTimeout(() => finish(false), 1200);
            try {
                chrome.runtime.sendMessage({ action: 'bilibili_runtime_info' }, resp => {
                    if (chrome.runtime.lastError) return finish(false);
                    finish(resp?.ok === true
                        && resp?.features?.bilibiliLive === true
                        && resp?.apiRevision === 'bilibili-live-v5');
                });
            } catch (_) {
                finish(false);
            }
        });
    }

    async _injectBiliCookies() {
        try {
            const resp = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'bilibili_inject_cookies' }, r => {
                    if (chrome.runtime.lastError) resolve({ ok: false });
                    else resolve(r || { ok: false });
                });
            });
            if (resp.ok) console.log('[Bilibili] Cookie DNR 注入成功');
            else if (resp.error === 'no-login-cookie') console.log('[Bilibili] 未检测到 B 站登录态，跳过 Cookie 注入');
            else console.warn('[Bilibili] Cookie DNR 注入失败:', resp.error);
            return resp.ok;
        } catch (e) {
            console.warn('[Bilibili] Cookie 注入异常:', e.message);
            return false;
        }
    }

    async _clearBiliCookieRules() {
        try {
            chrome.runtime.sendMessage({ action: 'bilibili_clear_cookie_rules' }, () => {});
        } catch (_) {}
    }

    async _checkLogin() {
        try {
            const resp = await this._biliApi('/x/web-interface/nav');
            const isLogin = resp?.data?.isLogin === true;
            return { loggedIn: isLogin, mid: isLogin ? resp.data.mid : 0 };
        } catch { return { loggedIn: false, mid: 0 }; }
    }

    // ===================== Data Loaders =====================

    _refreshCurrentTab() {
        const tab = this._currentTab;
        delete this._cache[tab];
        if (tab === 'recommend') {
            this._rcmdFreshIdx++;
        }
        if (tab === 'following') {
            this._followGroups = null;
            this._followPage = 1;
            this._followTotal = 0;
            this._followAllTotal = 0;
            this._followHasMore = false;
            Object.keys(this._cache).forEach(k => { if (k.startsWith('following_')) delete this._cache[k]; });
        }
        if (tab === 'favorite') {
            this._favFolders = null;
            Object.keys(this._cache).forEach(k => { if (k.startsWith('fav_')) delete this._cache[k]; });
        }
        if (tab === 'live') {
            this._liveItems = [];
        }
        this._loadTab(tab);
    }

    async _loadTab(tab) {
        if (this._loading) return;
        this._currentTab = tab;
        this._saveLastTab(tab);
        this._setProductPage(this._pageForTab(tab));

        if (tab === 'following') {
            this._loading = true;
            this._showListLoading();
            try { await this._loadFollowing(false); }
            catch (e) { this._showListError(tab, e.message); }
            finally { this._loading = false; }
            return;
        }

        if (tab === 'course') {
            this._loading = true;
            this._showListLoading();
            try { await this._loadCoursePanel(); }
            catch (e) { this._showListError(tab, e.message); }
            finally { this._loading = false; }
            return;
        }

        if (tab === 'favorite') {
            this._loading = true;
            this._showListLoading();
            try { await this._loadFavoritePanel(); }
            catch (e) { this._showListError(tab, e.message); }
            finally { this._loading = false; }
            return;
        }

        if (tab === 'live') {
            this._loading = true;
            this._showListLoading();
            try {
                const backendReady = await this._checkLiveBackend();
                if (!backendReady) {
                    this._renderLiveBackendRecovery();
                    return;
                }
                const items = await this._fetchLive();
                this._cache.live = items;
                this._liveItems = items;
                this._renderLiveList(items);
            } catch (e) { this._showListError(tab, e.message); }
            finally { this._loading = false; }
            return;
        }

        if (this._cache[tab]) {
            this._renderList(tab, this._cache[tab]);
            return;
        }

        this._loading = true;
        this._showListLoading();

        try {
            let items = [];
            switch (tab) {
                case 'recommend': items = await this._fetchRecommend(); break;
                case 'popular':   items = await this._fetchPopular(); break;
                case 'history':   items = await this._fetchHistory(); break;
                case 'watchlater':items = await this._fetchWatchlater(); break;
                case 'ranking':   items = await this._fetchRanking(); break;
            }
            this._cache[tab] = items;
            this._renderList(tab, items);
        } catch (e) {
            this._showListError(tab, e.message);
        } finally {
            this._loading = false;
        }
    }

    async _fetchRecommend() {
        const resp = await this._biliApi('/x/web-interface/wbi/index/top/feed/rcmd', {
            fresh_type: 4, ps: 12, fresh_idx: this._rcmdFreshIdx,
            fresh_idx_1h: this._rcmdFreshIdx, fetch_row: 4
        });
        return (resp?.data?.item || [])
            .filter(v => v.bvid && v.goto === 'av')
            .map(v => this._normalizeRcmd(v));
    }

    async _shuffleRecommend() {
        if (this._loading) return;
        this._rcmdFreshIdx++;
        delete this._cache['recommend'];
        this._loading = true;
        this._showListLoading();
        try {
            const items = await this._fetchRecommend();
            this._cache['recommend'] = items;
            this._renderRecommendList(items);
        } catch (e) {
            this._showListError('recommend', e.message);
        } finally {
            this._loading = false;
        }
    }

    _normalizeRcmd(v) {
        const dur = this._toDurationSeconds(v.duration);
        return {
            bvid: v.bvid || '',
            aid: v.id || 0,
            title: v.title || '',
            cover: this._httpsCover(v.pic || ''),
            author: v.owner?.name || '',
            mid: v.owner?.mid || 0,
            face: this._httpsCover(v.owner?.face || ''),
            duration: this._fmtDuration(dur),
            durationSec: dur,
            views: this._fmtNum(v.stat?.view || 0),
            danmaku: this._fmtNum(v.stat?.danmaku || 0),
            likes: this._fmtNum(v.stat?.like || 0),
            coins: '', favorites: '', shares: '',
            pubdate: v.pubdate || 0,
            pubdateStr: this._fmtDate(v.pubdate || 0),
            tname: v.goto || '',
            progress: 0,
            progressSec: 0,
            totalPages: 1,
            watchPage: 0,
            rcmdReason: v.rcmd_reason?.content || '',
            type: 'video',
        };
    }

    _renderRecommendList(items) {
        const listEl = this._el.querySelector('#bili-list');
        this._setSidebarContext('recommend', items.length);
        const shuffleBar = `<div class="bili-rcmd-shuffle-bar">
            <button class="bili-rcmd-shuffle-btn" id="bili-rcmd-shuffle">
                <i class="fas fa-sync-alt"></i><span>换一换</span>
            </button>
        </div>`;
        if (!items.length) {
            listEl.innerHTML = shuffleBar + '<div class="bili-list-msg"><i class="fas fa-inbox"></i> 暂无推荐</div>';
        } else {
            listEl.innerHTML = shuffleBar + items.map((v, i) => this._renderVideoItem(v, i, 'recommend', false)).join('');
            this._bindListItemEvents(listEl, items);
            this._bindImageFallbacks(listEl, 'recommend');
            this._renderBrowseOverview('recommend', items);
        }
        listEl.querySelector('#bili-rcmd-shuffle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            btn.classList.add('bili-shuffling');
            this._shuffleRecommend();
            setTimeout(() => btn.classList.remove('bili-shuffling'), 800);
        });
    }

    async _fetchPopular() {
        const resp = await this._biliApi('/x/web-interface/popular', { ps: 20, pn: 1 });
        return (resp?.data?.list || []).map(v => this._normalizeVideo(v));
    }

    async _fetchHistory() {
        if (!this._loggedIn) return [];
        const resp = await this._biliApi('/x/web-interface/history/cursor', { ps: 20, business: '' });
        return (resp?.data?.list || []).map(v => this._normalizeHistory(v));
    }

    async _fetchWatchlater() {
        if (!this._loggedIn) return [];
        const resp = await this._biliApi('/x/v2/history/toview');
        const rawList = resp?.data?.list || [];
        const items = rawList.map(v => {
            const normalized = this._normalizeVideo(v);
            if (!normalized.watchPage && v.videos > 1 && v.cid) {
                normalized._pendingCid = v.cid;
                normalized._bvid = v.bvid;
            }
            return normalized;
        });
        await this._resolveWatchPages(items);
        return items;
    }

    async _resolveWatchPages(items) {
        const pending = items.filter(v => v._pendingCid);
        if (!pending.length) return;
        const tasks = pending.slice(0, 5).map(async (v) => {
            try {
                const info = await this._biliApi('/x/web-interface/view', { bvid: v._bvid || v.bvid });
                const pages = info?.data?.pages;
                if (Array.isArray(pages)) {
                    const matched = pages.find(p => p.cid === v._pendingCid);
                    if (matched) v.watchPage = matched.page || 0;
                }
            } catch {}
            delete v._pendingCid;
            delete v._bvid;
        });
        await Promise.all(tasks);
    }

    async _loadFavoritePanel() {
        if (!this._loggedIn) {
            this._showListError('favorite', '请先登录');
            return;
        }

        if (!this._favFolders) {
            const mid = this._userMid || (await this._checkLogin()).mid;
            if (!mid) { this._showListError('favorite', '获取用户信息失败'); return; }
            const foldersResp = await this._biliApi('/x/v3/fav/folder/created/list-all', { up_mid: mid });
            this._favFolders = (foldersResp?.data?.list || []).map(f => ({
                id: f.id,
                title: f.title || '未命名',
                count: f.media_count || 0,
            }));
        }

        if (!this._favFolders.length) {
            this._showListError('favorite', '暂无收藏夹');
            return;
        }

        if (!this._activeFavId) {
            this._activeFavId = this._favFolders[0].id;
        }
        this._favFolderId = this._activeFavId;

        const listEl = this._el.querySelector('#bili-list');
        const folderTabs = this._buildFavFolderTabs();

        const cacheKey = 'fav_' + this._activeFavId;
        let items;
        if (this._cache[cacheKey]) {
            items = this._cache[cacheKey];
        } else {
            const listResp = await this._biliApi('/x/v3/fav/resource/list', { media_id: this._activeFavId, pn: 1, ps: 20 });
            items = (listResp?.data?.medias || []).map(v => this._normalizeFav(v));
            this._cache[cacheKey] = items;
        }

        const itemsHtml = items.length
            ? items.map((v, i) => this._renderVideoItem(v, i, 'favorite', true)).join('')
            : '<div class="bili-list-msg"><i class="fas fa-inbox"></i> 该收藏夹暂无内容</div>';

        listEl.innerHTML = folderTabs + itemsHtml;
        this._setSidebarContext('favorite', items.length);
        this._bindFavFolderEvents(listEl);
        this._bindListItemEvents(listEl, items);
        this._bindImageFallbacks(listEl, 'favorite');
        this._renderBrowseOverview('favorite', items);

        if (items.length) {
            listEl.querySelectorAll('.bili-item-rm-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const itemEl = btn.closest('.bili-item');
                    const idx = parseInt(itemEl?.dataset.idx);
                    const item = items[idx];
                    if (!item || !item.aid) return;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    btn.disabled = true;
                    try {
                        await this._cancelFavorite(item.aid);
                        itemEl.style.transition = 'opacity 0.3s, max-height 0.3s';
                        itemEl.style.opacity = '0';
                        itemEl.style.maxHeight = '0';
                        itemEl.style.overflow = 'hidden';
                        setTimeout(() => itemEl.remove(), 350);
                    } catch (err) {
                        btn.innerHTML = '<i class="fas fa-times"></i>';
                        btn.disabled = false;
                    }
                });
            });
        }
    }

    _buildFavFolderTabs() {
        if (!this._favFolders?.length) return '';
        return `<div class="bili-fav-folders">${this._favFolders.map(f =>
            `<button class="bili-fav-folder-btn${f.id === this._activeFavId ? ' active' : ''}" data-fid="${f.id}">${this._esc(f.title)}<span class="bili-ff-count">${f.count}</span></button>`
        ).join('')}</div>`;
    }

    _bindFavFolderEvents(listEl) {
        listEl.querySelectorAll('.bili-fav-folder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._activeFavId = parseInt(btn.dataset.fid);
                this._favFolderId = this._activeFavId;
                this._loadTab('favorite');
            });
        });
    }

    async _fetchRanking() {
        const resp = await this._biliApi('/x/web-interface/ranking/v2', { rid: 0, type: 'all' });
        return (resp?.data?.list || []).slice(0, 20).map((v, i) => ({
            ...this._normalizeVideo(v),
            rankNum: i + 1
        }));
    }

    async _fetchLive() {
        const requests = [
            this._biliApi('/room/v1/room/get_user_recommend', { page: 1, page_size: 24 })
                .then(resp => {
                    if (resp?.code !== 0 || !Array.isArray(resp?.data)) throw new Error(resp?.message || '热门直播加载失败');
                    return resp.data.map(room => this._normalizeLiveRoom(room, 'popular'));
                }),
            this._biliApi('/room/v3/area/getRoomList', {
                platform: 'web', parent_area_id: 10, area_id: 624,
                page: 1, page_size: 50, sort_type: 'online'
            }).then(resp => {
                if (resp?.code !== 0) throw new Error(resp?.message || '影视直播加载失败');
                const trustedRoomIds = new Set([545007]);
                return (resp?.data?.list || [])
                    .filter(room => trustedRoomIds.has(Number(room.roomid || room.room_id))
                        || (Number(room?.verify?.type) === 1 && /放映厅|影视/.test(room?.verify?.desc || '')))
                    .map(room => this._normalizeLiveRoom(room, 'drama'));
            }),
            this._fetchScreeningLiveRooms(),
        ];
        if (this._loggedIn) {
            requests.unshift(
                this._biliApi('/xlive/web-ucenter/v1/xfetter/GetWebList', { page: 1, page_size: 24 })
                    .then(resp => {
                        if (resp?.code !== 0) throw new Error(resp?.message || '关注直播加载失败');
                        return (resp?.data?.rooms || []).map(room => this._normalizeLiveRoom(room, 'following'));
                    })
            );
        }

        const settled = await Promise.allSettled(requests);
        const successful = settled.filter(result => result.status === 'fulfilled').flatMap(result => result.value);
        if (!successful.length) {
            const reason = settled.find(result => result.status === 'rejected')?.reason;
            throw reason || new Error('直播列表暂时不可用');
        }
        const byRoom = new Map();
        const sourcePriority = { following: 3, drama: 2, popular: 1 };
        successful.forEach(room => {
            if (!room.roomId) return;
            const current = byRoom.get(String(room.roomId));
            if (!current) {
                byRoom.set(String(room.roomId), room);
                return;
            }
            const preferred = sourcePriority[room.source] > sourcePriority[current.source] ? room : current;
            byRoom.set(String(room.roomId), {
                ...preferred,
                isDrama: current.isDrama || room.isDrama,
                officialLabel: current.officialLabel || room.officialLabel,
            });
        });
        return Array.from(byRoom.values()).sort((a, b) => {
            if (a.source !== b.source) return sourcePriority[b.source] - sourcePriority[a.source];
            return b.onlineCount - a.onlineCount;
        });
    }

    _normalizeLiveRoom(room, source = 'popular') {
        const onlineCount = Math.max(0, Number(room?.online || room?.watched_show?.num) || 0);
        const roomId = Number(room?.roomid || room?.room_id || room?.short_id) || 0;
        return {
            type: 'live',
            source,
            isDrama: source === 'drama',
            officialLabel: room?.verify?.desc || '',
            roomId,
            title: room?.title || '未命名直播间',
            author: room?.uname || room?.name || '主播',
            mid: Number(room?.uid || room?.mid) || 0,
            face: this._httpsCover(room?.face || ''),
            cover: this._httpsCover(room?.user_cover || room?.system_cover || room?.keyframe || room?.cover || ''),
            area: room?.area_name || room?.areaName || room?.parent_area_name || '直播',
            onlineCount,
            onlineText: room?.watched_show?.text_small || `${this._fmtNum(onlineCount)} 人气`,
            duration: 'LIVE',
            views: room?.watched_show?.text_small || this._fmtNum(onlineCount),
            tname: room?.area_name || room?.areaName || room?.parent_area_name || '直播',
            liveUrl: `https://live.bilibili.com/${roomId}`,
        };
    }

    async _fetchScreeningLiveRooms() {
        const keywords = ['影评', '电影解说', '放映厅'];
        const settled = await Promise.allSettled(keywords.map(keyword =>
            this._biliApi('/x/web-interface/search/type', {
                search_type: 'live_room', keyword, page: 1, page_size: 20
            })
        ));
        const rooms = [];
        settled.forEach(result => {
            if (result.status !== 'fulfilled' || result.value?.code !== 0) return;
            (result.value?.data?.result || []).forEach(room => {
                const title = String(room.title || '').replace(/<[^>]+>/g, '');
                const text = `${title} ${room.uname || ''} ${room.tags || ''}`;
                const category = room.cate_name || '';
                const relevant = /影评|电影解说|影视解说|放映厅|观影|看电影|高分神剧/.test(text);
                const gameCategory = /游戏|手游|网游|单机|电竞|格斗|英雄联盟|王者荣耀|崩坏|三角洲/.test(category);
                if (Number(room.live_status) !== 1 || !relevant || gameCategory) return;
                const normalized = this._normalizeLiveRoom({
                    ...room,
                    title,
                    area_name: category || '影视直播',
                    verify: { desc: /放映厅/.test(text) ? '放映厅直播' : '影评直播' },
                }, 'drama');
                rooms.push(normalized);
            });
        });
        return Array.from(new Map(rooms.map(room => [String(room.roomId), room])).values());
    }

    // ===================== Write Operations (v3.8.0) =====================

    async _cancelWatchlater(aid) {
        await this._biliApi('/x/v2/history/toview/del', { aid }, 'POST');
        if (this._cache['watchlater']) {
            this._cache['watchlater'] = this._cache['watchlater'].filter(v => v.aid !== aid);
        }
    }

    async _addWatchlater(aid) {
        await this._biliApi('/x/v2/history/toview/add', { aid }, 'POST');
        delete this._cache['watchlater'];
    }

    async _cancelFavorite(aid) {
        if (!this._favFolderId) return;
        await this._biliApi('/x/v3/fav/resource/deal', {
            rid: aid, type: 2, del_media_ids: this._favFolderId, add_media_ids: ''
        }, 'POST');
        const cacheKey = 'fav_' + this._favFolderId;
        if (this._cache[cacheKey]) {
            this._cache[cacheKey] = this._cache[cacheKey].filter(v => v.aid !== aid);
        }
    }

    async _likeVideo(aid, like = 1) {
        await this._biliApi('/x/web-interface/archive/like', { aid, like }, 'POST');
    }

    // ===================== Following (v3.7.0+) =====================

    async _loadFollowing(append = false) {
        if (!this._loggedIn) {
            this._showListError('following', '请先登录');
            return;
        }

        if (!this._followGroups) {
            try {
                const tagsResp = await this._biliApi('/x/relation/tags');
                this._followGroups = tagsResp?.data || [];
            } catch { this._followGroups = []; }
        }

        const listEl = this._el.querySelector('#bili-list');
        const cacheKey = 'following_' + this._activeGroupId;
        if (!append) this._followPage = 1;
        let pageItems;
        let total = 0;

        if (this._activeGroupId === 'all') {
            const resp = await this._biliApi('/x/relation/followings', {
                vmid: this._userMid,
                ps: this._followPageSize,
                pn: this._followPage,
                order_type: 'attention'
            });
            pageItems = (resp?.data?.list || []).map(u => this._normalizeFollowUser(u));
            total = Number(resp?.data?.total) || pageItems.length;
            this._followAllTotal = total;
        } else {
            const resp = await this._biliApi('/x/relation/tag', {
                tagid: this._activeGroupId,
                ps: this._followPageSize,
                pn: this._followPage
            });
            pageItems = (resp?.data || []).map(u => this._normalizeFollowUser(u));
            const activeGroup = this._followGroups?.find(g => String(g.tagid) === String(this._activeGroupId));
            total = Number(activeGroup?.count) || pageItems.length;
        }

        const previous = append ? (this._cache[cacheKey] || []) : [];
        const byMid = new Map(previous.map(user => [String(user.mid), user]));
        pageItems.forEach(user => byMid.set(String(user.mid), user));
        const items = Array.from(byMid.values());
        this._cache[cacheKey] = items;
        this._followTotal = Math.max(total, items.length);
        this._followHasMore = pageItems.length === this._followPageSize && items.length < this._followTotal;
        this._setSidebarContext('following', this._followTotal);
        listEl.innerHTML = this._buildFollowGroupTabs() + this._renderFollowList(items);
        this._bindFollowGroupEvents(listEl);
        this._bindFollowItemEvents(listEl, items);
        this._renderFollowingOverview(items);
    }

    _buildFollowGroupTabs() {
        const groups = [{ tagid: 'all', name: '全部关注', count: this._followAllTotal || (this._activeGroupId === 'all' ? this._followTotal : 0) }];
        if (this._followGroups?.length) {
            const special = this._followGroups.find(g => g.tagid === -10);
            if (special) groups.push({ tagid: -10, name: '特别关注', count: special.count || 0, icon: 'star' });
            this._followGroups.filter(g => g.tagid > 0).forEach(g => {
                groups.push({ tagid: g.tagid, name: g.name, count: g.count || 0 });
            });
            const def = this._followGroups.find(g => g.tagid === 0);
            if (def) groups.push({ tagid: 0, name: '默认分组', count: def.count || 0 });
        }
        const activeName = groups.find(g => String(g.tagid) === String(this._activeGroupId))?.name || '全部关注';
        return `<section class="bili-follow-filter" aria-label="关注分组与筛选">
            <div class="bili-follow-filter-head">
                <div><span>GROUPS</span><strong>关注分组</strong></div>
                <small>当前：${this._esc(activeName)}</small>
            </div>
            <div class="bili-follow-groups" role="tablist" aria-label="切换关注分组">${groups.map(g =>
                `<button type="button" role="tab" aria-selected="${String(g.tagid) === String(this._activeGroupId)}" class="bili-follow-group-btn${String(g.tagid) === String(this._activeGroupId) ? ' active' : ''}" data-gid="${g.tagid}">${g.icon ? `<i class="fas fa-${g.icon}"></i>` : ''}<span>${this._esc(g.name)}</span><b class="bili-fg-count">${Number(g.count) || 0}</b></button>`
            ).join('')}</div>
            <label class="bili-follow-search">
                <i class="fas fa-search"></i>
                <input type="search" id="bili-follow-search" placeholder="搜索当前已加载的 UP 主" autocomplete="off" aria-label="搜索当前已加载的 UP 主">
                <span id="bili-follow-match-count">${this._followTotal} 人</span>
            </label>
        </section>`;
    }

    _renderFollowList(items) {
        if (!items.length) return `<div class="bili-follow-empty">
            <img src="assets/bilibili/follow-empty-v1.png" alt="没有找到关注 UP 主的插画">
            <strong>当前分组还没有 UP 主</strong>
            <span>可以切换其他分组，或刷新后再看看。</span>
        </div>`;
        const rows = items.map((u, i) => `
            <div class="bili-follow-item" data-idx="${i}" data-mid="${u.mid}">
                <img class="bili-follow-avatar" src="${this._esc(u.face)}" alt="${this._esc(u.uname)}的头像" loading="lazy">
                <div class="bili-follow-info">
                    <div class="bili-follow-name">
                        ${this._esc(u.uname)}
                        ${u.officialTitle ? `<span class="bili-follow-badge" title="${this._esc(u.officialTitle)}"><i class="fas fa-check-circle"></i></span>` : ''}
                        ${u.isVip ? '<span class="bili-follow-vip"><i class="fas fa-crown"></i></span>' : ''}
                    </div>
                    <div class="bili-follow-sign">${this._esc(u.sign || '这个人很懒，什么都没写~')}</div>
                </div>
                <div class="bili-follow-actions">
                    <button type="button" class="bili-follow-profile-btn" aria-label="查看${this._esc(u.uname)}的主页"><i class="fas fa-user"></i><span>主页</span></button>
                    <button type="button" class="bili-follow-latest-btn" aria-label="播放${this._esc(u.uname)}的最新视频"><i class="fas fa-play"></i><span>最新</span></button>
                </div>
            </div>
        `).join('');
        return `<div class="bili-follow-results" id="bili-follow-results">${rows}</div>
            <div class="bili-follow-empty bili-follow-search-empty" id="bili-follow-search-empty" hidden>
                <img src="assets/bilibili/follow-empty-v1.png" alt="没有搜索到关注 UP 主的插画">
                <strong>没有找到匹配的 UP 主</strong>
                <span>换个名字或简介关键词试试。</span>
                <button type="button" id="bili-follow-clear-search">清除搜索</button>
            </div>
            <div class="bili-follow-pagination">
                <span>已加载 <b>${items.length}</b> / ${this._followTotal}</span>
                ${this._followHasMore ? '<button type="button" id="bili-follow-load-more"><i class="fas fa-plus"></i> 加载更多</button>' : '<small>当前分组已全部加载</small>'}
            </div>`;
    }

    _normalizeFollowUser(u) {
        return {
            mid: u.mid || 0,
            uname: u.uname || '',
            face: this._httpsCover(u.face || ''),
            sign: u.sign || '',
            officialTitle: u.official_verify?.desc || '',
            isVip: (u.vip?.vipType || 0) > 0,
        };
    }

    _bindFollowGroupEvents(listEl) {
        listEl.querySelectorAll('.bili-follow-group-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._activeGroupId = btn.dataset.gid === 'all' ? 'all' : parseInt(btn.dataset.gid);
                this._followPage = 1;
                this._followTotal = 0;
                this._followHasMore = false;
                this._loadTab('following');
            });
        });
    }

    _bindFollowItemEvents(listEl, items) {
        listEl.querySelectorAll('.bili-follow-latest-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const item = btn.closest('.bili-follow-item');
                const user = items[parseInt(item?.dataset.idx)];
                if (user) await this._playLatestForUser(user, btn);
            });
        });

        listEl.querySelectorAll('.bili-follow-profile-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.bili-follow-item');
                const mid = item?.dataset.mid;
                const idx = parseInt(item?.dataset.idx);
                if (!mid) return;
                const user = items[idx];
                this._loadUserSpace(mid, user?.uname || '', user || null);
                listEl.querySelectorAll('.bili-follow-item').forEach(fi => fi.classList.remove('playing'));
                item.classList.add('playing');
            });
        });

        const search = listEl.querySelector('#bili-follow-search');
        search?.addEventListener('input', () => {
            const query = search.value.trim().toLocaleLowerCase('zh-CN');
            let matches = 0;
            listEl.querySelectorAll('.bili-follow-item').forEach((row, index) => {
                const user = items[index];
                const visible = !query || `${user?.uname || ''} ${user?.sign || ''}`.toLocaleLowerCase('zh-CN').includes(query);
                row.hidden = !visible;
                if (visible) matches++;
            });
            const count = listEl.querySelector('#bili-follow-match-count');
            if (count) count.textContent = query ? `匹配 ${matches} 人` : `${this._followTotal} 人`;
            const empty = listEl.querySelector('#bili-follow-search-empty');
            if (empty) empty.hidden = !query || matches > 0;
        });

        listEl.querySelector('#bili-follow-clear-search')?.addEventListener('click', () => {
            if (!search) return;
            search.value = '';
            search.dispatchEvent(new Event('input', { bubbles: true }));
            search.focus();
        });

        listEl.querySelector('#bili-follow-load-more')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中';
            this._followPage++;
            try { await this._loadFollowing(true); }
            catch (error) {
                this._followPage--;
                this._showBiliToast(`加载更多失败：${error.message}`, 'warn');
            }
        });
    }

    async _playLatestForUser(user, button = null) {
        if (!user?.mid) return;
        const oldMarkup = button?.innerHTML || '';
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>加载</span>';
        }
        try {
            const result = await this._fetchCreatorVideos(user.mid, user.uname, 5);
            const video = result.videos[0];
            if (!video) {
                const reason = result.error?.message ? `（${result.error.message}）` : '';
                this._showBiliToast(`${user.uname} 暂无可播放的公开视频${reason}`, 'warn');
                return;
            }
            this._playItem(video);
        } catch (error) {
            console.warn('[Bilibili] 获取 UP 主最新视频失败:', error.message);
            this._showBiliToast(`获取最新视频失败：${error.message}`, 'warn');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = oldMarkup;
            }
        }
    }

    async _fetchCreatorVideos(mid, creatorName = '', pageSize = 24) {
        const creatorMid = Number(mid) || 0;
        let archiveError = null;

        try {
            const response = await this._biliApi('/x/space/wbi/arc/search', {
                mid: creatorMid,
                ps: pageSize,
                pn: 1,
                order: 'pubdate',
            });
            if (response?.code !== 0) {
                throw new Error(response?.message || `投稿接口返回 ${response?.code}`);
            }
            const rawVideos = response?.data?.list?.vlist || [];
            if (rawVideos.length) {
                return {
                    videos: rawVideos.map(video => this._normalizeVideo({
                        bvid: video.bvid,
                        aid: video.aid,
                        title: video.title,
                        pic: video.pic,
                        owner: { name: video.author || creatorName, mid: creatorMid },
                        duration: video.length,
                        stat: { view: video.play, danmaku: video.video_review },
                        pubdate: video.created || video.pubdate,
                        tname: video.typename || '',
                    })).filter(video => video.bvid),
                    count: Number(response?.data?.page?.count) || rawVideos.length,
                    source: 'archive',
                    error: null,
                };
            }
        } catch (error) {
            archiveError = error;
            // WBI 投稿接口经常因风控不可用；动态流是既定恢复路径，成功前不记 warning。
            console.debug?.('[Bilibili] UP 主投稿接口不可用，已切换动态流:', error.message);
        }

        try {
            const response = await this._biliApi('/x/polymer/web-dynamic/v1/feed/space', {
                host_mid: creatorMid,
                timezone_offset: -480,
                offset: '',
            });
            if (response?.code !== 0) {
                throw new Error(response?.message || `动态接口返回 ${response?.code}`);
            }
            const seen = new Set();
            const videos = (response?.data?.items || []).map(item => {
                const archive = item?.modules?.module_dynamic?.major?.archive;
                if (!archive?.bvid || seen.has(archive.bvid)) return null;
                seen.add(archive.bvid);
                return this._normalizeVideo({
                    bvid: archive.bvid,
                    aid: archive.avid || archive.aid,
                    title: archive.title,
                    pic: archive.cover,
                    owner: { name: creatorName, mid: creatorMid },
                    duration: archive.duration_text,
                    stat: { view: archive.stat?.play, danmaku: archive.stat?.danmaku },
                    pubdate: archive.pub_ts || item?.modules?.module_author?.pub_ts || 0,
                });
            }).filter(Boolean).slice(0, pageSize);
            return {
                videos,
                count: videos.length,
                source: videos.length ? 'dynamic' : 'empty',
                error: archiveError,
            };
        } catch (feedError) {
            console.warn('[Bilibili] 获取 UP 主动态流失败:', feedError.message);
            return {
                videos: [],
                count: 0,
                source: 'failed',
                error: archiveError || feedError,
            };
        }
    }

    _renderFollowingOverview(items) {
        const frame = this._el?.querySelector('#bili-player-frame');
        if (!frame || !items?.length) return;
        const group = this._activeGroupId === 'all'
            ? { name: '全部关注' }
            : this._followGroups?.find(item => String(item.tagid) === String(this._activeGroupId));
        const groupName = group?.name || (this._activeGroupId === -10 ? '特别关注' : '当前分组');
        const hero = items[0];
        const portraits = items.slice(0, 5).map((user, index) =>
            `<img src="${this._esc(user.face)}" alt="${this._esc(user.uname)}的头像"${index ? ' loading="lazy"' : ''}>`
        ).join('');
        const cards = items.slice(1, 9).map((user, offset) => {
            const index = offset + 1;
            return `<article class="bili-follow-work-card">
                <img src="${this._esc(user.face)}" alt="${this._esc(user.uname)}的头像" loading="lazy">
                <div><strong>${this._esc(user.uname)}</strong><p>${this._esc(user.sign || '这个人很懒，什么都没写~')}</p></div>
                <div class="bili-follow-work-actions">
                    <button type="button" data-bili-follow-action="profile" data-bili-follow-index="${index}"><i class="fas fa-user"></i> 主页</button>
                    <button type="button" class="primary" data-bili-follow-action="latest" data-bili-follow-index="${index}"><i class="fas fa-play"></i> 最新视频</button>
                </div>
            </article>`;
        }).join('');

        frame.innerHTML = `<div class="bili-follow-workbench">
            <section class="bili-follow-work-hero">
                <div class="bili-follow-work-backdrop" style="background-image:url('${this._esc(hero.face)}')"></div>
                <div class="bili-follow-work-copy">
                    <span>CREATOR WORKBENCH · ${this._esc(groupName)}</span>
                    <h2>关注不只是名单，<br>而是你的内容工作台</h2>
                    <p>当前已加载 ${items.length} / ${this._followTotal} 位 UP 主。可在右侧按分组搜索，也可直接进入主页或播放最新视频。</p>
                    <div class="bili-follow-work-actions">
                        <button type="button" data-bili-follow-action="profile" data-bili-follow-index="0"><i class="fas fa-user"></i> ${this._esc(hero.uname)}的主页</button>
                        <button type="button" class="primary" data-bili-follow-action="latest" data-bili-follow-index="0"><i class="fas fa-play"></i> 播放最新视频</button>
                    </div>
                </div>
                <div class="bili-follow-work-portraits" aria-label="当前分组 UP 主头像">${portraits}</div>
            </section>
            <section class="bili-follow-work-section">
                <header><div><span>CREATORS</span><strong>${this._esc(groupName)}精选</strong></div><small>真实头像 · 明确双操作</small></header>
                <div class="bili-follow-work-grid">${cards || '<div class="bili-list-msg">当前分组暂无更多 UP 主</div>'}</div>
            </section>
        </div>`;
        this._currentVideo = null;
        this._el.querySelector('#bili-player-info')?.classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
    }

    async _loadUserSpace(mid, uname = '', profileHint = null) {
        const creatorMid = Number(mid) || 0;
        const frame = this._el?.querySelector('#bili-player-frame');
        if (!creatorMid || !frame) return;

        const requestId = ++this._creatorLoadSeq;
        const hint = profileHint || this._findCachedCreator(creatorMid) || {};
        if (!this._creatorView) {
            this._creatorReturn = this._currentVideo?.bvid
                ? { type: 'player', video: { ...this._currentVideo }, label: '返回播放器' }
                : { type: 'tab', tab: this._currentTab, label: `返回${this._tabMeta(this._currentTab).title}` };
        }
        this._creatorView = { mid: creatorMid, uname: uname || hint.uname || hint.author || 'UP 主' };
        this._creatorItems = [];
        this._setCreatorMode(true);
        this._setProductPage('recommend');
        this._hideComments();
        this._el.querySelector('#bili-player-info')?.classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
        frame.innerHTML = `<div class="bili-creator-loading" role="status">
            <span><i class="fas fa-spinner fa-spin"></i></span>
            <strong>正在整理 ${this._esc(this._creatorView.uname)} 的主页</strong>
            <p>加载 UP 主资料与最近投稿…</p>
        </div>`;

        const [profileResult, relationResult, videosResult] = await Promise.allSettled([
            this._biliApi('/x/space/wbi/acc/info', { mid: creatorMid }),
            this._biliApi('/x/relation/stat', { vmid: creatorMid }),
            this._fetchCreatorVideos(creatorMid, this._creatorView.uname, 24),
        ]);
        if (requestId !== this._creatorLoadSeq || this._creatorView?.mid !== creatorMid) return;

        const info = profileResult.status === 'fulfilled' ? profileResult.value?.data : null;
        const relation = relationResult.status === 'fulfilled' ? relationResult.value?.data : null;
        const videoResult = videosResult.status === 'fulfilled'
            ? videosResult.value
            : { videos: [], count: 0, source: 'failed', error: videosResult.reason };
        const creatorName = info?.name || hint.uname || hint.author || uname || 'UP 主';
        const videos = videoResult.videos;
        const profile = {
            mid: creatorMid,
            name: creatorName,
            face: this._httpsCover(info?.face || hint.face || ''),
            sign: info?.sign || hint.sign || '在当前工作台继续浏览这位 UP 主的公开投稿。',
            officialTitle: info?.official?.title || info?.official_verify?.desc || hint.officialTitle || '',
            isVip: Boolean(info?.vip?.status || info?.vip?.vipStatus || hint.isVip),
            level: Number(info?.level) || 0,
            following: Number.isFinite(Number(relation?.following)) ? Number(relation.following) : null,
            followers: Number.isFinite(Number(relation?.follower)) ? Number(relation.follower) : null,
            videoCount: Number(videoResult.count) || videos.length,
        };
        const errors = [profileResult, relationResult].filter(result => result.status === 'rejected' || result.value?.code !== 0);
        if (videoResult.error && !videos.length) errors.push(videosResult);
        const note = videoResult.source === 'dynamic'
            ? '投稿接口暂时不可用，已从 UP 主动态恢复最近视频。'
            : (errors.length ? '部分资料暂时不可用，已展示能够读取的公开内容。' : '');
        this._creatorView = profile;
        this._creatorItems = videos;
        this._renderCreatorHome(profile, videos, note);
    }

    _findCachedCreator(mid) {
        const creatorMid = String(mid);
        for (const value of Object.values(this._cache)) {
            if (!Array.isArray(value)) continue;
            const match = value.find(item => String(item?.mid || '') === creatorMid);
            if (match) return match;
        }
        return null;
    }

    _renderCreatorHome(profile, videos, note = '') {
        const frame = this._el?.querySelector('#bili-player-frame');
        if (!frame || !profile) return;
        const fallbackAvatar = this._assetUrl('assets/bilibili/follow-empty-v1.png');
        const avatar = profile.face || fallbackAvatar;
        const official = profile.officialTitle
            ? `<span class="bili-creator-badge" title="${this._esc(profile.officialTitle)}"><i class="fas fa-check-circle"></i>${this._esc(profile.officialTitle)}</span>`
            : '';
        const vip = profile.isVip ? '<span class="bili-creator-vip"><i class="fas fa-crown"></i>大会员</span>' : '';
        const level = profile.level ? `<span class="bili-creator-level">LV${profile.level}</span>` : '';
        const stats = [
            profile.followers == null ? '' : `<span><strong>${Number(profile.followers).toLocaleString('zh-CN')}</strong> 粉丝</span>`,
            `<span><strong>${Number(profile.videoCount || videos.length).toLocaleString('zh-CN')}</strong> 投稿</span>`,
            profile.following == null ? '' : `<span><strong>${Number(profile.following).toLocaleString('zh-CN')}</strong> 关注</span>`,
        ].filter(Boolean).join('');
        const cards = videos.map((video, index) => `<article class="bili-creator-video">
            <div class="bili-creator-video-media">
                <img src="${this._esc(video.cover || this._assetUrl(this._tabMeta('recommend').asset))}" data-bili-fallback="${this._esc(this._assetUrl(this._tabMeta('recommend').asset))}" alt="" loading="lazy">
                <span class="bili-creator-play"><i class="fas fa-play"></i></span>
                <span class="bili-creator-duration">${this._esc(video.duration || '')}</span>
            </div>
            <div class="bili-creator-video-copy">
                <strong>${this._esc(video.title)}</strong>
                <div><span><i class="fas fa-play"></i>${this._esc(video.views || '0')}</span><span><i class="fas fa-comment-dots"></i>${this._esc(video.danmaku || '0')}</span>${video.pubdateStr ? `<span><i class="fas fa-calendar-alt"></i>${this._esc(video.pubdateStr)}</span>` : ''}</div>
            </div>
            <button type="button" class="bili-creator-video-play-button" data-bili-creator-video-index="${index}" aria-label="播放 ${this._esc(video.title)}"></button>
            <button type="button" class="bili-creator-video-open" data-bili-creator-open-index="${index}" title="在 B 站打开" aria-label="在 B 站打开 ${this._esc(video.title)}"><i class="fas fa-external-link-alt"></i></button>
        </article>`).join('');
        const returnLabel = this._creatorReturn?.label || '返回内容列表';
        frame.innerHTML = `<div class="bili-creator-home ${this._creatorLayout === 'list' ? 'is-list' : ''}">
            <header class="bili-creator-heading"><span>BILIBILI · CREATOR WORKBENCH</span><h2>${this._esc(profile.name)}的主页</h2></header>
            <section class="bili-creator-hero">
                <div class="bili-creator-backdrop" style="background-image:url('${this._esc(avatar)}')"></div>
                <img class="bili-creator-avatar" src="${this._esc(avatar)}" data-bili-fallback="${this._esc(fallbackAvatar)}" alt="${this._esc(profile.name)}的头像">
                <div class="bili-creator-copy">
                    <span class="bili-creator-eyebrow">UP 主 · HOME</span>
                    <div class="bili-creator-name"><h3>${this._esc(profile.name)}</h3>${official}${vip}${level}</div>
                    <p>${this._esc(profile.sign)}</p>
                    <div class="bili-creator-stats">${stats}</div>
                </div>
                <div class="bili-creator-actions">
                    <button type="button" data-bili-creator-action="back"><i class="fas fa-arrow-left"></i>${this._esc(returnLabel)}</button>
                    <button type="button" class="primary" data-bili-creator-action="play-latest" ${videos.length ? '' : 'disabled'}><i class="fas fa-play"></i>播放最新投稿</button>
                    <button type="button" data-bili-creator-action="open-space"><i class="fab fa-bilibili"></i>原站空间</button>
                </div>
            </section>
            <section class="bili-creator-content">
                <header>
                    <div><span>RECENT UPDATES</span><strong>最近投稿 · ${videos.length} 个视频</strong>${note ? `<small>${this._esc(note)}</small>` : ''}</div>
                    <div class="bili-creator-layout" aria-label="投稿排列方式">
                        <button type="button" data-bili-creator-action="layout-grid" aria-pressed="${this._creatorLayout === 'grid'}" title="网格视图"><i class="fas fa-th"></i></button>
                        <button type="button" data-bili-creator-action="layout-list" aria-pressed="${this._creatorLayout === 'list'}" title="列表视图"><i class="fas fa-list"></i></button>
                    </div>
                </header>
                ${cards ? `<div class="bili-creator-grid">${cards}</div>` : `<div class="bili-creator-empty"><i class="fas fa-video-slash"></i><strong>暂时没有读取到公开投稿</strong><p>可以稍后重试，或前往原站空间查看。</p><button type="button" data-bili-creator-action="retry"><i class="fas fa-redo"></i>重新加载</button></div>`}
            </section>
        </div>`;
        this._bindImageFallbacks(frame, 'recommend');
        frame.querySelector('[data-bili-creator-action="back"]')?.focus({ preventScroll: true });
    }

    _setCreatorMode(active) {
        this._el?.classList.toggle('bili-creator-view', active);
    }

    _setCreatorLayout(layout) {
        this._creatorLayout = layout === 'list' ? 'list' : 'grid';
        const home = this._el?.querySelector('.bili-creator-home');
        home?.classList.toggle('is-list', this._creatorLayout === 'list');
        this._el?.querySelectorAll('[data-bili-creator-action^="layout-"]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.biliCreatorAction === `layout-${this._creatorLayout}`));
        });
    }

    async _returnFromCreator() {
        const target = this._creatorReturn || { type: 'tab', tab: this._currentTab };
        this._creatorLoadSeq++;
        this._creatorView = null;
        this._creatorReturn = null;
        this._creatorItems = [];
        this._setCreatorMode(false);
        if (target.type === 'player' && target.video?.bvid) {
            await this._playItem({ ...target.video });
            return;
        }
        const tab = target.tab || this._currentTab || 'recommend';
        this._currentVideo = null;
        this._syncTabs(tab);
        await this._loadTab(tab);
    }

    _playCreatorVideo(index) {
        const video = this._creatorItems[index];
        if (!video) return;
        this._playItem({ ...video });
    }

    _openCurrentCreator() {
        const video = this._currentVideo;
        if (!video?.mid) {
            this._showBiliToast('当前视频还没有可用的 UP 主信息', 'warn');
            return;
        }
        this._loadUserSpace(video.mid, video.author || '', { ...video, uname: video.author || '' });
    }

    // ===================== Course (v3.8.0 重构) =====================

    async _loadCoursePanel() {
        if (!this._loggedIn) {
            this._showListError('course', '请先登录');
            return;
        }
        const listEl = this._el.querySelector('#bili-list');
        const courseTabsHtml = `
            <div class="bili-course-tabs">
                <button class="bili-course-tab" data-csrc="mine"><i class="fas fa-shopping-bag"></i> 我的课程</button>
                <button class="bili-course-tab active" data-csrc="discover"><i class="fas fa-compass"></i> 发现课程</button>
            </div>`;
        listEl.innerHTML = courseTabsHtml + '<div class="bili-list-msg"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
        this._bindCourseTabEvents(listEl);
        await this._loadCourseContent('discover', listEl);
    }

    _bindCourseTabEvents(listEl) {
        listEl.querySelectorAll('.bili-course-tab').forEach(tab => {
            tab.addEventListener('click', async (e) => {
                e.stopPropagation();
                listEl.querySelectorAll('.bili-course-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                await this._loadCourseContent(tab.dataset.csrc, listEl);
            });
        });
    }

    async _loadCourseContent(src, listEl) {
        const tabsHtml = listEl.querySelector('.bili-course-tabs')?.outerHTML || '';

        if (src === 'mine') {
            this._setSidebarContext('course');
            this._loadMyCoursesInPlayer();
            listEl.innerHTML = tabsHtml + `
                <div class="bili-course-hint">
                    <i class="fas fa-tv"></i>
                    <p>已购课程已在左侧播放区展示</p>
                    <small>点击课程即可开始学习</small>
                </div>`;
            this._bindCourseTabEvents(listEl);
        } else {
            listEl.innerHTML = tabsHtml + '<div class="bili-list-msg"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
            this._bindCourseTabEvents(listEl);
            try {
                const resp = await this._biliApi('/x/web-interface/wbi/search/type', {
                    search_type: 'ketang', keyword: 'AI', page: 1, order: 'totalrank'
                });
                const items = (resp?.data?.result || []).map(v => this._normalizeCourse(v));
                const itemsHtml = items.length
                    ? items.map((v, i) => this._renderCourseItem(v, i)).join('')
                    : '<div class="bili-list-msg"><i class="fas fa-inbox"></i> 暂无课程</div>';
                listEl.innerHTML = tabsHtml + itemsHtml;
                this._bindCourseTabEvents(listEl);
                this._bindListItemEvents(listEl, items);
                this._bindImageFallbacks(listEl, 'course');
                this._setSidebarContext('course', items.length);
                if (items.length) this._renderBrowseOverview('course', items, true);
                else this._renderCourseDiscoveryFallback();
            } catch (e) {
                listEl.innerHTML = tabsHtml + `<div class="bili-list-msg"><i class="fas fa-exclamation-circle"></i> ${this._esc(e.message)}</div>`;
                this._bindCourseTabEvents(listEl);
                this._renderCourseDiscoveryFallback();
            }
        }
    }

    async _loadMyCoursesInPlayer() {
        const frame = this._el.querySelector('#bili-player-frame');
        // 直播播放器是公开资源；Cookie 规则异步补齐，避免 await 丢失点击产生的自动播放许可。
        if (this._loggedIn) void this._injectBiliCookies();
        frame.innerHTML = `<iframe src="https://www.bilibili.com/cheese/mine/list" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation" allowfullscreen></iframe>`;
        this._el.querySelector('#bili-player-info').classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._currentVideo = null;
        this._pendingSeek = null;
    }

    // ===================== Data Normalizers =====================

    _normalizeVideo(v) {
        const dur = this._toDurationSeconds(v.duration);
        const prog = v.progress || 0;
        const totalPages = v.videos || 1;
        const watchCid = v.cid || 0;
        let watchPage = v.page || 0;
        if (!watchPage && totalPages > 1 && watchCid && Array.isArray(v.pages)) {
            const matched = v.pages.find(p => p.cid === watchCid);
            if (matched) watchPage = matched.page || 0;
        }
        return {
            bvid: v.bvid || '',
            aid: v.aid || 0,
            title: v.title || '',
            cover: this._httpsCover(v.pic || v.cover || ''),
            author: v.owner?.name || '',
            mid: v.owner?.mid || 0,
            face: this._httpsCover(v.owner?.face || ''),
            duration: this._fmtDuration(dur),
            durationSec: dur,
            views: this._fmtNum(v.stat?.view || 0),
            danmaku: this._fmtNum(v.stat?.danmaku || 0),
            likes: this._fmtNum(v.stat?.like || 0),
            coins: this._fmtNum(v.stat?.coin || 0),
            favorites: this._fmtNum(v.stat?.favorite || 0),
            shares: this._fmtNum(v.stat?.share || 0),
            pubdate: v.pubdate || 0,
            pubdateStr: this._fmtDate(v.pubdate || 0),
            tname: v.tname || '',
            progress: prog > 0 && dur > 0 ? Math.round(prog / dur * 100) : 0,
            progressSec: prog > 0 ? prog : 0,
            totalPages,
            watchPage,
            type: 'video',
        };
    }

    _normalizeHistory(v) {
        const h = v.history || {};
        const dur = this._toDurationSeconds(v.duration);
        const prog = v.progress || 0;
        const watchPage = h.page || 0;
        const totalPages = v.videos || 1;
        return {
            bvid: h.bvid || v.bvid || '',
            aid: h.oid || v.aid || 0,
            title: v.title || '',
            showTitle: v.show_title || '',
            cover: this._httpsCover(v.cover || ''),
            author: v.author_name || '',
            mid: v.author_mid || 0,
            face: this._httpsCover(v.author_face || ''),
            duration: this._fmtDuration(dur),
            durationSec: dur,
            views: '',
            danmaku: '',
            likes: '', coins: '', favorites: '', shares: '',
            viewedAt: v.view_at ? this._fmtDate(v.view_at) : '',
            pubdate: 0, pubdateStr: '',
            tname: v.tag_name || '',
            progress: prog > 0 && dur > 0 ? Math.round(prog / dur * 100) : 0,
            progressSec: prog > 0 ? prog : 0,
            totalPages,
            watchPage,
            type: 'video',
        };
    }

    _normalizeFav(v) {
        const dur = this._toDurationSeconds(v.duration);
        return {
            bvid: v.bvid || '',
            aid: v.id || 0,
            title: v.title || '',
            cover: this._httpsCover(v.cover || ''),
            author: v.upper?.name || '',
            mid: v.upper?.mid || 0,
            face: this._httpsCover(v.upper?.face || ''),
            duration: this._fmtDuration(dur),
            durationSec: dur,
            views: this._fmtNum(v.cnt_info?.play || 0),
            danmaku: this._fmtNum(v.cnt_info?.danmaku || 0),
            likes: '', coins: '', favorites: this._fmtNum(v.cnt_info?.collect || 0), shares: '',
            pubdate: v.pubtime || 0,
            pubdateStr: this._fmtDate(v.pubtime || 0),
            tname: '',
            progress: 0,
            progressSec: 0,
            totalPages: 1,
            watchPage: 0,
            type: 'video',
        };
    }

    _normalizeCourse(v) {
        const title = (v.title || '').replace(/<\/?em[^>]*>/g, '');
        return {
            seasonId: v.season_id || v.id || 0,
            title,
            cover: this._httpsCover(v.cover || v.pic || ''),
            author: v.up_name || v.owner || '',
            epCount: v.ep_count || v.ep_num || 0,
            views: this._fmtNum(v.view || v.play || 0),
            badge: v.label || (v.is_free ? '免费' : '课程'),
            type: 'course',
        };
    }

    // ===================== Search =====================

    async _doSearch(keyword) {
        if (!keyword.trim()) return;
        this._searchQuery = keyword.trim();
        this._searchSort = 'smart';
        this._currentTab = '_search';
        this._setProductPage('search');
        this._showListLoading();
        try {
            const resp = await this._biliApi('/x/web-interface/wbi/search/all/v2', { keyword, page: 1 });
            const results = resp?.data?.result || [];
            const videoResult = results.find(r => r.result_type === 'video');
            const items = (videoResult?.data || []).map((v, index) => {
                const durationSec = this._toDurationSeconds(v.duration);
                const viewsCount = Math.max(0, Number(v.play) || 0);
                const danmakuCount = Math.max(0, Number(v.danmaku) || 0);
                const favoritesCount = Math.max(0, Number(v.favorites) || 0);
                return {
                    bvid: v.bvid || '',
                    aid: v.aid || v.id || 0,
                    title: (v.title || '').replace(/<\/?em[^>]*>/g, ''),
                    cover: this._httpsCover(v.pic || v.cover || ''),
                    author: v.author || '',
                    mid: v.mid || v.author_mid || 0,
                    face: this._httpsCover(v.upic || ''),
                    duration: this._fmtDuration(durationSec),
                    durationSec,
                    views: this._fmtNum(viewsCount),
                    viewsCount,
                    danmaku: this._fmtNum(danmakuCount),
                    danmakuCount,
                    likes: this._fmtNum(v.like || 0),
                    coins: '', favorites: this._fmtNum(favoritesCount), favoritesCount, shares: '',
                    pubdate: v.pubdate || 0,
                    pubdateStr: this._fmtDate(v.pubdate || 0),
                    tname: v.typename || '',
                    progress: 0,
                    progressSec: 0,
                    totalPages: 1,
                    watchPage: 0,
                    sourceRank: index + 1,
                    type: 'video',
                };
            });
            this._searchItems = items;
            this._cache._search = items;
            this._renderList('_search', items);
        } catch (e) {
            this._showListError('_search', e.message);
        }
    }

    // ===================== DOM =====================

    _injectDOM() {
        const el = document.createElement('div');
        el.className = 'bili-panel';
        el.id = 'bili-panel';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', '哔哩哔哩工作台');
        el.setAttribute('aria-hidden', 'true');
        el.inert = true;
        el.innerHTML = `
            <div class="bili-topbar">
                <div class="bili-logo"><i class="fab fa-bilibili"></i><span>哔哩哔哩</span></div>
                <div class="bili-search">
                    <input type="text" placeholder="搜索视频、课程、UP主..." id="bili-search-input" maxlength="80" aria-label="搜索视频、课程、UP主">
                    <button type="button" id="bili-search-btn" aria-label="搜索"><i class="fas fa-search"></i></button>
                </div>
                <div class="bili-nav-scroll" aria-label="哔哩哔哩内容视图">
                    <div class="bili-nav-pills">
                        <button type="button" class="bili-pill active" data-tab="recommend" aria-pressed="true"><i class="fas fa-thumbs-up"></i>推荐</button>
                        <button type="button" class="bili-pill" data-tab="popular" aria-pressed="false"><i class="fas fa-fire"></i>热门</button>
                        <button type="button" class="bili-pill bili-live-pill" data-tab="live" aria-pressed="false"><i class="fas fa-broadcast-tower"></i>直播<span class="bili-live-pulse" aria-hidden="true"></span></button>
                        <button type="button" class="bili-pill" data-tab="ranking" aria-pressed="false"><i class="fas fa-trophy"></i>排行</button>
                        <button type="button" class="bili-pill" data-tab="course" aria-pressed="false"><i class="fas fa-graduation-cap"></i>课程</button>
                        <i class="bili-nav-divider" aria-hidden="true"></i>
                        <button type="button" class="bili-pill" data-tab="favorite" aria-pressed="false"><i class="fas fa-star"></i>收藏</button>
                        <button type="button" class="bili-pill" data-tab="watchlater" aria-pressed="false"><i class="fas fa-clock"></i>稍后看</button>
                        <button type="button" class="bili-pill" data-tab="history" aria-pressed="false"><i class="fas fa-history"></i>历史</button>
                        <button type="button" class="bili-pill" data-tab="following" aria-pressed="false"><i class="fas fa-users"></i>关注</button>
                    </div>
                </div>
                <button type="button" class="bili-sidebar-toggle open" id="bili-sidebar-toggle" title="展开/收起列表" aria-label="展开或收起列表" aria-pressed="true"><i class="fas fa-columns"></i></button>
                <button type="button" class="bili-close-btn" id="bili-close-btn" title="关闭" aria-label="关闭哔哩哔哩工作台"><i class="fas fa-times"></i></button>
            </div>
            <div class="bili-main">
                <div class="bili-player-area">
                    <div class="bili-player-frame" id="bili-player-frame">${this._emptyPlayerMarkup()}</div>
                    <div class="bili-playback-console">
                    <div class="bili-now-playing hidden" id="bili-now-playing">
                        <div class="bili-np-cover-wrap">
                            <img class="bili-np-cover" id="bili-np-cover" src="" alt="">
                            <span class="bili-np-state" id="bili-np-state"><i class="fas fa-play"></i> 播放中</span>
                        </div>
                        <div class="bili-np-main">
                            <div class="bili-np-eyebrow"><span>NOW PLAYING</span><span class="bili-np-episode" id="bili-np-episode"></span></div>
                            <strong class="bili-np-title" id="bili-np-title"></strong>
                            <span class="bili-np-author" id="bili-np-author"></span>
                        </div>
                        <div class="bili-transport">
                            <button type="button" class="bili-play-toggle" id="bili-play-toggle" aria-label="播放视频" aria-pressed="false"><i class="fas fa-play"></i></button>
                            <label class="bili-progress-control">
                                <span class="bili-ctrl-label"><i class="fas fa-wave-square"></i>播放进度</span>
                                <input type="range" id="bili-progress-range" min="0" max="1000" value="0" step="1" aria-label="调整播放进度">
                            </label>
                        </div>
                        <div class="bili-np-time" aria-live="off">
                            <strong id="bili-progress-time">0:00</strong>
                            <span><span id="bili-progress-duration">0:00</span> · <span id="bili-progress-percent">0%</span></span>
                        </div>
                        <div class="bili-console-actions" aria-label="播放器附加面板">
                            <button type="button" class="bili-speed-cycle" id="bili-speed-cycle" title="播放速度：2.0x（点击切换）" aria-label="播放速度：2.0x，点击切换"><i class="fas fa-tachometer-alt"></i><span id="bili-speed-quick-value">2.0x</span></button>
                            <button type="button" id="bili-recent-toggle" aria-controls="bili-player-recent" aria-expanded="false" title="展开 UP 主最近发布"><i class="fas fa-stream"></i><span>接着看</span></button>
                            <button type="button" id="bili-settings-toggle" aria-controls="bili-ctrl-bar" aria-expanded="false" title="展开倍速和画质"><i class="fas fa-sliders-h"></i><span>设置</span></button>
                            <button type="button" id="bili-details-toggle" aria-controls="bili-player-info" aria-expanded="false" title="展开视频详情和操作"><i class="fas fa-ellipsis-h"></i><span>更多</span></button>
                        </div>
                    </div>
                    <section class="bili-player-recent hidden" id="bili-player-recent" data-collapsed="true" aria-label="当前 UP 主最近发布的视频"></section>
                    <div class="bili-ctrl-bar hidden" id="bili-ctrl-bar" data-collapsed="true">
                        <section class="bili-ctrl-group bili-speed-control" aria-label="播放速度">
                            <div class="bili-ctrl-heading"><span class="bili-ctrl-label"><i class="fas fa-tachometer-alt"></i>播放速度</span><output id="bili-speed-status">1.0x</output></div>
                            <div class="bili-speed-btns" id="bili-speed-btns">
                                <button type="button" class="bili-speed-btn" data-speed="0.5" aria-pressed="false">0.5x</button>
                                <button type="button" class="bili-speed-btn" data-speed="0.75" aria-pressed="false">0.75x</button>
                                <button type="button" class="bili-speed-btn active" data-speed="1" aria-pressed="true">1.0x</button>
                                <button type="button" class="bili-speed-btn" data-speed="1.25" aria-pressed="false">1.25x</button>
                                <button type="button" class="bili-speed-btn" data-speed="1.5" aria-pressed="false">1.5x</button>
                                <button type="button" class="bili-speed-btn" data-speed="2" aria-pressed="false">2.0x</button>
                                <button type="button" class="bili-speed-btn" data-speed="3" aria-pressed="false">3.0x</button>
                            </div>
                        </section>
                        <section class="bili-ctrl-group bili-quality-control" aria-label="播放画质">
                            <div class="bili-ctrl-heading"><span class="bili-ctrl-label"><i class="fas fa-film"></i>播放画质</span><span class="bili-quality-status" id="bili-quality-status" aria-live="polite">正在检测</span></div>
                            <div class="bili-quality-btns" id="bili-quality-btns">
                                <span class="bili-quality-hint">加载中...</span>
                            </div>
                        </section>
                    </div>
                    <div class="bili-player-info hidden" id="bili-player-info" data-collapsed="true">
                        <div class="bili-pi-text">
                            <span id="bili-pi-title" hidden></span>
                            <div class="bili-pi-meta">
                                <span><i class="fas fa-user"></i><span id="bili-pi-author"></span></span>
                                <span><i class="fas fa-play"></i><span id="bili-pi-views"></span></span>
                                <span><i class="fas fa-comment-dots"></i><span id="bili-pi-danmaku"></span></span>
                                <span class="bili-pi-date" id="bili-pi-date"><i class="fas fa-calendar-alt"></i><span id="bili-pi-date-text"></span></span>
                            </div>
                            <div class="bili-pi-meta-extra" id="bili-pi-meta-extra">
                                <span id="bili-pi-likes"><i class="fas fa-thumbs-up"></i><span></span></span>
                                <span id="bili-pi-coins"><i class="fas fa-coins"></i><span></span></span>
                                <span id="bili-pi-favs"><i class="fas fa-star"></i><span></span></span>
                                <span id="bili-pi-shares"><i class="fas fa-share"></i><span></span></span>
                                <span id="bili-pi-dur"><i class="fas fa-hourglass-half"></i><span></span></span>
                                <span id="bili-pi-bvid" class="bili-pi-bvid"><i class="fas fa-hashtag"></i><span></span></span>
                                <span id="bili-pi-tname" class="bili-pi-tname"><i class="fas fa-tag"></i><span></span></span>
                            </div>
                        </div>
                        <div class="bili-pi-actions">
                            <button type="button" class="bili-pi-btn" id="bili-act-like" title="点赞" aria-pressed="false"><i class="fas fa-thumbs-up"></i><span>点赞</span></button>
                            <button type="button" class="bili-pi-btn" id="bili-act-later" title="加入稍后看"><i class="fas fa-clock"></i><span>稍后看</span></button>
                            <button type="button" class="bili-pi-btn" id="bili-act-comments" title="查看评论" aria-expanded="false"><i class="fas fa-comments"></i><span>评论</span></button>
                            <button type="button" class="bili-pi-btn" id="bili-act-creator" title="在 App 内查看 UP 主主页"><i class="fas fa-user-circle"></i><span>UP 主主页</span></button>
                            <i class="bili-action-divider" aria-hidden="true"></i>
                            <button type="button" class="bili-pi-btn bili-pi-btn-subtle" id="bili-act-copy" title="复制 BV 号"><i class="fas fa-copy"></i><span>复制 BV</span></button>
                            <button type="button" class="bili-pi-btn bili-pi-btn-subtle" id="bili-act-open" title="在 B 站打开"><i class="fas fa-external-link-alt"></i><span>原页</span></button>
                            <button type="button" class="bili-pi-btn bili-act-danger" id="bili-act-rm-later" title="从稍后看移除" hidden><i class="fas fa-times-circle"></i><span>移出稍后看</span></button>
                            <button type="button" class="bili-pi-btn bili-act-danger" id="bili-act-rm-fav" title="从当前收藏夹移除" hidden><i class="fas fa-heart-broken"></i><span>取消收藏</span></button>
                        </div>
                    </div>
                    </div>
                    <div class="bili-comments hidden" id="bili-comments">
                        <div class="bili-comments-header">
                            <span class="bili-comments-title"><i class="fas fa-comments"></i> 评论 <span class="bili-comments-count" id="bili-comments-count"></span></span>
                            <div class="bili-comments-sort">
                                <button class="bili-comments-sort-btn active" data-sort="0">最新</button>
                                <button class="bili-comments-sort-btn" data-sort="2">最热</button>
                            </div>
                            <button class="bili-comments-close" id="bili-comments-close" title="收起评论"><i class="fas fa-chevron-up"></i></button>
                        </div>
                        <div class="bili-comments-list" id="bili-comments-list"></div>
                        <div class="bili-comments-more hidden" id="bili-comments-more">
                            <button class="bili-comments-more-btn" id="bili-comments-more-btn">加载更多评论</button>
                        </div>
                    </div>
                </div>
                <div class="bili-sidebar visible" id="bili-sidebar">
                    <div class="bili-sidebar-head">
                        <div class="bili-sidebar-heading">
                            <span id="bili-sidebar-eyebrow">FOR YOU</span>
                            <strong id="bili-sidebar-title">为你推荐</strong>
                            <small id="bili-sidebar-desc">根据账号兴趣持续更新</small>
                        </div>
                        <span class="bili-sidebar-count" id="bili-sidebar-count">—</span>
                    </div>
                    <div class="bili-list-wrap" id="bili-list-wrap">
                        <div class="bili-list" id="bili-list"></div>
                        <button class="bili-float-refresh" id="bili-float-refresh" title="刷新当前列表"><i class="fas fa-sync-alt"></i></button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(el);
        this._el = el;
    }

    _bindEvents() {
        const el = this._el;
        el.querySelector('#bili-close-btn').addEventListener('click', () => this.hide());

        el.querySelectorAll('.bili-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                if (this._creatorView) {
                    this._creatorLoadSeq++;
                    this._creatorView = null;
                    this._creatorReturn = null;
                    this._creatorItems = [];
                    this._currentVideo = null;
                    this._setCreatorMode(false);
                }
                this._syncTabs(pill.dataset.tab);
                this._loadTab(pill.dataset.tab);
            });
        });

        el.querySelector('#bili-sidebar-toggle').addEventListener('click', () => this._toggleSidebar());

        el.querySelector('#bili-float-refresh').addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            btn.classList.add('bili-refreshing');
            this._refreshCurrentTab();
            setTimeout(() => btn.classList.remove('bili-refreshing'), 800);
        });

        const searchInput = el.querySelector('#bili-search-input');
        searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._doSearch(searchInput.value); });
        el.querySelector('#bili-search-btn').addEventListener('click', () => this._doSearch(searchInput.value));

        el.querySelector('#bili-player-frame').addEventListener('click', event => {
            const creatorAction = event.target.closest('[data-bili-creator-action]');
            if (creatorAction) {
                const action = creatorAction.dataset.biliCreatorAction;
                if (action === 'back') this._returnFromCreator();
                else if (action === 'play-latest') this._playCreatorVideo(0);
                else if (action === 'open-space' && this._creatorView?.mid) window.open(`https://space.bilibili.com/${this._creatorView.mid}`, '_blank', 'noopener');
                else if (action === 'layout-grid') this._setCreatorLayout('grid');
                else if (action === 'layout-list') this._setCreatorLayout('list');
                else if (action === 'retry' && this._creatorView?.mid) this._loadUserSpace(this._creatorView.mid, this._creatorView.name || this._creatorView.uname || '', this._creatorView);
                return;
            }
            const creatorOpen = event.target.closest('[data-bili-creator-open-index]');
            if (creatorOpen) {
                const video = this._creatorItems[parseInt(creatorOpen.dataset.biliCreatorOpenIndex)];
                if (video?.bvid) window.open(`https://www.bilibili.com/video/${video.bvid}`, '_blank', 'noopener');
                return;
            }
            const creatorVideo = event.target.closest('[data-bili-creator-video-index]');
            if (creatorVideo) {
                this._playCreatorVideo(parseInt(creatorVideo.dataset.biliCreatorVideoIndex));
                return;
            }
            const followAction = event.target.closest('[data-bili-follow-action]');
            if (followAction) {
                const items = this._cache['following_' + this._activeGroupId] || [];
                const user = items[parseInt(followAction.dataset.biliFollowIndex)];
                if (!user) return;
                if (followAction.dataset.biliFollowAction === 'profile') this._loadUserSpace(user.mid, user.uname, user);
                else this._playLatestForUser(user, followAction);
                return;
            }
            const courseSource = event.target.closest('[data-bili-course-source]');
            if (courseSource) {
                this._el.querySelector(`.bili-course-tab[data-csrc="${courseSource.dataset.biliCourseSource}"]`)?.click();
                return;
            }
            const overviewItem = event.target.closest('[data-bili-overview-index]');
            if (overviewItem) {
                const item = this._overviewItems[parseInt(overviewItem.dataset.biliOverviewIndex)];
                if (item) this._playItem(item);
                return;
            }
            const liveItem = event.target.closest('[data-bili-live-index]');
            if (liveItem) {
                const item = this._liveItems[parseInt(liveItem.dataset.biliLiveIndex)];
                if (item) this._playLiveRoom(item);
                return;
            }
            const currentLiveOpen = event.target.closest('[data-bili-current-live-open]');
            if (currentLiveOpen) {
                if (this._currentVideo?.type === 'live' && this._currentVideo.liveUrl) window.open(this._currentVideo.liveUrl, '_blank', 'noopener');
                return;
            }
            const liveOpen = event.target.closest('[data-bili-live-open]');
            if (liveOpen) {
                const item = this._liveItems[parseInt(liveOpen.dataset.biliLiveOpen)];
                if (item?.liveUrl) window.open(item.liveUrl, '_blank', 'noopener');
                return;
            }
            const fallbackRetry = event.target.closest('[data-bili-live-fallback-retry]');
            if (fallbackRetry) {
                if (this._currentVideo?.type === 'live') this._startLiveFlvFallback(this._currentVideo, ++this._livePlaybackSeq);
                return;
            }
            const dramaDestination = event.target.closest('[data-bili-drama-destination]');
            if (dramaDestination) {
                this._openDramaDestination(dramaDestination.dataset.biliDramaDestination);
                return;
            }
            const action = event.target.closest('[data-bili-empty-tab]');
            if (!action) return;
            const tab = action.dataset.biliEmptyTab;
            this._syncTabs(tab);
            this._loadTab(tab);
            this._el.querySelector(`.bili-pill[data-tab="${tab}"]`)?.focus({ preventScroll: true });
        });

        el.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        el.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.hide();
            if (e.key === 'Tab') this._trapFocus(e);
        });

        el.querySelector('#bili-act-like').addEventListener('click', () => this._onActionLike());
        el.querySelector('#bili-act-later').addEventListener('click', () => this._onActionAddLater());
        el.querySelector('#bili-act-rm-later').addEventListener('click', () => this._onActionRemoveLater());
        el.querySelector('#bili-act-rm-fav').addEventListener('click', () => this._onActionRemoveFav());
        el.querySelector('#bili-act-comments').addEventListener('click', () => this._toggleComments());
        el.querySelector('#bili-act-creator').addEventListener('click', () => this._openCurrentCreator());
        el.querySelector('#bili-act-copy').addEventListener('click', () => this._copyCurrentBvid());
        el.querySelector('#bili-act-open').addEventListener('click', () => this._openCurrentVideo());
        el.querySelector('#bili-player-recent').addEventListener('click', event => {
            const videoButton = event.target.closest('[data-bili-recent-index]');
            if (videoButton) {
                const item = this._playerRecentItems[parseInt(videoButton.dataset.biliRecentIndex)];
                if (item?.bvid && item.bvid !== this._currentVideo?.bvid) this._playItem({ ...item });
                return;
            }
            const actionButton = event.target.closest('[data-bili-recent-action]');
            if (actionButton?.dataset.biliRecentAction === 'refresh') this._loadPlayerRecent(this._currentVideo, true);
            if (actionButton?.dataset.biliRecentAction === 'creator') this._openCurrentCreator();
        });
        for (const [buttonId, sectionId] of [
            ['bili-recent-toggle', 'bili-player-recent'],
            ['bili-settings-toggle', 'bili-ctrl-bar'],
            ['bili-details-toggle', 'bili-player-info'],
        ]) {
            el.querySelector(`#${buttonId}`).addEventListener('click', () => this._togglePlayerDrawer(sectionId, buttonId));
        }
        el.querySelector('#bili-speed-cycle').addEventListener('click', () => this._cycleSpeed());
        el.querySelector('#bili-play-toggle').addEventListener('click', () => this._sendPlayerMsg({ type: 'bili-ext-toggle-play' }));
        const progressRange = el.querySelector('#bili-progress-range');
        progressRange.addEventListener('input', () => this._previewPlayerProgress(progressRange.value));
        progressRange.addEventListener('change', () => this._seekFromProgressControl(progressRange.value));
        el.querySelector('#bili-comments-close').addEventListener('click', () => this._hideComments());
        el.querySelector('#bili-comments-more-btn').addEventListener('click', () => this._loadMoreComments());
        el.querySelectorAll('.bili-comments-sort-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                el.querySelectorAll('.bili-comments-sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._commentSort = parseInt(btn.dataset.sort);
                this._commentPage = 1;
                this._loadComments();
            });
        });

        window.addEventListener('message', (e) => {
            const iframe = this._el?.querySelector('#bili-player-frame iframe');
            if (!iframe?.contentWindow || e.source !== iframe.contentWindow) return;
            if (!/^https:\/\/(?:www|player)\.bilibili\.com$/.test(e.origin)) return;
            if (typeof e.data === 'string' && e.data.startsWith('playerOperation-')) {
                this._onLiveActivityMessage(e.data);
                return;
            }
            if (!e.data || typeof e.data.type !== 'string') return;
            if (e.data.type === 'bili-ext-state') {
                this._onPlayerState(e.data);
            } else if (e.data.type === 'bili-ext-quality-info') {
                this._onQualityInfo(e.data);
            } else if (e.data.type === 'bili-ext-title-info') {
                this._onTitleInfo(e.data);
            } else if (e.data.type === 'bili-ext-seek-result') {
                this._onSeekResult(e.data);
            }
        });

        this._el.querySelectorAll('.bili-speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const speed = parseFloat(btn.dataset.speed);
                this._setSpeed(speed);
            });
        });
    }

    // ===================== Pending Seek (进度恢复) =====================

    _tryPendingSeek(state) {
        if (this._pendingSeek === null) return;
        if (!state.duration || state.duration <= 0) return;
        const MAX_RETRIES = 8;
        if (this._seekRetries >= MAX_RETRIES) {
            this._pendingSeek = null;
            return;
        }
        const target = this._pendingSeek;
        const current = state.currentTime || 0;
        if (Math.abs(current - target) < 3) {
            this._pendingSeek = null;
            return;
        }
        this._seekRetries++;
        const delay = this._seekRetries <= 2 ? 500 : 1500;
        setTimeout(() => {
            if (this._pendingSeek === null) return;
            this._sendPlayerMsg({ type: 'bili-ext-seek', time: target });
        }, delay);
    }

    _onSeekResult(data) {
        if (this._pendingSeek === null) return;
        if (data.success && Math.abs((data.currentTime || 0) - this._pendingSeek) < 3) {
            this._pendingSeek = null;
        }
    }

    // ===================== Player Control (v3.10.0 + v3.11.0) =====================

    _sendPlayerMsg(data) {
        const iframe = this._el.querySelector('#bili-player-frame iframe');
        if (!iframe?.contentWindow) return;
        try { iframe.contentWindow.postMessage(data, '*'); } catch (_) {}
    }

    _onPlayerState(state) {
        this._playerState = state;
        this._tryPendingSeek(state);
        this._updateTransportUI(state);

        const actualSpeed = Number(state.speed);
        const videoChanged = state.bvid && this._currentVideo?.bvid && state.bvid !== this._currentVideo.bvid;
        if (videoChanged) this._autoSpeedPending = true;
        if (this._autoSpeedPending) {
            if (Math.abs(actualSpeed - 2) < 0.01) this._autoSpeedPending = false;
            else if (Number(state.duration) > 0) this._applyAutoSpeed();
        } else if (Number.isFinite(actualSpeed) && actualSpeed > 0 && actualSpeed !== this._currentSpeed) {
            this._currentSpeed = actualSpeed;
            this._updateSpeedUI();
        }

        if (videoChanged) {
            this._syncPlayerIdentity(state.bvid);
        }

        if (state.bvid && state.page > 0 && state.currentTime > 5) {
            const memKey = `${state.bvid}:${state.page}`;
            if (memKey !== this._lastMemKey || Date.now() - (this._lastMemTs || 0) > 15000) {
                this._lastMemKey = memKey;
                this._lastMemTs = Date.now();
                this._saveWatchMemory(state.bvid, state.page, Math.floor(state.currentTime));
            }
        }
    }

    _updateTransportUI(state = this._playerState) {
        if (!state || !this._el) return;
        const duration = Number.isFinite(Number(state.duration)) && Number(state.duration) > 0 ? Number(state.duration) : 0;
        const currentTime = duration > 0 ? Math.max(0, Math.min(Number(state.currentTime) || 0, duration)) : 0;
        const progress = duration > 0 ? Math.round(currentTime / duration * 1000) : 0;
        const range = this._el.querySelector('#bili-progress-range');
        if (range && document.activeElement !== range) range.value = String(progress);
        if (range) {
            range.style.setProperty('--bili-progress', `${progress / 10}%`);
            range.setAttribute('aria-valuetext', `${this._fmtDuration(currentTime)} / ${this._fmtDuration(duration)}`);
        }
        const time = this._el.querySelector('#bili-progress-time');
        const total = this._el.querySelector('#bili-progress-duration');
        const percent = this._el.querySelector('#bili-progress-percent');
        if (time) time.textContent = this._fmtDuration(currentTime);
        if (total) total.textContent = duration > 0 ? this._fmtDuration(duration) : '检测中';
        if (percent) percent.textContent = duration > 0 ? `${Math.round(progress / 10)}%` : '—';

        const paused = !!state.paused;
        const playButton = this._el.querySelector('#bili-play-toggle');
        if (playButton) {
            playButton.innerHTML = `<i class="fas fa-${paused ? 'play' : 'pause'}"></i>`;
            playButton.setAttribute('aria-label', paused ? '继续播放' : '暂停视频');
            playButton.setAttribute('aria-pressed', String(!paused));
        }
        const stateEl = this._el.querySelector('#bili-np-state');
        if (stateEl) {
            stateEl.innerHTML = `<i class="fas fa-${paused ? 'pause' : 'play'}"></i> ${paused ? '已暂停' : '播放中'}`;
            stateEl.dataset.state = paused ? 'paused' : 'playing';
        }
    }

    _previewPlayerProgress(value) {
        const duration = Number(this._playerState?.duration) || 0;
        if (duration <= 0) return;
        const progress = Math.max(0, Math.min(1000, Number(value) || 0));
        const target = duration * progress / 1000;
        const time = this._el.querySelector('#bili-progress-time');
        const percent = this._el.querySelector('#bili-progress-percent');
        const range = this._el.querySelector('#bili-progress-range');
        if (time) time.textContent = this._fmtDuration(target);
        if (percent) percent.textContent = `${Math.round(progress / 10)}%`;
        range?.style.setProperty('--bili-progress', `${progress / 10}%`);
    }

    _seekFromProgressControl(value) {
        const duration = Number(this._playerState?.duration) || 0;
        if (duration <= 0) {
            this._showBiliToast('播放器尚未返回可调整的时长', 'warn');
            return;
        }
        const progress = Math.max(0, Math.min(1000, Number(value) || 0));
        const target = duration * progress / 1000;
        this._sendPlayerMsg({ type: 'bili-ext-seek', time: target });
        this._showBiliToast(`跳转到 ${this._fmtDuration(target)}`, 'info');
    }

    async _syncPlayerIdentity(bvid) {
        if (!bvid || this._playerIdentityLoading === bvid) return;
        const seq = ++this._playerIdentitySeq;
        this._playerIdentityLoading = bvid;
        try {
            const resp = await this._biliApi('/x/web-interface/view', { bvid });
            if (seq !== this._playerIdentitySeq || this._playerState?.bvid !== bvid || !resp?.data) return;
            const item = this._normalizeVideo(resp.data);
            item.progressSec = Math.floor(Number(this._playerState.currentTime) || 0);
            item.progress = item.durationSec > 0 ? Math.round(item.progressSec / item.durationSec * 100) : 0;
            this._currentVideo = item;
            this._renderPlayerMetadata(item);
            this._loadPlayerRecent(item);
            this._showBiliToast('已同步自动连播的视频信息', 'info');
        } catch (error) {
            console.warn('[Bilibili] 播放身份同步失败:', error.message);
        } finally {
            if (this._playerIdentityLoading === bvid) this._playerIdentityLoading = '';
        }
    }

    _setSpeed(speed) {
        this._autoSpeedPending = false;
        this._currentSpeed = speed;
        this._sendPlayerMsg({ type: 'bili-ext-set-speed', speed });
        this._updateSpeedUI();
        this._savePlayerPrefs();
    }

    _cycleSpeed() {
        const speeds = [1, 1.25, 1.5, 2, 3];
        const current = speeds.indexOf(this._currentSpeed);
        this._setSpeed(speeds[(current + 1) % speeds.length]);
    }

    _applyAutoSpeed() {
        this._currentSpeed = 2;
        this._sendPlayerMsg({ type: 'bili-ext-set-speed', speed: 2 });
        this._updateSpeedUI();
        this._savePlayerPrefs();
    }

    _updateSpeedUI() {
        this._el.querySelectorAll('.bili-speed-btn').forEach(btn => {
            const s = parseFloat(btn.dataset.speed);
            const active = s === this._currentSpeed;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        const label = `${this._currentSpeed % 1 ? this._currentSpeed : `${this._currentSpeed}.0`}x`;
        const status = this._el.querySelector('#bili-speed-status');
        if (status) status.textContent = label;
        const quick = this._el.querySelector('#bili-speed-cycle');
        const quickValue = this._el.querySelector('#bili-speed-quick-value');
        if (quickValue) quickValue.textContent = label;
        if (quick) {
            quick.title = `播放速度：${label}（点击切换）`;
            quick.setAttribute('aria-label', `播放速度：${label}，点击切换`);
        }
    }

    _setQuality(qn) {
        this._pendingQuality = qn;
        this._preferredQuality = qn;
        this._sendPlayerMsg({ type: 'bili-ext-set-quality', quality: qn });
        this._markQualityPending(qn);
        const label = this._safeQualityLabel(this._qualityDescriptions, qn);
        this._showBiliToast(`切换画质: ${label}`, 'info');
        this._savePlayerPrefs();

        this._qualityVerifyTimer && clearTimeout(this._qualityVerifyTimer);
        this._qualityVerifyTimer = setTimeout(() => {
            this._sendPlayerMsg({ type: 'bili-ext-get-quality' });
        }, 3000);

        this._qualityFailTimer && clearTimeout(this._qualityFailTimer);
        this._qualityFailTimer = setTimeout(() => {
            if (this._pendingQuality === qn && this._currentQuality !== qn) {
                this._pendingQuality = 0;
                this._updateQualityUI();
                const requestedLabel = this._safeQualityLabel(this._qualityDescriptions, qn);
                const fallbackLabel = this._currentQuality
                    ? this._safeQualityLabel(this._qualityDescriptions, this._currentQuality)
                    : '播放器自动画质';
                this._preferredQuality = this._currentQuality || 0;
                this._savePlayerPrefs();
                this._setQualityStatus(`未切换 · 保留 ${fallbackLabel}`, 'fallback');
                this._showBiliToast(`未能切换到 ${requestedLabel}，已保留 ${fallbackLabel}`, 'warn');
            }
        }, 8000);
    }

    _markQualityPending(qn) {
        this._el.querySelectorAll('.bili-quality-btn').forEach(btn => {
            const q = parseInt(btn.dataset.quality);
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
            if (q === qn) {
                btn.classList.add('pending');
            } else {
                btn.classList.remove('pending');
            }
        });
        const label = this._safeQualityLabel(this._qualityDescriptions, qn);
        this._setQualityStatus(`正在切换到 ${label}`, 'pending');
    }

    _setQualityStatus(text, tone = '') {
        const status = this._el?.querySelector('#bili-quality-status');
        if (!status) return;
        status.textContent = text;
        status.dataset.tone = tone;
    }

    _showBiliToast(msg, type = 'info') {
        let toast = this._el?.querySelector('.bili-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'bili-toast';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            toast.setAttribute('aria-hidden', 'true');
            this._el?.querySelector('.bili-player-area')?.appendChild(toast);
        }
        clearTimeout(this._biliToastClearTimer);
        toast.textContent = msg;
        toast.setAttribute('aria-hidden', 'false');
        toast.className = `bili-toast bili-toast-${type} bili-toast-show`;
        clearTimeout(this._biliToastTimer);
        this._biliToastTimer = setTimeout(() => {
            toast.classList.remove('bili-toast-show');
            toast.setAttribute('aria-hidden', 'true');
            this._biliToastClearTimer = setTimeout(() => {
                if (!toast.classList.contains('bili-toast-show')) toast.textContent = '';
            }, 250);
        }, 3000);
    }

    _updateQualityUI() {
        this._el.querySelectorAll('.bili-quality-btn').forEach(btn => {
            const q = parseInt(btn.dataset.quality);
            const active = q === this._currentQuality;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
            btn.classList.remove('pending');
        });
    }

    _safeQualityLabel(descriptions, qn) {
        const raw = descriptions?.[qn];
        if (typeof raw === 'string') return raw;
        if (raw && typeof raw === 'object') return raw.desc || raw.text || raw.name || String(qn);
        return String(qn || '未知');
    }

    _onQualityInfo(data) {
        const available = (data.available || []).filter(q => typeof q === 'number' && q > 0);
        const rawDescs = data.descriptions || {};
        const descriptions = {};
        for (const [k, v] of Object.entries(rawDescs)) {
            descriptions[k] = typeof v === 'string' ? v : (v?.desc || v?.text || v?.name || String(k));
        }
        if (!available.length) return;
        this._qualityList = available;
        this._qualityDescriptions = descriptions;
        const oldQuality = this._currentQuality;
        const current = typeof data.current === 'number' ? data.current : parseInt(data.current) || 0;
        if (current > 0) this._currentQuality = current;

        if (this._pendingQuality && current === this._pendingQuality) {
            this._pendingQuality = 0;
            clearTimeout(this._qualityFailTimer);
        }

        if (oldQuality && current && oldQuality !== current && !this._pendingQuality) {
            const label = this._safeQualityLabel(descriptions, current);
            this._showBiliToast(`当前画质: ${label}`, 'info');
        }

        if (this._currentQuality > 0 && !this._pendingQuality) {
            const currentLabel = this._safeQualityLabel(descriptions, this._currentQuality);
            this._setQualityStatus(`当前 ${currentLabel}`);
        }

        const container = this._el.querySelector('#bili-quality-btns');
        if (!container) return;
        container.innerHTML = available.map(qn => {
            const label = descriptions[qn] || String(qn);
            const isActive = qn === this._currentQuality ? ' active' : '';
            return `<button type="button" class="bili-quality-btn${isActive}" data-quality="${qn}" aria-pressed="${qn === this._currentQuality}">${this._esc(label)}</button>`;
        }).join('');

        container.querySelectorAll('.bili-quality-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const qn = parseInt(btn.dataset.quality);
                this._setQuality(qn);
            });
        });

        if (!this._qualityAutoApplied && this._preferredQuality > 0 && !this._pendingQuality) {
            this._qualityAutoApplied = true;
            if (available.includes(this._preferredQuality) && current !== this._preferredQuality) {
                setTimeout(() => this._setQuality(this._preferredQuality), 500);
            } else if (!available.includes(this._preferredQuality)) {
                const best = available.find(q => q <= this._preferredQuality) || available[available.length - 1];
                if (best && current !== best) {
                    setTimeout(() => this._setQuality(best), 500);
                }
            }
        }
    }

    _onTitleInfo(data) {
        const bar = this._el.querySelector('#bili-now-playing');
        const titleEl = this._el.querySelector('#bili-np-title');
        const episodeEl = this._el.querySelector('#bili-np-episode');
        if (!bar || !titleEl || !episodeEl) return;

        if (data.bvid && this._currentVideo?.bvid && data.bvid !== this._currentVideo.bvid) {
            this._syncPlayerIdentity(data.bvid);
        }

        const hasEpisode = !!(data.episode || (data.partIndex > 0 && data.totalParts > 1));
        if (!data.title && !hasEpisode) {
            bar.classList.add('hidden');
            return;
        }

        const mainTitle = this._currentVideo?.title || '';
        const displayTitle = data.title || mainTitle;
        if (displayTitle) {
            titleEl.textContent = displayTitle;
            titleEl.style.display = '';
            const detailTitle = this._el.querySelector('#bili-pi-title');
            if (detailTitle) detailTitle.textContent = displayTitle;
        } else {
            titleEl.style.display = 'none';
        }

        if (hasEpisode) {
            let epText = '';
            if (data.partIndex > 0 && data.totalParts > 1) {
                epText = `P${data.partIndex}/${data.totalParts}`;
            } else if (data.partIndex > 0) {
                epText = `P${data.partIndex}`;
            }
            if (data.episode) {
                epText = epText ? `${epText} ${data.episode}` : data.episode;
            }
            episodeEl.textContent = epText;
            episodeEl.style.display = '';
        } else {
            episodeEl.style.display = 'none';
        }

        bar.classList.remove('hidden');
    }

    async _copyCurrentBvid() {
        const bvid = this._currentVideo?.bvid;
        if (!bvid) return;
        try {
            await navigator.clipboard.writeText(bvid);
            this._showBiliToast(`已复制 ${bvid}`, 'info');
        } catch (error) {
            this._showBiliToast('复制失败，请在视频原页复制', 'warn');
        }
    }

    _openCurrentVideo() {
        const bvid = this._currentVideo?.bvid;
        if (!bvid) return;
        window.open(`https://www.bilibili.com/video/${encodeURIComponent(bvid)}`, '_blank', 'noopener');
    }

    async _onActionLike() {
        const v = this._currentVideo;
        if (!v?.aid || !this._loggedIn) return;
        const btn = this._el.querySelector('#bili-act-like');
        btn.classList.toggle('active');
        btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
        try {
            await this._likeVideo(v.aid, btn.classList.contains('active') ? 1 : 2);
            this._showBiliToast(btn.classList.contains('active') ? '已点赞' : '已取消点赞', 'info');
        } catch (e) {
            console.warn('[Bilibili] 点赞失败:', e.message);
            btn.classList.toggle('active');
            btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
            this._showBiliToast(`点赞操作失败：${e.message}`, 'warn');
        }
    }

    async _onActionAddLater() {
        const v = this._currentVideo;
        if (!v?.aid || !this._loggedIn) return;
        const btn = this._el.querySelector('#bili-act-later');
        try {
            await this._addWatchlater(v.aid);
            btn.innerHTML = '<i class="fas fa-check"></i>已添加';
            this._showBiliToast('已加入稍后看', 'info');
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-clock"></i>稍后看'; }, 1500);
        } catch (e) {
            console.warn('[Bilibili] 添加稍后看失败:', e.message);
            this._showBiliToast(`加入稍后看失败：${e.message}`, 'warn');
        }
    }

    async _onActionRemoveLater() {
        const v = this._currentVideo;
        if (!v?.aid || !this._loggedIn) return;
        const btn = this._el.querySelector('#bili-act-rm-later');
        try {
            await this._cancelWatchlater(v.aid);
            btn.innerHTML = '<i class="fas fa-check"></i>已移除';
            this._removeListItemByAid(v.aid);
            this._showBiliToast('已从稍后看移除', 'info');
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-times-circle"></i>移除稍后看'; }, 1500);
        } catch (e) {
            console.warn('[Bilibili] 移除稍后看失败:', e.message);
            this._showBiliToast(`移除失败：${e.message}`, 'warn');
        }
    }

    async _onActionRemoveFav() {
        const v = this._currentVideo;
        if (!v?.aid || !this._loggedIn) return;
        const btn = this._el.querySelector('#bili-act-rm-fav');
        try {
            await this._cancelFavorite(v.aid);
            btn.innerHTML = '<i class="fas fa-check"></i>已取消';
            this._removeListItemByAid(v.aid);
            this._showBiliToast('已从当前收藏夹移除', 'info');
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-heart-broken"></i>取消收藏'; }, 1500);
        } catch (e) {
            console.warn('[Bilibili] 取消收藏失败:', e.message);
            this._showBiliToast(`取消收藏失败：${e.message}`, 'warn');
        }
    }

    // ===================== Comments (评论) =====================

    _toggleComments() {
        const panel = this._el.querySelector('#bili-comments');
        if (!panel || !this._currentVideo?.aid) return;
        if (this._commentsOpen) {
            this._hideComments();
        } else {
            this._showComments();
        }
    }

    _showComments() {
        const panel = this._el.querySelector('#bili-comments');
        if (!panel) return;
        this._commentsOpen = true;
        panel.classList.remove('hidden');
        this._el.querySelector('#bili-act-comments')?.classList.add('active');
        this._el.querySelector('#bili-act-comments')?.setAttribute('aria-expanded', 'true');
        this._commentPage = 1;
        this._loadComments();
    }

    _hideComments() {
        const panel = this._el.querySelector('#bili-comments');
        if (!panel) return;
        this._commentsOpen = false;
        panel.classList.add('hidden');
        this._el.querySelector('#bili-act-comments')?.classList.remove('active');
        this._el.querySelector('#bili-act-comments')?.setAttribute('aria-expanded', 'false');
    }

    async _loadComments() {
        const v = this._currentVideo;
        if (!v?.aid) return;
        if (this._commentLoading) return;
        this._commentLoading = true;

        const listEl = this._el.querySelector('#bili-comments-list');
        const moreEl = this._el.querySelector('#bili-comments-more');
        if (this._commentPage === 1) {
            listEl.innerHTML = '<div class="bili-comments-loading"><i class="fas fa-spinner fa-spin"></i> 加载评论中...</div>';
        }

        try {
            const resp = await this._biliApi('/x/v2/reply', {
                oid: v.aid,
                type: 1,
                pn: this._commentPage,
                ps: 20,
                sort: this._commentSort,
            });

            const data = resp?.data;
            const replies = data?.replies || [];
            const totalCount = data?.page?.count || 0;

            this._el.querySelector('#bili-comments-count').textContent = totalCount > 0 ? `(${this._fmtNum(totalCount)})` : '';

            if (this._commentPage === 1) {
                const topReplies = data?.top_replies || [];
                const topRpids = new Set(topReplies.map(r => r.rpid));
                const normalReplies = replies.filter(r => !topRpids.has(r.rpid));
                const topHtml = topReplies.map(r => this._renderComment(r, true)).join('');
                const normalHtml = normalReplies.map(r => this._renderComment(r, false)).join('');
                listEl.innerHTML = (topReplies.length || normalReplies.length)
                    ? topHtml + normalHtml
                    : '<div class="bili-comments-empty"><i class="fas fa-comment-slash"></i> 暂无评论</div>';
            } else {
                listEl.insertAdjacentHTML('beforeend', replies.map(r => this._renderComment(r, false)).join(''));
            }

            const hasMore = replies.length >= 20;
            moreEl.classList.toggle('hidden', !hasMore);

            this._bindCommentEvents(listEl);
        } catch (e) {
            if (this._commentPage === 1) {
                listEl.innerHTML = `<div class="bili-comments-empty"><i class="fas fa-exclamation-circle"></i> 加载失败: ${this._esc(e.message)}</div>`;
            }
            console.warn('[Bilibili] 评论加载失败:', e.message);
        } finally {
            this._commentLoading = false;
        }
    }

    _loadMoreComments() {
        this._commentPage++;
        this._loadComments();
    }

    _renderComment(reply, isTop) {
        const member = reply.member || {};
        const avatar = this._httpsCover(member.avatar || '');
        const uname = member.uname || '匿名';
        const content = reply.content?.message || '';
        const likes = reply.like || 0;
        const rcount = reply.rcount || 0;
        const ctime = reply.ctime || 0;
        const timeStr = this._fmtCommentTime(ctime);
        const levelInfo = member.level_info || {};
        const level = levelInfo.current_level || 0;
        const isUploader = reply.member?.mid && this._currentVideo?.mid && String(reply.member.mid) === String(this._currentVideo.mid);
        const topBadge = isTop ? '<span class="bili-comment-badge bili-comment-top">置顶</span>' : '';
        const upBadge = isUploader ? '<span class="bili-comment-badge bili-comment-up">UP</span>' : '';

        const subReplies = (reply.replies || []).slice(0, 3);
        const subHtml = subReplies.length ? `
            <div class="bili-comment-sub-list">
                ${subReplies.map(sub => {
                    const subName = sub.member?.uname || '匿名';
                    const subContent = sub.content?.message || '';
                    const subTime = this._fmtCommentTime(sub.ctime || 0);
                    const subLikes = sub.like || 0;
                    return `<div class="bili-comment-sub">
                        <span class="bili-comment-sub-name">${this._esc(subName)}</span>
                        <span class="bili-comment-sub-content">${this._esc(subContent)}</span>
                        <div class="bili-comment-sub-meta">
                            <span>${subTime}</span>
                            ${subLikes > 0 ? `<span><i class="fas fa-thumbs-up"></i> ${subLikes}</span>` : ''}
                        </div>
                    </div>`;
                }).join('')}
                ${rcount > 3 ? `<button class="bili-comment-sub-more" data-rpid="${reply.rpid}" data-oid="${this._currentVideo?.aid || 0}">查看全部 ${rcount} 条回复 <i class="fas fa-chevron-right"></i></button>` : ''}
            </div>` : '';

        return `<div class="bili-comment" data-rpid="${reply.rpid}">
            <img class="bili-comment-avatar" src="${this._esc(avatar)}" alt="" loading="lazy">
            <div class="bili-comment-body">
                <div class="bili-comment-header">
                    <span class="bili-comment-name">${this._esc(uname)}</span>
                    ${upBadge}${topBadge}
                    ${level > 0 ? `<span class="bili-comment-level lv${Math.min(level, 6)}">Lv${level}</span>` : ''}
                </div>
                <div class="bili-comment-content">${this._esc(content)}</div>
                <div class="bili-comment-meta">
                    <span class="bili-comment-time">${timeStr}</span>
                    <span class="bili-comment-like"><i class="fas fa-thumbs-up"></i> ${likes > 0 ? this._fmtNum(likes) : '点赞'}</span>
                    ${rcount > 0 ? `<span class="bili-comment-reply-count"><i class="fas fa-comment"></i> ${rcount}</span>` : ''}
                </div>
                ${subHtml}
            </div>
        </div>`;
    }

    _bindCommentEvents(listEl) {
        listEl.querySelectorAll('.bili-comment-sub-more').forEach(btn => {
            if (btn._bound) return;
            btn._bound = true;
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const rpid = btn.dataset.rpid;
                const oid = btn.dataset.oid;
                if (!rpid || !oid) return;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
                try {
                    const resp = await this._biliApi('/x/v2/reply/reply', {
                        oid: parseInt(oid),
                        type: 1,
                        root: parseInt(rpid),
                        pn: 1,
                        ps: 20,
                    });
                    const replies = resp?.data?.replies || [];
                    if (replies.length) {
                        const subList = btn.closest('.bili-comment-sub-list');
                        const prevSubs = subList.querySelectorAll('.bili-comment-sub');
                        prevSubs.forEach(el => el.remove());
                        const html = replies.map(sub => {
                            const subName = sub.member?.uname || '匿名';
                            const subContent = sub.content?.message || '';
                            const subTime = this._fmtCommentTime(sub.ctime || 0);
                            const subLikes = sub.like || 0;
                            return `<div class="bili-comment-sub">
                                <span class="bili-comment-sub-name">${this._esc(subName)}</span>
                                <span class="bili-comment-sub-content">${this._esc(subContent)}</span>
                                <div class="bili-comment-sub-meta">
                                    <span>${subTime}</span>
                                    ${subLikes > 0 ? `<span><i class="fas fa-thumbs-up"></i> ${subLikes}</span>` : ''}
                                </div>
                            </div>`;
                        }).join('');
                        subList.insertAdjacentHTML('afterbegin', html);
                        btn.remove();
                    }
                } catch (err) {
                    btn.innerHTML = '加载失败，点击重试';
                    btn._bound = false;
                    console.warn('[Bilibili] 子评论加载失败:', err.message);
                }
            });
        });
    }

    _fmtCommentTime(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return '刚刚';
        if (diffMin < 60) return `${diffMin}分钟前`;
        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return `${diffHours}小时前`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}天前`;
        if (diffDays < 365) return `${d.getMonth() + 1}-${d.getDate()}`;
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    _removeListItemByAid(aid) {
        const listEl = this._el.querySelector('#bili-list');
        if (!listEl) return;
        listEl.querySelectorAll('.bili-item').forEach(el => {
            const idx = parseInt(el.dataset.idx);
            const cache = this._cache[this._currentTab];
            if (cache && cache[idx]?.aid === aid) {
                el.style.transition = 'opacity 0.3s, max-height 0.3s';
                el.style.opacity = '0';
                el.style.maxHeight = '0';
                el.style.overflow = 'hidden';
                setTimeout(() => el.remove(), 350);
            }
        });
    }

    _syncTabs(tab) {
        this._el.querySelectorAll('.bili-pill').forEach(p => {
            const active = p.dataset.tab === tab;
            p.classList.toggle('active', active);
            p.setAttribute('aria-pressed', String(active));
        });
        this._setSidebarContext(tab);
    }

    _tabMeta(tab) {
        const meta = {
            recommend: { eyebrow: 'FOR YOU', title: '为你推荐', desc: '根据账号兴趣持续更新', asset: 'assets/bilibili/capability-recommend-v1.png' },
            popular: { eyebrow: 'TRENDING', title: '全站热门', desc: '近期高热内容', asset: 'assets/bilibili/capability-recommend-v1.png' },
            live: { eyebrow: 'LIVE NOW', title: '正在直播', desc: '关注开播优先，其次全站热门', asset: 'assets/bilibili/capability-recommend-v1.png' },
            ranking: { eyebrow: 'RANKING', title: '实时排行', desc: '全站综合榜单', asset: 'assets/bilibili/capability-recommend-v1.png' },
            course: { eyebrow: 'LEARNING', title: '课程中心', desc: '已购课程与学习进度', asset: 'assets/bilibili/capability-course-v1.png' },
            favorite: { eyebrow: 'LIBRARY', title: '我的收藏', desc: '按收藏夹整理内容', asset: 'assets/bilibili/capability-library-v1.png' },
            watchlater: { eyebrow: 'QUEUE', title: '稍后看', desc: '独立待看队列', asset: 'assets/bilibili/capability-library-v1.png' },
            history: { eyebrow: 'CONTINUE', title: '观看历史', desc: '从上次中断处继续', asset: 'assets/bilibili/capability-history-v1.png' },
            following: { eyebrow: 'CREATORS', title: '关注工作台', desc: '分组、搜索与最新内容', asset: 'assets/bilibili/capability-recommend-v1.png' },
            _search: { eyebrow: 'SEARCH', title: '搜索结果', desc: '视频、课程与 UP 主', asset: 'assets/bilibili/capability-recommend-v1.png' },
        };
        return meta[tab] || meta.recommend;
    }

    _setSidebarContext(tab, count = null) {
        if (!this._el) return;
        const meta = this._tabMeta(tab);
        const cached = this._cache[tab];
        const resolvedCount = count ?? (Array.isArray(cached) ? cached.length : null);
        const eyebrow = this._el.querySelector('#bili-sidebar-eyebrow');
        const title = this._el.querySelector('#bili-sidebar-title');
        const desc = this._el.querySelector('#bili-sidebar-desc');
        const countEl = this._el.querySelector('#bili-sidebar-count');
        if (eyebrow) eyebrow.textContent = meta.eyebrow;
        if (title) title.textContent = meta.title;
        if (desc) desc.textContent = meta.desc;
        if (countEl) countEl.textContent = resolvedCount == null ? '—' : String(resolvedCount);
    }

    _toggleSidebar() {
        this._sidebarOpen = !this._sidebarOpen;
        this._el.querySelector('#bili-sidebar').classList.toggle('visible', this._sidebarOpen);
        const toggle = this._el.querySelector('#bili-sidebar-toggle');
        toggle.classList.toggle('open', this._sidebarOpen);
        toggle.setAttribute('aria-pressed', String(this._sidebarOpen));
    }

    // ===================== Render =====================

    _showListLoading() {
        this._setSidebarContext(this._currentTab);
        this._el.querySelector('#bili-list').innerHTML =
            '<div class="bili-list-msg"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    }

    _showListError(tab, msg) {
        const needLogin = ['history', 'watchlater', 'favorite', 'course', 'following'].includes(tab) && !this._loggedIn;
        this._setProductPage(needLogin ? 'login-error' : this._pageForTab(tab));
        if (needLogin) this._renderLoginError(tab);
        this._el.querySelector('#bili-list').innerHTML = needLogin
            ? `<div class="bili-list-msg"><i class="fas fa-user-lock"></i> 请先在浏览器中<br>登录 bilibili.com<br><small>扩展自动共享浏览器登录状态</small></div>`
            : `<div class="bili-list-msg"><i class="fas fa-exclamation-circle"></i> ${this._esc(msg)}<br><small>请检查网络或登录状态，点击右上角刷新重试</small></div>`;
    }

    _renderList(tab, items) {
        if (tab === 'recommend') {
            this._renderRecommendList(items);
            return;
        }
        if (tab === '_search') {
            this._renderSearchList(items);
            return;
        }
        if (tab === 'live') {
            this._renderLiveList(items);
            return;
        }
        const listEl = this._el.querySelector('#bili-list');
        this._setSidebarContext(tab, items.length);
        if (!items.length) {
            const needLogin = ['history', 'watchlater', 'favorite'].includes(tab) && !this._loggedIn;
            this._setProductPage(needLogin ? 'login-error' : this._pageForTab(tab));
            if (needLogin) this._renderLoginError(tab);
            listEl.innerHTML = needLogin
                ? '<div class="bili-list-msg"><i class="fas fa-user-lock"></i> 请先在浏览器中<br>登录 bilibili.com<br><small>扩展自动共享浏览器登录状态</small></div>'
                : '<div class="bili-list-msg"><i class="fas fa-inbox"></i> 暂无内容</div>';
            return;
        }
        const showRemoveBtn = (tab === 'watchlater' || tab === 'favorite');
        listEl.innerHTML = items.map((v, i) => {
            if (v.type === 'course') return this._renderCourseItem(v, i);
            return this._renderVideoItem(v, i, tab, showRemoveBtn);
        }).join('');
        this._bindListItemEvents(listEl, items);
        this._bindImageFallbacks(listEl, tab);
        this._renderBrowseOverview(tab, items);

        if (showRemoveBtn) {
            listEl.querySelectorAll('.bili-item-rm-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const itemEl = btn.closest('.bili-item');
                    const idx = parseInt(itemEl?.dataset.idx);
                    const item = items[idx];
                    if (!item || !item.aid) return;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    btn.disabled = true;
                    try {
                        if (tab === 'watchlater') await this._cancelWatchlater(item.aid);
                        else if (tab === 'favorite') await this._cancelFavorite(item.aid);
                        itemEl.style.transition = 'opacity 0.3s, max-height 0.3s';
                        itemEl.style.opacity = '0';
                        itemEl.style.maxHeight = '0';
                        itemEl.style.overflow = 'hidden';
                        setTimeout(() => itemEl.remove(), 350);
                    } catch (err) {
                        btn.innerHTML = '<i class="fas fa-times"></i>';
                        btn.disabled = false;
                        console.warn('[Bilibili] 移除失败:', err.message);
                    }
                });
            });
        }
    }

    _renderLiveList(items) {
        const listEl = this._el.querySelector('#bili-list');
        const followingCount = items.filter(item => item.source === 'following').length;
        const dramaLiveCount = items.filter(item => item.isDrama).length;
        const visibleItems = this._liveFilter === 'all'
            ? items
            : this._liveFilter === 'drama'
                ? items.filter(item => item.isDrama)
                : items.filter(item => item.source === this._liveFilter);
        this._setSidebarContext('live', visibleItems.length);
        const filters = [
            ['all', '全部', items.length],
            ['following', '关注', followingCount],
            ['drama', '影视', dramaLiveCount],
            ['popular', '热门', items.filter(item => item.source === 'popular').length],
        ];
        const emptyText = this._liveFilter === 'following'
            ? (this._loggedIn ? '关注的主播暂时都未开播' : '登录 B 站后可查看关注开播')
            : this._liveFilter === 'drama'
                ? '认证放映厅暂时未开播'
                : '暂时没有可展示的直播';
        const summary = this._liveFilter === 'drama'
            ? (dramaLiveCount ? `${dramaLiveCount} 个电视、电影或影评直播` : '当前暂无影视类直播')
            : (followingCount ? `${followingCount} 位关注主播正在直播` : '热门直播持续更新');
        const dramaGuide = this._liveFilter === 'drama' ? this._renderDramaGuide() : '';
        listEl.innerHTML = `<section class="bili-live-toolbar" aria-label="直播筛选">
            <div class="bili-live-summary"><span><i class="fas fa-circle"></i> LIVE</span><small>${summary}</small></div>
            <div class="bili-live-filters" role="toolbar" aria-label="筛选直播来源">
                ${filters.map(([value, label, count]) => `<button type="button" data-bili-live-filter="${value}" class="${this._liveFilter === value ? 'active' : ''}" aria-pressed="${this._liveFilter === value}">${label}<b>${count}</b></button>`).join('')}
            </div>
        </section>
        ${dramaGuide}
        <div class="bili-live-list">${visibleItems.length
            ? visibleItems.map(item => this._renderLiveItem(item, items.indexOf(item))).join('')
            : `<div class="bili-list-msg"><i class="fas fa-${this._liveFilter === 'drama' ? 'film' : 'broadcast-tower'}"></i>${emptyText}<small>${this._liveFilter === 'drama' ? '刷新后会重新搜索放映厅与影评直播' : '可以切换“热门”继续逛'}</small></div>`}
        </div>`;
        listEl.querySelectorAll('[data-bili-live-filter]').forEach(button => {
            button.addEventListener('click', () => {
                this._liveFilter = button.dataset.biliLiveFilter;
                this._renderLiveList(items);
            });
        });
        this._bindDramaDestinationEvents(listEl);
        this._bindLiveItemEvents(listEl);
        this._bindImageFallbacks(listEl, 'live');
        if (!this._currentVideo) {
            if (this._liveFilter === 'drama') this._renderDramaOverview(items);
            else this._renderLiveOverview(visibleItems.length ? visibleItems : items);
        }
    }

    _renderDramaGuide() {
        return `<section class="bili-drama-guide" aria-label="影视直播入口">
            <div><span>LIVE SCREENING</span><strong>电视 · 电影 · 影评直播</strong><small>只展示当前正在直播的放映厅、电影解说和影评内容</small></div>
            <div>
                <button type="button" data-bili-drama-destination="cinema"><i class="fas fa-film"></i>放映直播</button>
                <button type="button" data-bili-drama-destination="review"><i class="fas fa-comment-dots"></i>影评直播</button>
            </div>
        </section>`;
    }

    _openDramaDestination(destination) {
        if (destination === 'cinema') {
            const liveRoom = this._liveItems.find(item => item.isDrama && /放映厅/.test(item.officialLabel || ''));
            if (liveRoom) this._playLiveRoom(liveRoom);
            else this._showBiliToast('当前没有放映厅直播', 'info');
            return;
        }
        if (destination === 'review') {
            const reviewRoom = this._liveItems.find(item => item.isDrama && /影评/.test(item.officialLabel || ''));
            if (reviewRoom) this._playLiveRoom(reviewRoom);
            else this._showBiliToast('当前没有匹配的影评直播', 'info');
        }
    }

    _bindDramaDestinationEvents(root) {
        root?.querySelectorAll('[data-bili-drama-destination]').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                this._openDramaDestination(button.dataset.biliDramaDestination);
            });
        });
    }

    _renderLiveBackendRecovery() {
        const listEl = this._el.querySelector('#bili-list');
        this._setSidebarContext('live', 0);
        listEl.innerHTML = `<section class="bili-live-recovery" role="status" aria-live="polite">
            <span class="bili-live-recovery-icon"><i class="fas fa-plug"></i></span>
            <small>BACKGROUND UPDATE</small>
            <strong>直播后台需要同步一次</strong>
            <p>页面已是新版本，但 Chrome 仍在运行旧的扩展后台，所以直播接口被旧白名单拦截。</p>
            <button type="button" id="bili-live-apply-update"><i class="fas fa-sync-alt"></i>应用更新并重新打开</button>
            <em>只重新加载本扩展，不会清除收藏、历史或观看进度。</em>
        </section>`;
        listEl.querySelector('#bili-live-apply-update')?.addEventListener('click', buttonEvent => {
            const button = buttonEvent.currentTarget;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>正在同步后台…';
            try {
                chrome.storage.local.set({ biliLastTab: 'live' }, () => chrome.runtime.reload());
            } catch (_) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-redo"></i>重新尝试';
            }
        });
    }

    _renderLiveItem(item, index) {
        const fallback = this._assetUrl(this._tabMeta('live').asset);
        const active = this._currentVideo?.type === 'live' && this._currentVideo.roomId === item.roomId;
        return `<article class="bili-live-card${active ? ' playing' : ''}" data-bili-live-card="${index}">
            <button type="button" class="bili-live-card-main" data-bili-live-index="${index}" aria-label="观看 ${this._esc(item.author)} 的直播：${this._esc(item.title)}">
                <span class="bili-live-thumb"><img src="${this._esc(item.cover || fallback)}" data-bili-fallback="${this._esc(fallback)}" alt="" loading="lazy"><b><i></i>直播中</b><small>${this._esc(item.onlineText)}</small></span>
                <span class="bili-live-copy"><strong>${this._esc(item.title)}</strong><span>${this._esc(item.author)}</span><small><i class="fas fa-tag"></i>${this._esc(item.area)}${item.isDrama ? `<em>${this._esc(item.officialLabel || '认证放映厅')}</em>` : ''}${item.source === 'following' ? '<em>已关注</em>' : ''}</small></span>
            </button>
            ${item.isDrama ? '' : `<button type="button" class="bili-live-open" data-bili-live-open="${index}" title="在 B 站打开" aria-label="在 B 站打开 ${this._esc(item.title)}"><i class="fas fa-external-link-alt"></i></button>`}
        </article>`;
    }

    _bindLiveItemEvents(root) {
        root.querySelectorAll('[data-bili-live-index]').forEach(button => {
            button.addEventListener('click', () => {
                const item = this._liveItems[parseInt(button.dataset.biliLiveIndex)];
                if (!item) return;
                this._playLiveRoom(item);
                root.querySelectorAll('.bili-live-card').forEach(card => card.classList.remove('playing'));
                button.closest('.bili-live-card')?.classList.add('playing');
            });
        });
        root.querySelectorAll('[data-bili-live-open]').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                const item = this._liveItems[parseInt(button.dataset.biliLiveOpen)];
                if (item?.liveUrl) window.open(item.liveUrl, '_blank', 'noopener');
            });
        });
    }

    _renderLiveOverview(items) {
        const frame = this._el.querySelector('#bili-player-frame');
        if (!frame || !items.length || this._currentVideo) return;
        const hero = items[0];
        const heroIndex = this._liveItems.indexOf(hero);
        const followingCount = items.filter(item => item.source === 'following').length;
        const picks = items.slice(1, 4).map(item => `<button type="button" class="bili-live-overview-pick" data-bili-live-index="${this._liveItems.indexOf(item)}">
            <img src="${this._esc(item.cover || '')}" alt="" loading="lazy"><span><b><i></i>LIVE</b><strong>${this._esc(item.title)}</strong><small>${this._esc(item.author)} · ${this._esc(item.onlineText)}</small></span>
        </button>`).join('');
        frame.innerHTML = `<div class="bili-live-overview">
            <section class="bili-live-hero">
                <img src="${this._esc(hero.cover || '')}" alt=""><div class="bili-live-hero-shade"></div>
                <div class="bili-live-hero-copy"><span><i></i> LIVE NOW · ${this._esc(hero.area)}</span><h2>${this._esc(hero.title)}</h2><p>${this._esc(hero.author)} · ${this._esc(hero.onlineText)}</p>
                    <div><button type="button" class="primary" data-bili-live-index="${heroIndex}"><i class="fas fa-play"></i>进入直播间</button><button type="button" data-bili-live-open="${heroIndex}"><i class="fas fa-external-link-alt"></i>原页打开</button></div>
                </div>
            </section>
            <section class="bili-live-overview-head"><div><span>QUICK PICKS</span><strong>${followingCount ? `${followingCount} 位关注主播已开播` : '现在大家都在看'}</strong></div><small>点击即可在工作台内观看</small></section>
            <div class="bili-live-overview-grid">${picks}</div>
        </div>`;
        this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._el.querySelector('#bili-player-info')?.classList.add('hidden');
    }

    _renderDramaOverview(items) {
        const frame = this._el.querySelector('#bili-player-frame');
        if (!frame || this._currentVideo) return;
        const dramaRooms = items.filter(item => item.isDrama);
        const hero = dramaRooms[0] || null;
        const heroIndex = hero ? this._liveItems.indexOf(hero) : -1;
        const fallback = this._assetUrl(this._tabMeta('live').asset);
        frame.innerHTML = `<div class="bili-drama-overview">
            <section class="bili-live-hero bili-drama-hero">
                <img src="${this._esc(hero?.cover || fallback)}" alt=""><div class="bili-live-hero-shade"></div>
                <div class="bili-live-hero-copy">
                    <span><i></i> OFFICIAL SCREENING</span>
                    <h2>${this._esc(hero?.title || '当前暂无影视类直播')}</h2>
                    <p>${hero ? `${this._esc(hero.author)} · ${this._esc(hero.onlineText)}` : '刷新后会重新搜索放映厅、电影解说和影评直播'}</p>
                    <div>
                        ${hero ? `<button type="button" class="primary" data-bili-live-index="${heroIndex}"><i class="fas fa-play"></i>进入直播间</button>` : ''}
                        <button type="button" data-bili-drama-destination="cinema"><i class="fas fa-film"></i>放映直播</button>
                        <button type="button" data-bili-drama-destination="review"><i class="fas fa-comment-dots"></i>影评直播</button>
                    </div>
                </div>
            </section>
            <section class="bili-drama-trust">
                <div><i class="fas fa-broadcast-tower"></i><span><strong>纯直播</strong><small>不混入电视剧点播、录播或普通视频</small></span></div>
                <div><i class="fas fa-comments"></i><span><strong>影评可看</strong><small>收录影评、电影解说和观影 Reaction 直播</small></span></div>
                <div><i class="fas fa-filter"></i><span><strong>去除蹭词</strong><small>排除游戏分区和不相关的“电视台”标题</small></span></div>
            </section>
        </div>`;
        this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._el.querySelector('#bili-player-info')?.classList.add('hidden');
    }

    _searchFavoriteRate(item) {
        return item?.viewsCount > 0 ? item.favoritesCount / item.viewsCount * 100 : 0;
    }

    _searchDiscussionDensity(item) {
        return item?.viewsCount > 0 ? item.danmakuCount / item.viewsCount * 1000 : 0;
    }

    _searchSignals(item) {
        const signals = [];
        const favoriteRate = this._searchFavoriteRate(item);
        const discussion = this._searchDiscussionDensity(item);
        const ageDays = item?.pubdate > 0 ? Math.max(0, Math.floor((Date.now() / 1000 - item.pubdate) / 86400)) : Infinity;
        if (item?.durationSec > 0 && item.durationSec <= 600) signals.push(['quick', '快速看', '10 分钟内']);
        if (item?.durationSec >= 1800) signals.push(['deep', '系统学', '30 分钟以上']);
        if (item?.viewsCount >= 100000) signals.push(['hot', '高热', '播放量超过 10 万']);
        if (favoriteRate >= 2) signals.push(['save', '高收藏', '收藏率不低于 2%']);
        if (discussion >= 2) signals.push(['talk', '讨论多', '每千次播放至少 2 条弹幕']);
        if (ageDays <= 180) signals.push(['new', '新内容', '近 180 天发布']);
        return signals.slice(0, 3);
    }

    _sortSearchItems(items, sort = this._searchSort) {
        const sorted = [...(items || [])];
        const rules = {
            hot: (a, b) => b.viewsCount - a.viewsCount,
            favorite: (a, b) => this._searchFavoriteRate(b) - this._searchFavoriteRate(a),
            newest: (a, b) => b.pubdate - a.pubdate,
            short: (a, b) => (a.durationSec || Infinity) - (b.durationSec || Infinity),
            smart: (a, b) => a.sourceRank - b.sourceRank,
        };
        return sorted.sort(rules[sort] || rules.smart);
    }

    _formatSearchMetric(value, unit = '') {
        if (!Number.isFinite(value) || value <= 0) return '—';
        const digits = value >= 10 ? 0 : 1;
        return `${value.toFixed(digits)}${unit}`;
    }

    _renderSearchList(items) {
        const listEl = this._el.querySelector('#bili-list');
        const sorted = this._sortSearchItems(items);
        this._setSidebarContext('_search', sorted.length);
        const desc = this._el.querySelector('#bili-sidebar-desc');
        if (desc) desc.textContent = this._searchQuery ? `“${this._searchQuery}” · 选择更值得看的内容` : '选择更值得看的内容';
        if (!sorted.length) {
            listEl.innerHTML = '<div class="bili-list-msg"><i class="fas fa-search"></i> 没有找到匹配视频<br><small>换一个更具体的关键词试试</small></div>';
            return;
        }
        const sorts = [
            ['smart', '综合'], ['hot', '热度'], ['favorite', '收藏率'], ['newest', '最新'], ['short', '短时长'],
        ];
        listEl.innerHTML = `<section class="bili-search-guide" aria-label="搜索结果选择参考">
            <div class="bili-search-guide-head"><strong>怎么选</strong><span>综合排序沿用 B 站相关性</span></div>
            <div class="bili-search-sort" role="toolbar" aria-label="搜索结果排序">
                ${sorts.map(([value, label]) => `<button type="button" data-bili-search-sort="${value}" aria-pressed="${this._searchSort === value}" class="${this._searchSort === value ? 'active' : ''}">${label}</button>`).join('')}
            </div>
            <p><span><i class="fas fa-star"></i> 收藏率 = 收藏 / 播放</span><span><i class="fas fa-comments"></i> 讨论度 = 每千次播放弹幕</span></p>
        </section>
        <div class="bili-search-results">${sorted.map((item, index) => this._renderSearchVideoItem(item, index)).join('')}</div>`;
        listEl.querySelectorAll('[data-bili-search-sort]').forEach(button => {
            button.addEventListener('click', () => {
                this._searchSort = button.dataset.biliSearchSort;
                this._renderSearchList(this._searchItems);
            });
        });
        this._bindListItemEvents(listEl, sorted);
        this._bindImageFallbacks(listEl, '_search');
        this._renderBrowseOverview('_search', sorted);
    }

    _renderSearchVideoItem(item, index) {
        const favoriteRate = this._searchFavoriteRate(item);
        const discussion = this._searchDiscussionDensity(item);
        const signals = this._searchSignals(item);
        const fallbackCover = this._assetUrl(this._tabMeta('_search').asset);
        const cover = item.cover || fallbackCover;
        const isPlaying = this._currentVideo?.bvid === item.bvid;
        const signalHtml = signals.map(([tone, label, title]) => `<span class="bili-search-signal" data-tone="${tone}" title="${this._esc(title)}">${this._esc(label)}</span>`).join('');
        const ariaMetrics = `${item.views || '0'}播放，收藏率${this._formatSearchMetric(favoriteRate, '%')}，讨论度${this._formatSearchMetric(discussion)}`;
        return `<div class="bili-item bili-search-item${isPlaying ? ' playing' : ''}" data-idx="${index}" role="button" tabindex="0" aria-label="播放 ${this._esc(item.title)}，${ariaMetrics}">
            <div class="bili-search-cover-wrap">
                <img class="bili-item-cover" src="${this._esc(cover)}" data-bili-fallback="${this._esc(fallbackCover)}" alt="" loading="lazy">
                <span class="bili-item-dur">${this._esc(item.duration)}</span>
            </div>
            <div class="bili-item-info">
                <div class="bili-item-title">${this._esc(item.title)}</div>
                <div class="bili-search-byline">
                    ${item.mid ? `<button type="button" class="bili-item-creator-btn" data-bili-creator-mid="${this._esc(item.mid)}" data-bili-creator-name="${this._esc(item.author)}" aria-label="查看 ${this._esc(item.author)} 的 UP 主主页"><i class="fas fa-user"></i>${this._esc(item.author)}</button>` : `<span><i class="fas fa-user"></i>${this._esc(item.author)}</span>`}
                    <span><i class="fas fa-calendar-alt"></i>${this._esc(item.pubdateStr || '时间未知')}</span>
                </div>
                <div class="bili-search-metrics" aria-label="视频指标">
                    <span title="播放量"><i class="fas fa-play"></i><b>${this._esc(item.views || '0')}</b><small>播放</small></span>
                    <span title="收藏率：收藏数除以播放数"><i class="fas fa-star"></i><b>${this._formatSearchMetric(favoriteRate, '%')}</b><small>收藏率</small></span>
                    <span title="讨论度：每千次播放的弹幕数"><i class="fas fa-comments"></i><b>${this._formatSearchMetric(discussion)}</b><small>讨论度</small></span>
                </div>
                ${signalHtml ? `<div class="bili-search-signals">${signalHtml}</div>` : ''}
            </div>
        </div>`;
    }

    _renderLoginError(tab) {
        const frame = this._el.querySelector('#bili-player-frame');
        if (!frame) return;
        frame.innerHTML = `<div class="bili-v5-login-error">
            <div class="bili-v5-login-icon"><i class="fas fa-user-lock"></i></div>
            <span>ACCOUNT RECOVERY</span>
            <h2>登录状态已失效</h2>
            <p>历史、收藏和课程依赖浏览器里的 B 站登录状态。重新登录后可继续使用，本地观看进度不会被清除。</p>
            <div class="bili-v5-login-steps">
                <div><strong>1</strong><span>打开 bilibili.com 并完成登录</span></div>
                <div><strong>2</strong><span>返回扩展重新检测状态</span></div>
                <div><strong>3</strong><span>继续当前${tab === 'course' ? '课程' : tab === 'favorite' ? '收藏' : '列表'}</span></div>
            </div>
            <div class="bili-v5-login-actions">
                <button type="button" data-bili-login="open"><i class="fab fa-bilibili"></i> 打开登录页</button>
                <button type="button" data-bili-login="retry"><i class="fas fa-redo"></i> 重新检测</button>
            </div>
            <small>扩展只读取浏览器登录态，不会保存你的密码。</small>
        </div>`;
        this._el.querySelector('#bili-player-info')?.classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        frame.querySelector('[data-bili-login="open"]')?.addEventListener('click', () => window.open('https://www.bilibili.com', '_blank', 'noopener'));
        frame.querySelector('[data-bili-login="retry"]')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 检测中';
            const info = await this._checkLogin();
            this._loggedIn = info.loggedIn;
            this._userMid = info.mid;
            if (info.loggedIn) {
                frame.innerHTML = this._emptyPlayerMarkup();
                this._currentVideo = null;
                this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
                this._setProductPage(this._pageForTab(tab));
                await this._loadTab(tab);
                const returnTarget = this._el.querySelector(`.bili-pill[data-tab="${tab}"]`);
                returnTarget?.focus({ preventScroll: true });
            } else {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-redo"></i> 仍未登录，再试一次';
            }
        });
    }

    _assetUrl(path) {
        try { return chrome.runtime.getURL(path); }
        catch (_) { return path; }
    }

    _renderBrowseOverview(tab, items, force = false) {
        if (!items?.length || tab === 'following') return;
        if (this._currentVideo && !force) return;
        const frame = this._el.querySelector('#bili-player-frame');
        if (!frame) return;

        const meta = this._tabMeta(tab);
        const hero = items[0];
        const heroCover = hero.cover || this._assetUrl(meta.asset);
        const heroProgress = hero.progress > 0 && hero.progress < 100
            ? `<div class="bili-overview-progress"><span style="width:${hero.progress}%"></span></div>` : '';
        const capabilityTabs = [
            ['recommend', '推荐发现', '每天换一批内容', 'assets/bilibili/capability-recommend-v1.png'],
            ['course', '课程学习', '章节、资料和进度', 'assets/bilibili/capability-course-v1.png'],
            ['favorite', '收藏整理', '收藏夹与稍后看', 'assets/bilibili/capability-library-v1.png'],
            ['history', '历史续看', '回到上次中断处', 'assets/bilibili/capability-history-v1.png'],
        ];
        const itemCards = items.slice(1, 5).map((item, offset) => {
            const cover = item.cover || this._assetUrl(meta.asset);
            return `<button type="button" class="bili-overview-video" data-bili-overview-index="${offset + 1}" aria-label="播放 ${this._esc(item.title)}">
                <img src="${this._esc(cover)}" data-bili-fallback="${this._esc(this._assetUrl(meta.asset))}" alt="" loading="lazy">
                <span class="bili-overview-video-dur">${this._esc(item.duration || '')}</span>
                <strong>${this._esc(item.title)}</strong>
                <small>${this._esc(item.author || item.badge || meta.title)}</small>
            </button>`;
        }).join('');

        frame.innerHTML = `<div class="bili-browse-overview" data-bili-overview="${this._esc(tab)}">
            <section class="bili-overview-hero">
                <img class="bili-overview-hero-image" src="${this._esc(heroCover)}" data-bili-fallback="${this._esc(this._assetUrl(meta.asset))}" alt="">
                <div class="bili-overview-hero-shade"></div>
                <div class="bili-overview-hero-copy">
                    <span>${this._esc(meta.eyebrow)} · ${items.length} 条内容</span>
                    <h2>${this._esc(hero.title || meta.title)}</h2>
                    <p>${this._esc(hero.author ? `${hero.author} · ${hero.views || hero.badge || meta.desc}` : meta.desc)}</p>
                    ${heroProgress}
                    <div>
                        <button type="button" class="bili-overview-primary" data-bili-overview-index="0"><i class="fas fa-play"></i>${tab === 'history' && hero.progress ? '继续观看' : '立即播放'}</button>
                        <button type="button" class="bili-overview-secondary" data-bili-empty-tab="${tab === 'watchlater' ? 'favorite' : 'watchlater'}"><i class="fas fa-clock"></i>${tab === 'watchlater' ? '查看收藏' : '稍后看'}</button>
                    </div>
                </div>
            </section>
            <section class="bili-overview-section">
                <header><div><span>CAPABILITIES</span><strong>从目的出发</strong></div><small>四项主能力，各自保留独立数据状态</small></header>
                <div class="bili-overview-capabilities">
                    ${capabilityTabs.map(([targetTab, title, desc, asset]) => `<button type="button" class="bili-overview-capability${targetTab === tab ? ' active' : ''}" data-bili-empty-tab="${targetTab}">
                        <img src="${this._esc(this._assetUrl(asset))}" alt="">
                        <span><strong>${title}</strong><small>${desc}</small></span>
                    </button>`).join('')}
                </div>
            </section>
            ${itemCards ? `<section class="bili-overview-section bili-overview-picks"><header><div><span>MORE TO WATCH</span><strong>继续探索</strong></div><small>点击封面直接播放</small></header><div class="bili-overview-video-grid">${itemCards}</div></section>` : ''}
        </div>`;
        this._overviewItems = items;
        this._bindImageFallbacks(frame, tab);
        this._el.querySelector('#bili-player-info')?.classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
    }

    _renderCourseDiscoveryFallback() {
        const frame = this._el.querySelector('#bili-player-frame');
        if (!frame || this._currentVideo) return;
        const asset = this._assetUrl(this._tabMeta('course').asset);
        frame.innerHTML = `<div class="bili-course-discovery-fallback">
            <img src="${this._esc(asset)}" alt="">
            <div></div>
            <section>
                <span>LEARNING WORKSPACE</span>
                <h2>把课程、章节和进度放在一个地方</h2>
                <p>当前没有匹配的公开课程，但你的已购课程仍然可用。进入“我的课程”后，可以继续真实账号中的学习内容。</p>
                <button type="button" data-bili-course-source="mine"><i class="fas fa-shopping-bag"></i>打开我的课程</button>
            </section>
        </div>`;
        this._el.querySelector('#bili-player-info')?.classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
    }

    _bindImageFallbacks(root, tab) {
        const fallback = this._assetUrl(this._tabMeta(tab).asset);
        root?.querySelectorAll('img[data-bili-fallback]').forEach(img => {
            img.addEventListener('error', () => {
                const next = img.dataset.biliFallback || fallback;
                if (img.src !== next) img.src = next;
            }, { once: true });
        });
    }

    _renderVideoItem(v, idx, tab, showRemoveBtn) {
        const isPlaying = this._currentVideo?.bvid === v.bvid;
        const fallbackCover = this._assetUrl(this._tabMeta(tab).asset);
        const cover = v.cover || fallbackCover;
        const rankHtml = v.rankNum ? `<span class="bili-item-rank">${v.rankNum}</span>` : '';
        const progressHtml = v.progress > 0 && v.progress < 100
            ? `<div class="bili-item-progress"><div class="bili-item-progress-bar" style="width:${v.progress}%"></div></div>` : '';
        const rmHtml = showRemoveBtn
            ? `<button class="bili-item-rm-btn" title="${tab === 'watchlater' ? '移除稍后看' : '取消收藏'}"><i class="fas fa-times"></i></button>` : '';
        let resumeHtml = '';
        if (v.progressSec > 0 || (v.totalPages > 1 && v.watchPage > 0)) {
            const parts = [];
            if (v.totalPages > 1 && v.watchPage > 0) parts.push(`P${v.watchPage}/${v.totalPages}`);
            if (v.progressSec > 0) parts.push(`看到 ${this._fmtDuration(v.progressSec)}`);
            resumeHtml = `<span class="bili-item-resume"><i class="fas fa-history"></i> ${parts.join(' · ')}</span>`;
        }
        const pagesBadge = v.totalPages > 1 && !v.watchPage
            ? `<span class="bili-item-pages">${v.totalPages}P</span>` : '';
        const rcmdBadge = v.rcmdReason ? `<span class="bili-item-rcmd-tag">${this._esc(v.rcmdReason)}</span>` : '';
        let metricHtml;
        if (v.viewedAt) {
            metricHtml = `<span><i class="fas fa-clock"></i> ${this._esc(v.viewedAt)}</span>`;
        } else if (v.views) {
            metricHtml = `<span><i class="fas fa-play"></i> ${v.views}</span>`;
        } else {
            metricHtml = '';
        }
        return `<div class="bili-item${isPlaying ? ' playing' : ''}" data-idx="${idx}" role="button" tabindex="0" aria-label="播放 ${this._esc(v.title)}">
            ${rankHtml}
            <img class="bili-item-cover" src="${this._esc(cover)}" data-bili-fallback="${this._esc(fallbackCover)}" alt="" loading="lazy">
            <span class="bili-item-dur">${this._esc(v.duration)}</span>
            ${pagesBadge}
            <div class="bili-item-info">
                <div class="bili-item-title">${this._esc(v.title)}</div>
                <div class="bili-item-meta">
                    ${v.mid ? `<button type="button" class="bili-item-creator-btn" data-bili-creator-mid="${this._esc(v.mid)}" data-bili-creator-name="${this._esc(v.author)}" aria-label="查看 ${this._esc(v.author)} 的 UP 主主页"><i class="fas fa-user"></i>${this._esc(v.author)}</button>` : `<span><i class="fas fa-user"></i> ${this._esc(v.author)}</span>`}
                    ${metricHtml}
                    ${resumeHtml}
                    ${rcmdBadge}
                </div>
                ${progressHtml}
            </div>
            ${rmHtml}
        </div>`;
    }

    _renderCourseItem(v, idx) {
        const badgeCls = v.badge === '免费' ? 'free' : (v.badge === '已购' ? 'paid' : 'trial');
        const fallbackCover = this._assetUrl(this._tabMeta('course').asset);
        const cover = v.cover || fallbackCover;
        return `<div class="bili-item" data-idx="${idx}" role="button" tabindex="0" aria-label="播放课程 ${this._esc(v.title)}">
            <img class="bili-item-cover" src="${this._esc(cover)}" data-bili-fallback="${this._esc(fallbackCover)}" alt="" loading="lazy">
            <span class="bili-item-badge ${badgeCls}">${this._esc(v.badge)}</span>
            <div class="bili-item-info">
                <div class="bili-item-title">${this._esc(v.title)}</div>
                <div class="bili-item-meta">
                    <span><i class="fas fa-user"></i> ${this._esc(v.author)}</span>
                    ${v.epCount ? `<span><i class="fas fa-graduation-cap"></i> ${v.epCount}期</span>` : ''}
                    <span><i class="fas fa-play"></i> ${v.views}</span>
                </div>
            </div>
        </div>`;
    }

    _bindListItemEvents(listEl, items) {
        listEl.querySelectorAll('.bili-item-creator-btn').forEach(button => {
            button.addEventListener('click', event => {
                event.stopPropagation();
                const mid = Number(button.dataset.biliCreatorMid) || 0;
                if (!mid) return;
                const item = items[parseInt(button.closest('.bili-item')?.dataset.idx)];
                this._loadUserSpace(mid, button.dataset.biliCreatorName || '', {
                    ...(item || {}),
                    mid,
                    uname: button.dataset.biliCreatorName || '',
                });
            });
        });
        listEl.querySelectorAll('.bili-item').forEach(itemEl => {
            const activate = (e) => {
                if (e.target.closest('.bili-item-rm-btn, .bili-item-creator-btn')) return;
                const idx = parseInt(itemEl.dataset.idx);
                const item = items[idx];
                if (item) this._playItem(item);
                listEl.querySelectorAll('.bili-item').forEach(el => el.classList.remove('playing'));
                itemEl.classList.add('playing');
            };
            itemEl.addEventListener('click', activate);
            itemEl.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                activate(event);
            });
        });

        this._scrollToPlayingItem(listEl);
    }

    _scrollToPlayingItem(listEl) {
        if (!listEl) return;
        const playingEl = listEl.querySelector('.bili-item.playing');
        if (playingEl) {
            setTimeout(() => {
                playingEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
            return;
        }
        if (!this._currentVideo?.bvid) return;
        const currentBvid = this._currentVideo.bvid;
        const items = listEl.querySelectorAll('.bili-item');
        for (const itemEl of items) {
            const idx = parseInt(itemEl.dataset.idx);
            const cache = this._cache[this._currentTab];
            if (cache?.[idx]?.bvid === currentBvid) {
                itemEl.classList.add('playing');
                setTimeout(() => {
                    itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
                break;
            }
        }
    }

    // ===================== Player =====================

    _closePlayerDrawers() {
        for (const [buttonId, sectionId] of [
            ['bili-recent-toggle', 'bili-player-recent'],
            ['bili-settings-toggle', 'bili-ctrl-bar'],
            ['bili-details-toggle', 'bili-player-info'],
        ]) {
            const section = this._el?.querySelector(`#${sectionId}`);
            const button = this._el?.querySelector(`#${buttonId}`);
            section?.setAttribute('data-collapsed', 'true');
            button?.setAttribute('aria-expanded', 'false');
            button?.classList.remove('active');
        }
    }

    _togglePlayerDrawer(sectionId, buttonId) {
        const section = this._el?.querySelector(`#${sectionId}`);
        const button = this._el?.querySelector(`#${buttonId}`);
        if (!section || !button || section.classList.contains('hidden')) return;
        const open = section.dataset.collapsed !== 'false';
        this._closePlayerDrawers();
        if (!open) return;
        section.dataset.collapsed = 'false';
        button.setAttribute('aria-expanded', 'true');
        button.classList.add('active');
    }

    _renderPlayerMetadata(item) {
        const info = this._el.querySelector('#bili-player-info');
        if (!info || !item) return;
        info.classList.remove('hidden');
        const detailsToggle = this._el.querySelector('#bili-details-toggle');
        if (detailsToggle) detailsToggle.disabled = false;

        let titleText = item.title || '未命名视频';
        if (item.totalPages > 1 && item.watchPage > 0) {
            titleText += ` [P${item.watchPage}/${item.totalPages}`;
            if (item.showTitle) titleText += ` ${item.showTitle}`;
            titleText += ']';
        }
        this._el.querySelector('#bili-pi-title').textContent = titleText;
        this._el.querySelector('#bili-np-title').textContent = titleText;
        this._el.querySelector('#bili-np-author').textContent = item.author || 'UP 主信息待同步';
        this._el.querySelector('#bili-pi-author').textContent = item.author || '';
        const cover = this._el.querySelector('#bili-np-cover');
        if (cover) {
            cover.src = item.cover || this._assetUrl(this._tabMeta(this._currentTab).asset);
            cover.alt = item.cover ? `${item.title || '当前视频'}的封面` : '';
        }

        const viewsEl = this._el.querySelector('#bili-pi-views');
        const viewsIconEl = viewsEl?.parentElement?.querySelector('i');
        if (item.viewedAt && !item.views) {
            if (viewsIconEl) viewsIconEl.className = 'fas fa-clock';
            if (viewsEl) viewsEl.textContent = item.viewedAt;
        } else {
            if (viewsIconEl) viewsIconEl.className = 'fas fa-play';
            if (viewsEl) viewsEl.textContent = item.views || '';
        }
        this._el.querySelector('#bili-pi-danmaku').textContent = item.danmaku || '';

        const dateEl = this._el.querySelector('#bili-pi-date');
        const dateText = this._el.querySelector('#bili-pi-date-text');
        if (item.pubdateStr) {
            dateText.textContent = item.pubdateStr;
            dateEl.style.display = '';
        } else {
            dateEl.style.display = 'none';
        }

        this._el.querySelector('#bili-pi-meta-extra').style.display = '';
        const setMeta = (id, val) => {
            const element = this._el.querySelector(`#${id}`);
            if (!element) return;
            const span = element.querySelector('span');
            if (val && val !== '0:00') {
                span.textContent = val;
                element.style.display = '';
            } else {
                element.style.display = 'none';
            }
        };
        setMeta('bili-pi-likes', item.likes);
        setMeta('bili-pi-coins', item.coins);
        setMeta('bili-pi-favs', item.favorites);
        setMeta('bili-pi-shares', item.shares);
        setMeta('bili-pi-dur', item.duration);
        setMeta('bili-pi-bvid', item.bvid);
        setMeta('bili-pi-tname', item.tname);

        const like = this._el.querySelector('#bili-act-like');
        like?.classList.remove('active');
        like?.setAttribute('aria-pressed', 'false');
        this._updatePlayerActionContext();
        this._el.querySelector('#bili-now-playing')?.classList.remove('hidden');
        this._updateTransportUI();
    }

    _updatePlayerActionContext() {
        const hasVideo = !!this._currentVideo?.bvid;
        const hasCreator = hasVideo && !!this._currentVideo?.mid;
        const inWatchlater = this._currentTab === 'watchlater';
        const inFavorite = this._currentTab === 'favorite';
        const actions = this._el.querySelector('.bili-pi-actions');
        if (actions) actions.hidden = !hasVideo;
        const addLater = this._el.querySelector('#bili-act-later');
        const removeLater = this._el.querySelector('#bili-act-rm-later');
        const removeFavorite = this._el.querySelector('#bili-act-rm-fav');
        const creator = this._el.querySelector('#bili-act-creator');
        if (addLater) addLater.hidden = !hasVideo || inWatchlater;
        if (removeLater) removeLater.hidden = !hasVideo || !inWatchlater;
        if (removeFavorite) removeFavorite.hidden = !hasVideo || !inFavorite;
        if (creator) creator.disabled = !hasCreator;
        for (const button of [addLater, removeLater, removeFavorite, this._el.querySelector('#bili-act-like')]) {
            if (button) button.disabled = !hasVideo || !this._loggedIn;
        }
        for (const id of ['bili-act-comments', 'bili-act-copy', 'bili-act-open']) {
            const button = this._el.querySelector(`#${id}`);
            if (button) button.disabled = !hasVideo;
        }
    }

    _renderPlayerRecent(state = 'ready', message = '') {
        const rail = this._el?.querySelector('#bili-player-recent');
        if (!rail) return;
        const hasCreator = !!this._currentVideo?.mid;
        if (!hasCreator) {
            rail.classList.add('hidden');
            rail.innerHTML = '';
            const recentToggle = this._el.querySelector('#bili-recent-toggle');
            if (recentToggle) recentToggle.disabled = true;
            return;
        }

        rail.classList.remove('hidden');
        const recentToggle = this._el.querySelector('#bili-recent-toggle');
        if (recentToggle) recentToggle.disabled = false;
        const author = this._currentVideo.author || '当前 UP 主';
        const actions = `<div class="bili-recent-actions">
            <button type="button" data-bili-recent-action="refresh" title="刷新最近发布" aria-label="刷新 ${this._esc(author)} 的最近发布"><i class="fas fa-sync-alt"></i></button>
            <button type="button" data-bili-recent-action="creator"><i class="fas fa-th-large"></i><span>查看全部</span></button>
        </div>`;
        if (state === 'loading') {
            rail.innerHTML = `<header><span>FRESH FROM UP</span><strong>${this._esc(author)} · 最近发布</strong></header><div class="bili-recent-state"><i class="fas fa-spinner fa-spin"></i> 正在加载…</div>${actions}`;
            return;
        }
        if (!this._playerRecentItems.length) {
            rail.innerHTML = `<header><span>FRESH FROM UP</span><strong>${this._esc(author)} · 最近发布</strong></header><div class="bili-recent-state"><i class="fas fa-info-circle"></i> ${this._esc(message || '暂时没有可展示的视频')}</div>${actions}`;
            return;
        }

        const cards = this._playerRecentItems.map((item, index) => {
            const active = item.bvid === this._currentVideo?.bvid;
            return `<button type="button" class="bili-recent-card${active ? ' active' : ''}" data-bili-recent-index="${index}" aria-current="${active ? 'true' : 'false'}" aria-label="${active ? '正在播放' : '切换播放'} ${this._esc(item.title)}">
                <span class="bili-recent-thumb"><img src="${this._esc(item.cover || '')}" alt="" loading="lazy"><i class="fas fa-${active ? 'volume-up' : 'play'}"></i></span>
                <span class="bili-recent-copy"><strong>${this._esc(item.title)}</strong><small>${this._esc(item.pubdateStr || item.duration || '最近发布')}</small></span>
            </button>`;
        }).join('');
        rail.innerHTML = `<header><span>FRESH FROM UP</span><strong>${this._esc(author)} · 最近发布</strong></header><div class="bili-recent-track">${cards}</div>${actions}`;
    }

    async _loadPlayerRecent(item, force = false) {
        const mid = Number(item?.mid) || 0;
        if (!mid || !item?.bvid) {
            this._renderPlayerRecent();
            return;
        }
        if (!force && this._playerRecentMid === mid && this._playerRecentItems.length) {
            this._renderPlayerRecent();
            return;
        }

        const requestId = ++this._playerRecentSeq;
        this._playerRecentMid = mid;
        this._playerRecentItems = [];
        this._renderPlayerRecent('loading');
        const result = await this._fetchCreatorVideos(mid, item.author, 8);
        if (requestId !== this._playerRecentSeq || Number(this._currentVideo?.mid) !== mid) return;
        this._playerRecentItems = result.videos || [];
        const message = result.error?.message ? `加载失败：${result.error.message}` : '该 UP 主暂无公开视频';
        this._renderPlayerRecent('ready', message);
    }

    async _playItem(item) {
        this._el.classList.remove('bili-live-mode');
        this._destroyLiveFallback();
        clearTimeout(this._liveFallbackTimer);
        this._livePlaybackSeq++;
        if (this._creatorView) this._creatorLoadSeq++;
        this._creatorView = null;
        this._creatorReturn = null;
        this._creatorItems = [];
        this._setCreatorMode(false);
        if (!item.watchPage && item.bvid) {
            const mem = this._getWatchMemory(item.bvid);
            if (mem && mem.page > 1) {
                item.watchPage = mem.page;
                if (!item.progressSec && mem.time > 0) item.progressSec = mem.time;
            }
        }

        this._currentVideo = item;
        if (item.type !== 'course') {
            this._currentSpeed = 2;
            this._autoSpeedPending = true;
            this._updateSpeedUI();
        }
        this._playerIdentitySeq++;
        this._playerIdentityLoading = '';
        this._playerState = {
            bvid: item.bvid || '',
            page: item.watchPage || 1,
            currentTime: item.progressSec || 0,
            duration: item.durationSec || 0,
            speed: this._currentSpeed,
            paused: false,
        };
        this._setProductPage('player');
        this._closePlayerDrawers();
        this._pendingSeek = item.progressSec > 0 ? item.progressSec : null;
        this._seekRetries = 0;

        this._hideComments();
        this._commentPage = 1;
        const frame = this._el.querySelector('#bili-player-frame');
        const SANDBOX_PLAYER = 'allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-popups-to-escape-sandbox';

        if (this._loggedIn) {
            await this._injectBiliCookies();
        }

        if (item.type === 'course' && item.seasonId) {
            frame.innerHTML = `<iframe src="https://www.bilibili.com/cheese/play/ss${item.seasonId}" sandbox="${SANDBOX_PLAYER}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
        } else if (item.bvid) {
            const params = [];
            if (item.watchPage > 1) params.push(`p=${item.watchPage}`);
            if (item.progressSec > 0) params.push(`t=${item.progressSec}`);
            const qs = params.length ? `?${params.join('&')}` : '';
            frame.innerHTML = `<iframe src="https://www.bilibili.com/video/${item.bvid}/${qs}" sandbox="${SANDBOX_PLAYER}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
        }

        this._renderPlayerMetadata(item);
        this._loadPlayerRecent(item);

        const ctrlBar = this._el.querySelector('#bili-ctrl-bar');
        const settingsToggle = this._el.querySelector('#bili-settings-toggle');
        const speedCycle = this._el.querySelector('#bili-speed-cycle');
        if (item.type !== 'course') {
            ctrlBar?.classList.remove('hidden');
            if (settingsToggle) settingsToggle.disabled = false;
            if (speedCycle) speedCycle.disabled = false;
            this._el.querySelector('#bili-quality-btns').innerHTML = '<span class="bili-quality-hint">加载中...</span>';
            this._setQualityStatus('正在检测');
            this._qualityList = [];
            this._currentQuality = 0;
            this._pendingQuality = 0;
            this._qualityAutoApplied = false;
            clearTimeout(this._qualityFailTimer);
            const targetBvid = item.bvid;
            setTimeout(() => {
                if (this._currentVideo?.bvid === targetBvid && this._autoSpeedPending) this._applyAutoSpeed();
            }, 2000);
            setTimeout(() => {
                this._sendPlayerMsg({ type: 'bili-ext-get-quality' });
            }, 4000);
        } else {
            ctrlBar?.classList.add('hidden');
            if (settingsToggle) settingsToggle.disabled = true;
            if (speedCycle) speedCycle.disabled = true;
        }
    }

    async _playLiveRoom(item) {
        if (!item?.roomId) return;
        const requestId = ++this._livePlaybackSeq;
        this._destroyLiveFallback();
        clearTimeout(this._liveFallbackTimer);
        if (this._creatorView) this._creatorLoadSeq++;
        this._creatorView = null;
        this._creatorReturn = null;
        this._creatorItems = [];
        this._setCreatorMode(false);
        this._currentVideo = item;
        this._playerState = null;
        this._pendingSeek = null;
        this._hideComments();
        this._closePlayerDrawers();
        this._setProductPage('player');
        this._el.classList.add('bili-live-mode');
        if (this._loggedIn) void this._injectBiliCookies();

        this._renderLivePlayerShell(item, `<div class="bili-live-player-status"><i class="fas fa-spinner fa-spin"></i><strong>正在连接直播线路</strong><span>优先使用 B 站官方播放器</span></div>`);
        this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._el.querySelector('#bili-player-info')?.classList.add('hidden');
        const recent = this._el.querySelector('#bili-player-recent');
        if (recent) {
            recent.classList.add('hidden');
            recent.innerHTML = '';
        }
        const recentToggle = this._el.querySelector('#bili-recent-toggle');
        if (recentToggle) recentToggle.disabled = true;

        const mode = await this._resolveLivePlaybackMode(item.roomId);
        if (requestId !== this._livePlaybackSeq || this._currentVideo?.roomId !== item.roomId) return;
        if (mode === 'flv') {
            await this._startLiveFlvFallback(item, requestId, '新版播放流暂不可用');
        } else {
            this._renderLiveActivityPlayer(item, requestId);
        }
    }

    _renderLivePlayerShell(item, content) {
        const frame = this._el.querySelector('#bili-player-frame');
        frame.innerHTML = `<div class="bili-live-player-shell">
            <header><div><span><i></i>LIVE</span><strong>${this._esc(item.title)}</strong><small>${this._esc(item.author)} · ${this._esc(item.area)} · ${this._esc(item.onlineText)}</small></div>
                ${item.isDrama ? '' : '<button type="button" data-bili-current-live-open><i class="fas fa-external-link-alt"></i><span>原页打开</span></button>'}
            </header>
            <div class="bili-live-player-stage">${content}</div>
        </div>`;
    }

    async _resolveLivePlaybackMode(roomId) {
        try {
            const resp = await this._biliApi('/xlive/web-room/v2/index/getRoomPlayInfo', {
                room_id: roomId,
                protocol: '0,1',
                format: '0,1,2',
                codec: '0,1',
                qn: 10000,
                platform: 'web',
                ptype: 8,
            });
            const streams = resp?.data?.playurl_info?.playurl?.stream;
            return resp?.code === 0 && Array.isArray(streams) && streams.length ? 'activity' : 'flv';
        } catch (error) {
            console.warn('[Bilibili] 新版直播流预检失败，保留官方播放器:', error.message);
            return 'activity';
        }
    }

    _renderLiveActivityPlayer(item, requestId) {
        const stage = this._el.querySelector('.bili-live-player-stage');
        if (!stage) return;
        const sandbox = 'allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-popups-to-escape-sandbox';
        stage.innerHTML = `<iframe src="https://www.bilibili.com/blackboard/live/live-activity-player.html?cid=${item.roomId}&quality=0&autoplay=1&reload=1" sandbox="${sandbox}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture" title="${this._esc(item.author)} 的直播间"></iframe>`;
        clearTimeout(this._liveFallbackTimer);
        this._liveFallbackTimer = setTimeout(() => {
            if (requestId !== this._livePlaybackSeq || this._currentVideo?.roomId !== item.roomId) return;
            void this._startLiveFlvFallback(item, requestId, '官方播放器启动超时');
        }, 10000);
    }

    _onLiveActivityMessage(rawMessage) {
        let operation;
        try { operation = JSON.parse(rawMessage.slice('playerOperation-'.length)); }
        catch (_) { return; }
        const healthy = ['playing', 'MutePlay', 'NotAutoPlay', 'paused'].includes(operation?.type);
        if (healthy) {
            clearTimeout(this._liveFallbackTimer);
            return;
        }
        if (/error/i.test(operation?.type || '') && this._currentVideo?.type === 'live') {
            void this._startLiveFlvFallback(this._currentVideo, this._livePlaybackSeq, '官方播放器返回异常');
        }
    }

    async _startLiveFlvFallback(item, requestId, reason = '') {
        if (!item?.roomId || requestId !== this._livePlaybackSeq) return;
        clearTimeout(this._liveFallbackTimer);
        this._destroyLiveFallback();
        this._renderLivePlayerShell(item, `<div class="bili-live-player-status"><i class="fas fa-route fa-spin"></i><strong>正在切换兼容线路</strong><span>${this._esc(reason || '获取 FLV 直播流')}</span></div>`);
        try {
            const urls = await this._fetchLiveFlvUrls(item.roomId);
            if (requestId !== this._livePlaybackSeq || this._currentVideo?.roomId !== item.roomId) return;
            if (!urls.length) throw new Error('兼容线路也没有返回播放流');
            if (!window.flvjs?.isSupported?.()) throw new Error('当前浏览器不支持 FLV MediaSource 播放');
            const stage = this._el.querySelector('.bili-live-player-stage');
            if (!stage) return;
            stage.innerHTML = `<div class="bili-live-flv-wrap">
                <video id="bili-live-fallback-video" controls autoplay playsinline preload="auto" poster="${this._esc(item.cover || '')}"></video>
                <span class="bili-live-fallback-badge"><i class="fas fa-route"></i>兼容线路</span>
                <div class="bili-live-fallback-state" id="bili-live-fallback-state">正在加载兼容直播流…</div>
                <button type="button" class="bili-live-fallback-retry hidden" data-bili-live-fallback-retry><i class="fas fa-redo"></i>重新获取直播流</button>
            </div>`;
            this._mountLiveFlv(item, urls, 0, requestId);
        } catch (error) {
            if (requestId !== this._livePlaybackSeq) return;
            this._renderLivePlayerShell(item, `<div class="bili-live-player-status is-error"><i class="fas fa-exclamation-circle"></i><strong>直播线路暂时不可用</strong><span>${this._esc(error.message)}</span><button type="button" data-bili-live-fallback-retry><i class="fas fa-redo"></i>重新检测</button></div>`);
        }
    }

    async _fetchLiveFlvUrls(roomId) {
        const resp = await this._biliApi('/room/v1/Room/playUrl', {
            cid: roomId,
            platform: 'web',
            quality: 4,
        });
        if (resp?.code !== 0) throw new Error(resp?.message || '兼容播放接口失败');
        return (resp?.data?.durl || []).map(entry => entry?.url).filter(url => /^https:\/\//.test(url));
    }

    _mountLiveFlv(item, urls, index, requestId) {
        if (requestId !== this._livePlaybackSeq) return;
        this._destroyLiveFallback();
        const video = this._el.querySelector('#bili-live-fallback-video');
        const status = this._el.querySelector('#bili-live-fallback-state');
        const retry = this._el.querySelector('[data-bili-live-fallback-retry]');
        if (!video || !urls[index]) return;
        const player = window.flvjs.createPlayer({
            type: 'flv',
            url: urls[index],
            isLive: true,
            cors: true,
            withCredentials: false,
            hasAudio: true,
            hasVideo: true,
        }, {
            enableWorker: false,
            enableStashBuffer: false,
            stashInitialSize: 128,
            lazyLoad: false,
            autoCleanupSourceBuffer: true,
        });
        this._liveFallbackPlayer = player;
        player.attachMediaElement(video);
        player.load();
        player.on(window.flvjs.Events.ERROR, () => {
            if (requestId !== this._livePlaybackSeq) return;
            if (index + 1 < urls.length) {
                if (status) status.textContent = '当前线路异常，正在切换备用线路…';
                setTimeout(() => this._mountLiveFlv(item, urls, index + 1, requestId), 300);
                return;
            }
            if (status) status.textContent = '兼容线路连接失败，请重新检测';
            retry?.classList.remove('hidden');
        });
        video.addEventListener('playing', () => {
            if (status) status.textContent = '兼容线路播放中';
            retry?.classList.add('hidden');
        }, { once: true });
        player.play().catch(() => {
            if (status) status.textContent = '兼容线路已就绪，点击播放器开始播放';
        });
    }

    _destroyLiveFallback() {
        if (!this._liveFallbackPlayer) return;
        try { this._liveFallbackPlayer.pause(); } catch (_) {}
        try { this._liveFallbackPlayer.unload(); } catch (_) {}
        try { this._liveFallbackPlayer.detachMediaElement(); } catch (_) {}
        try { this._liveFallbackPlayer.destroy(); } catch (_) {}
        this._liveFallbackPlayer = null;
    }

    // ===================== Show/Hide =====================

    show() {
        if (!this._el) return;
        if (!this._panelOpen) this._returnFocus = document.activeElement;
        this._panelOpen = true;
        this._syncViewportHeight();
        this._setBackgroundInert(true);
        this._el.inert = false;
        this._el.setAttribute('aria-hidden', 'false');
        this._el.classList.add('visible');
        document.body.classList.add('bili-panel-open');
        this._setProductPage(this._creatorView ? 'recommend' : this._currentVideo ? 'player' : this._pageForTab(this._currentTab));
        if (!this._currentVideo) {
            const cacheKey = this._currentTab === 'favorite'
                ? `fav_${this._activeFavId}`
                : this._currentTab === 'following'
                    ? `following_${this._activeGroupId}`
                    : this._currentTab;
            const overviewItems = this._cache[cacheKey];
            if (Array.isArray(overviewItems) && overviewItems.length) {
                if (this._currentTab === 'following') this._renderFollowingOverview(overviewItems);
                else this._renderBrowseOverview(this._currentTab, overviewItems);
            }
        }
        const searchInput = this._el.querySelector('#bili-search-input');
        searchInput?.focus({ preventScroll: true });
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (!this._panelOpen) return;
                searchInput?.focus({ preventScroll: true });
            }, 80);
        });
    }

    hide() {
        if (!this._el) return;
        this._destroyAllIframes();
        clearTimeout(this._qualityVerifyTimer);
        clearTimeout(this._biliToastTimer);
        this._clearBiliCookieRules();
        this._panelOpen = false;
        this._el.classList.remove('visible');
        this._el.setAttribute('aria-hidden', 'true');
        this._el.inert = true;
        this._setBackgroundInert(false);
        document.body.classList.remove('bili-panel-open');
        window.ProductUIV5?.setShellPage?.('home');
        this._returnFocus?.focus?.({ preventScroll: true });
        this._returnFocus = null;
    }

    _setBackgroundInert(active) {
        if (active) {
            if (this._backgroundInertSiblings.length) return;
            this._backgroundInertSiblings = [...document.body.children]
                .filter(child => child !== this._el && !child.inert);
            this._backgroundInertSiblings.forEach(child => { child.inert = true; });
            return;
        }
        this._backgroundInertSiblings.forEach(child => { child.inert = false; });
        this._backgroundInertSiblings = [];
    }

    _trapFocus(event) {
        const focusable = [...this._el.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]), iframe')]
            .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    _destroyAllIframes() {
        this._livePlaybackSeq++;
        clearTimeout(this._liveFallbackTimer);
        this._destroyLiveFallback();
        this._el.querySelectorAll('iframe').forEach(iframe => {
            try { iframe.src = 'about:blank'; } catch {}
            iframe.remove();
        });
        const frame = this._el.querySelector('#bili-player-frame');
        frame.innerHTML = this._emptyPlayerMarkup();
        this._el.querySelector('#bili-player-info').classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
        this._hideComments();
        this._currentVideo = null;
        this._creatorView = null;
        this._creatorReturn = null;
        this._creatorItems = [];
        this._setCreatorMode(false);
        this._pendingSeek = null;
    }

    toggle() { this._panelOpen ? this.hide() : this.show(); }
    isOpen() { return this._panelOpen; }

    _syncViewportHeight() {
        if (!this._el) return;
        const height = Math.max(480, Math.round(window.visualViewport?.height || window.innerHeight || 720));
        this._el.style.setProperty('--bili-viewport-height', `${height}px`);
        // Chrome 在关闭停靠的 DevTools 后偶发保留旧的 flex 高度；显式读取布局可让侧栏同步到新视口。
        void this._el.offsetHeight;
    }

    _emptyPlayerMarkup() {
        return `<div class="bili-player-empty">
            <div class="bili-empty-mark"><i class="fab fa-bilibili"></i></div>
            <strong>挑一个今天想看的内容</strong>
            <p>右侧列表会保留你的登录态、收藏与观看记录</p>
            <div class="bili-empty-actions" aria-label="快速选择内容">
                <button type="button" data-bili-empty-tab="recommend"><i class="fas fa-thumbs-up"></i> 为你推荐</button>
                <button type="button" data-bili-empty-tab="history"><i class="fas fa-history"></i> 继续观看</button>
                <button type="button" data-bili-empty-tab="course"><i class="fas fa-graduation-cap"></i> 我的课程</button>
            </div>
        </div>`;
    }

    _setProductPage(page) {
        window.ProductUIV5?.setBusinessPage?.('bilibili', page);
    }

    _pageForTab(tab) {
        if (tab === '_search') return 'search';
        if (tab === 'course') return 'course';
        if (tab === 'live') return 'player';
        if (tab === 'favorite' || tab === 'watchlater') return 'library';
        if (tab === 'history' || tab === 'ranking') return 'history-ranking';
        return 'recommend';
    }

    // ===================== Utils =====================

    _esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

    _httpsCover(url) {
        if (!url) return '';
        return url.replace(/^http:/, 'https:').replace(/^\/\//, 'https://');
    }

    _toDurationSeconds(value) {
        if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
        if (typeof value !== 'string') return 0;
        const raw = value.trim();
        if (!raw) return 0;
        if (/^\d+(?:\.\d+)?$/.test(raw)) return Math.max(0, Math.floor(Number(raw)));
        const parts = raw.split(':').map(Number);
        if (!parts.length || parts.some(part => !Number.isFinite(part) || part < 0)) return 0;
        return parts.reduce((total, part) => total * 60 + part, 0);
    }

    _fmtDuration(sec) {
        sec = this._toDurationSeconds(sec);
        if (sec <= 0) return '0:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    _fmtNum(n) {
        if (!n) return '0';
        if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
        if (n >= 10000) return (n / 10000).toFixed(1) + '万';
        return String(n);
    }

    _fmtDate(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diffMs = now - d;
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffDays === 0) return '今天';
        if (diffDays === 1) return '昨天';
        if (diffDays < 7) return `${diffDays}天前`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
        if (diffDays < 365) return `${d.getMonth() + 1}月${d.getDate()}日`;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
}

window.bilibiliController = new BilibiliController();
