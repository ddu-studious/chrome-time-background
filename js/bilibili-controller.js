/**
 * 哔哩哔哩集成控制器 v3.16.0
 * 技术方案：Embed Player + Cookie API + declarativeNetRequest Cookie 注入
 * 功能：推荐/热门/历史/稍后看/收藏/排行/课程/关注 八分类 + 搜索 + 嵌入播放器
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
        this._favFolderId = 0;
        this._favFolders = null;
        this._activeFavId = 0;
        this._currentSpeed = 1;
        this._currentQuality = 0;
        this._pendingQuality = 0;
        this._preferredQuality = 0;
        this._qualityList = [];
        this._qualityDescriptions = {};
        this._playerState = null;
        this._pendingSeek = null;
        this._seekRetries = 0;
        this._commentSort = 0;
        this._commentPage = 1;
        this._commentLoading = false;
        this._commentsOpen = false;
        this._watchMemory = {};
        this._rcmdFreshIdx = 1;
    }

    async init() {
        this._injectDOM();
        this._bindEvents();
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
            if (biliLastTab && ['recommend', 'popular', 'history', 'watchlater', 'favorite', 'ranking', 'course', 'following'].includes(biliLastTab)) {
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
            Object.keys(this._cache).forEach(k => { if (k.startsWith('following_')) delete this._cache[k]; });
        }
        if (tab === 'favorite') {
            this._favFolders = null;
            Object.keys(this._cache).forEach(k => { if (k.startsWith('fav_')) delete this._cache[k]; });
        }
        this._loadTab(tab);
    }

    async _loadTab(tab) {
        if (this._loading) return;
        this._currentTab = tab;
        this._saveLastTab(tab);

        if (tab === 'following') {
            this._loading = true;
            this._showListLoading();
            try { await this._loadFollowing(); }
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
        const dur = v.duration || 0;
        return {
            bvid: v.bvid || '',
            aid: v.id || 0,
            title: v.title || '',
            cover: this._httpsCover(v.pic || ''),
            author: v.owner?.name || '',
            mid: v.owner?.mid || 0,
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
        this._bindFavFolderEvents(listEl);
        this._bindListItemEvents(listEl, items);

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

    async _loadFollowing() {
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
        const groupTabs = this._buildFollowGroupTabs();
        let items;

        if (this._activeGroupId === 'all') {
            const resp = await this._biliApi('/x/relation/followings', { vmid: this._userMid, ps: 50, pn: 1, order_type: 'attention' });
            items = (resp?.data?.list || []).map(u => this._normalizeFollowUser(u));
        } else {
            const resp = await this._biliApi('/x/relation/tag', { tagid: this._activeGroupId, ps: 50, pn: 1 });
            items = (resp?.data || []).map(u => this._normalizeFollowUser(u));
        }

        this._cache['following_' + this._activeGroupId] = items;
        listEl.innerHTML = groupTabs + this._renderFollowList(items);
        this._bindFollowGroupEvents(listEl);
        this._bindFollowItemEvents(listEl, items);
    }

    _buildFollowGroupTabs() {
        const groups = [{ tagid: 'all', name: '全部', count: 0 }];
        if (this._followGroups?.length) {
            const special = this._followGroups.find(g => g.tagid === -10);
            if (special) groups.push({ tagid: -10, name: '⭐ 特别关注', count: special.count || 0 });
            this._followGroups.filter(g => g.tagid > 0).forEach(g => {
                groups.push({ tagid: g.tagid, name: g.name, count: g.count || 0 });
            });
            const def = this._followGroups.find(g => g.tagid === 0);
            if (def) groups.push({ tagid: 0, name: '默认分组', count: def.count || 0 });
        }
        return `<div class="bili-follow-groups">${groups.map(g =>
            `<button class="bili-follow-group-btn${String(g.tagid) === String(this._activeGroupId) ? ' active' : ''}" data-gid="${g.tagid}">${this._esc(g.name)}${g.count ? `<span class="bili-fg-count">${g.count}</span>` : ''}</button>`
        ).join('')}</div>`;
    }

    _renderFollowList(items) {
        if (!items.length) return '<div class="bili-list-msg"><i class="fas fa-inbox"></i> 暂无关注</div>';
        return items.map((u, i) => `
            <div class="bili-follow-item" data-idx="${i}" data-mid="${u.mid}">
                <img class="bili-follow-avatar bili-follow-clickable" src="${this._esc(u.face)}" alt="" loading="lazy" title="查看主页">
                <div class="bili-follow-info bili-follow-clickable" title="查看主页">
                    <div class="bili-follow-name">
                        ${this._esc(u.uname)}
                        ${u.officialTitle ? `<span class="bili-follow-badge" title="${this._esc(u.officialTitle)}"><i class="fas fa-check-circle"></i></span>` : ''}
                        ${u.isVip ? '<span class="bili-follow-vip"><i class="fas fa-crown"></i></span>' : ''}
                    </div>
                    <div class="bili-follow-sign">${this._esc(u.sign || '这个人很懒，什么都没写~')}</div>
                </div>
                <button class="bili-follow-play-btn" title="查看最新视频"><i class="fas fa-play-circle"></i></button>
            </div>
        `).join('');
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
                this._loadTab('following');
            });
        });
    }

    _bindFollowItemEvents(listEl, items) {
        listEl.querySelectorAll('.bili-follow-play-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const mid = btn.closest('.bili-follow-item')?.dataset.mid;
                if (!mid) return;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                try {
                    const resp = await this._biliApi('/x/space/wbi/arc/search', { mid, ps: 5, pn: 1, order: 'pubdate' });
                    const videos = resp?.data?.list?.vlist || [];
                    if (videos.length) {
                        this._playItem(this._normalizeVideo({
                            bvid: videos[0].bvid,
                            title: videos[0].title,
                            pic: videos[0].pic,
                            owner: { name: videos[0].author, mid: parseInt(mid) },
                            duration: videos[0].length,
                            stat: { view: videos[0].play, danmaku: videos[0].video_review },
                        }));
                    }
                } catch (err) {
                    console.warn('[Bilibili] 获取 UP 主最新视频失败:', err.message);
                }
                btn.innerHTML = '<i class="fas fa-play-circle"></i>';
            });
        });

        listEl.querySelectorAll('.bili-follow-clickable').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = el.closest('.bili-follow-item');
                const mid = item?.dataset.mid;
                const idx = parseInt(item?.dataset.idx);
                if (!mid) return;
                const user = items[idx];
                this._loadUserSpace(mid, user?.uname || '');
                listEl.querySelectorAll('.bili-follow-item').forEach(fi => fi.classList.remove('playing'));
                item.classList.add('playing');
            });
        });
    }

    async _loadUserSpace(mid, uname) {
        const frame = this._el.querySelector('#bili-player-frame');
        const SANDBOX_SPACE = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
        if (this._loggedIn) await this._injectBiliCookies();
        frame.innerHTML = `<iframe src="https://space.bilibili.com/${mid}" sandbox="${SANDBOX_SPACE}" allowfullscreen></iframe>`;

        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        const info = this._el.querySelector('#bili-player-info');
        info.classList.remove('hidden');
        this._el.querySelector('#bili-pi-title').textContent = `${uname} 的个人空间`;
        this._el.querySelector('#bili-pi-author').textContent = uname;
        this._el.querySelector('#bili-pi-views').textContent = '';
        this._el.querySelector('#bili-pi-danmaku').textContent = '';
        this._el.querySelector('#bili-pi-date').style.display = 'none';
        this._el.querySelector('#bili-pi-meta-extra').style.display = 'none';
        this._currentVideo = { mid, uname, type: 'space' };
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
                <button class="bili-course-tab active" data-csrc="mine"><i class="fas fa-shopping-bag"></i> 已购课程</button>
                <button class="bili-course-tab" data-csrc="discover"><i class="fas fa-compass"></i> 发现课程</button>
            </div>`;
        listEl.innerHTML = courseTabsHtml + '<div class="bili-list-msg"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
        this._bindCourseTabEvents(listEl);
        await this._loadCourseContent('mine', listEl);
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
                    search_type: 'ketang', keyword: '课程', page: 1, order: 'totalrank'
                });
                const items = (resp?.data?.result || []).map(v => this._normalizeCourse(v));
                const itemsHtml = items.length
                    ? items.map((v, i) => this._renderCourseItem(v, i)).join('')
                    : '<div class="bili-list-msg"><i class="fas fa-inbox"></i> 暂无课程</div>';
                listEl.innerHTML = tabsHtml + itemsHtml;
                this._bindCourseTabEvents(listEl);
                this._bindListItemEvents(listEl, items);
            } catch (e) {
                listEl.innerHTML = tabsHtml + `<div class="bili-list-msg"><i class="fas fa-exclamation-circle"></i> ${this._esc(e.message)}</div>`;
                this._bindCourseTabEvents(listEl);
            }
        }
    }

    async _loadMyCoursesInPlayer() {
        const frame = this._el.querySelector('#bili-player-frame');
        if (this._loggedIn) await this._injectBiliCookies();
        frame.innerHTML = `<iframe src="https://www.bilibili.com/cheese/mine/list" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation" allowfullscreen></iframe>`;
        this._el.querySelector('#bili-player-info').classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._currentVideo = null;
        this._pendingSeek = null;
    }

    // ===================== Data Normalizers =====================

    _normalizeVideo(v) {
        const dur = v.duration || 0;
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
        const dur = v.duration || 0;
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
        return {
            bvid: v.bvid || '',
            aid: v.id || 0,
            title: v.title || '',
            cover: this._httpsCover(v.cover || ''),
            author: v.upper?.name || '',
            mid: v.upper?.mid || 0,
            duration: this._fmtDuration(v.duration || 0),
            durationSec: v.duration || 0,
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
        this._currentTab = '_search';
        this._showListLoading();
        try {
            const resp = await this._biliApi('/x/web-interface/wbi/search/all/v2', { keyword, page: 1 });
            const results = resp?.data?.result || [];
            const videoResult = results.find(r => r.result_type === 'video');
            const items = (videoResult?.data || []).map(v => ({
                bvid: v.bvid || '',
                aid: v.aid || v.id || 0,
                title: (v.title || '').replace(/<\/?em[^>]*>/g, ''),
                cover: this._httpsCover(v.pic || v.cover || ''),
                author: v.author || '',
                duration: v.duration || '',
                views: this._fmtNum(v.play || 0),
                danmaku: this._fmtNum(v.danmaku || 0),
                likes: this._fmtNum(v.like || 0),
                coins: '', favorites: this._fmtNum(v.favorites || 0), shares: '',
                pubdate: v.pubdate || 0,
                pubdateStr: this._fmtDate(v.pubdate || 0),
                tname: v.typename || '',
                progress: 0,
                progressSec: 0,
                totalPages: 1,
                watchPage: 0,
                type: 'video',
            }));
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
        el.innerHTML = `
            <div class="bili-topbar">
                <div class="bili-logo"><i class="fab fa-bilibili"></i><span>哔哩哔哩</span></div>
                <div class="bili-search">
                    <input type="text" placeholder="搜索视频、课程、UP主..." id="bili-search-input" maxlength="80">
                    <button id="bili-search-btn"><i class="fas fa-search"></i></button>
                </div>
                <div class="bili-nav-pills">
                    <button class="bili-pill active" data-tab="recommend"><i class="fas fa-thumbs-up"></i>推荐</button>
                    <button class="bili-pill" data-tab="popular"><i class="fas fa-fire"></i>热门</button>
                    <button class="bili-pill" data-tab="history"><i class="fas fa-history"></i>历史</button>
                    <button class="bili-pill" data-tab="watchlater"><i class="fas fa-clock"></i>稍后看</button>
                    <button class="bili-pill" data-tab="favorite"><i class="fas fa-star"></i>收藏</button>
                    <button class="bili-pill" data-tab="ranking"><i class="fas fa-trophy"></i>排行</button>
                    <button class="bili-pill" data-tab="course"><i class="fas fa-graduation-cap"></i>课程</button>
                    <button class="bili-pill" data-tab="following"><i class="fas fa-users"></i>关注</button>
                </div>
                <button class="bili-sidebar-toggle open" id="bili-sidebar-toggle" title="展开/收起列表"><i class="fas fa-columns"></i></button>
                <button class="bili-close-btn" id="bili-close-btn" title="关闭"><i class="fas fa-times"></i></button>
            </div>
            <div class="bili-main">
                <div class="bili-player-area">
                    <div class="bili-player-frame" id="bili-player-frame">
                        <div class="bili-player-empty"><i class="fab fa-bilibili"></i><p>从右侧列表中选择一个视频开始播放</p></div>
                    </div>
                    <div class="bili-now-playing hidden" id="bili-now-playing">
                        <i class="fas fa-play-circle bili-np-icon"></i>
                        <span class="bili-np-label">正在播放</span>
                        <span class="bili-np-title" id="bili-np-title"></span>
                        <span class="bili-np-episode" id="bili-np-episode"></span>
                    </div>
                    <div class="bili-ctrl-bar hidden" id="bili-ctrl-bar">
                        <div class="bili-ctrl-group">
                            <span class="bili-ctrl-label"><i class="fas fa-tachometer-alt"></i>倍速</span>
                            <div class="bili-speed-btns" id="bili-speed-btns">
                                <button class="bili-speed-btn" data-speed="0.5">0.5x</button>
                                <button class="bili-speed-btn" data-speed="0.75">0.75x</button>
                                <button class="bili-speed-btn active" data-speed="1">1.0x</button>
                                <button class="bili-speed-btn" data-speed="1.25">1.25x</button>
                                <button class="bili-speed-btn" data-speed="1.5">1.5x</button>
                                <button class="bili-speed-btn" data-speed="2">2.0x</button>
                                <button class="bili-speed-btn" data-speed="3">3.0x</button>
                            </div>
                        </div>
                        <div class="bili-ctrl-sep"></div>
                        <div class="bili-ctrl-group">
                            <span class="bili-ctrl-label"><i class="fas fa-film"></i>画质</span>
                            <div class="bili-quality-btns" id="bili-quality-btns">
                                <span class="bili-quality-hint">加载中...</span>
                            </div>
                        </div>
                    </div>
                    <div class="bili-player-info hidden" id="bili-player-info">
                        <div class="bili-pi-text">
                            <div class="bili-pi-title" id="bili-pi-title"></div>
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
                            <button class="bili-pi-btn" id="bili-act-like" title="点赞"><i class="fas fa-thumbs-up"></i>点赞</button>
                            <button class="bili-pi-btn" id="bili-act-later" title="稍后看"><i class="fas fa-clock"></i>稍后看</button>
                            <button class="bili-pi-btn bili-act-danger" id="bili-act-rm-later" title="移除稍后看"><i class="fas fa-times-circle"></i>移除稍后看</button>
                            <button class="bili-pi-btn bili-act-danger" id="bili-act-rm-fav" title="取消收藏"><i class="fas fa-heart-broken"></i>取消收藏</button>
                            <button class="bili-pi-btn" id="bili-act-comments" title="评论"><i class="fas fa-comments"></i>评论</button>
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
                    <div class="bili-stabs">
                        <div class="bili-stab active" data-tab="recommend"><i class="fas fa-thumbs-up"></i>推荐</div>
                        <div class="bili-stab" data-tab="popular"><i class="fas fa-fire"></i>热门</div>
                        <div class="bili-stab" data-tab="history"><i class="fas fa-history"></i>历史</div>
                        <div class="bili-stab" data-tab="watchlater"><i class="fas fa-clock"></i>稍后看</div>
                        <div class="bili-stab" data-tab="favorite"><i class="fas fa-star"></i>收藏</div>
                        <div class="bili-stab" data-tab="ranking"><i class="fas fa-trophy"></i>排行</div>
                        <div class="bili-stab" data-tab="course"><i class="fas fa-graduation-cap"></i>课程</div>
                        <div class="bili-stab" data-tab="following"><i class="fas fa-users"></i>关注</div>
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
            pill.addEventListener('click', () => { this._syncTabs(pill.dataset.tab); this._loadTab(pill.dataset.tab); });
        });
        el.querySelectorAll('.bili-stab').forEach(stab => {
            stab.addEventListener('click', () => { this._syncTabs(stab.dataset.tab); this._loadTab(stab.dataset.tab); });
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

        el.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        el.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); });

        el.querySelector('#bili-act-like').addEventListener('click', () => this._onActionLike());
        el.querySelector('#bili-act-later').addEventListener('click', () => this._onActionAddLater());
        el.querySelector('#bili-act-rm-later').addEventListener('click', () => this._onActionRemoveLater());
        el.querySelector('#bili-act-rm-fav').addEventListener('click', () => this._onActionRemoveFav());
        el.querySelector('#bili-act-comments').addEventListener('click', () => this._toggleComments());
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
            if (!e.data || typeof e.data.type !== 'string') return;
            if (e.data.type === 'bili-ext-state') {
                this._playerState = e.data;
                this._tryPendingSeek(e.data);
                if (e.data.bvid && e.data.page > 0 && e.data.currentTime > 5) {
                    const memKey = `${e.data.bvid}:${e.data.page}`;
                    if (memKey !== this._lastMemKey || Date.now() - (this._lastMemTs || 0) > 15000) {
                        this._lastMemKey = memKey;
                        this._lastMemTs = Date.now();
                        this._saveWatchMemory(e.data.bvid, e.data.page, Math.floor(e.data.currentTime));
                    }
                }
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

    _setSpeed(speed) {
        this._currentSpeed = speed;
        this._sendPlayerMsg({ type: 'bili-ext-set-speed', speed });
        this._updateSpeedUI();
        this._savePlayerPrefs();
    }

    _updateSpeedUI() {
        this._el.querySelectorAll('.bili-speed-btn').forEach(btn => {
            const s = parseFloat(btn.dataset.speed);
            btn.classList.toggle('active', s === this._currentSpeed);
        });
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
                if (qn >= 112) {
                    this._showBiliToast(`画质切换失败，可能需要大会员权限`, 'warn');
                } else if (qn >= 64) {
                    this._showBiliToast(`画质切换失败，可能需要登录B站`, 'warn');
                } else {
                    this._showBiliToast(`画质切换失败`, 'warn');
                }
            }
        }, 8000);
    }

    _markQualityPending(qn) {
        this._el.querySelectorAll('.bili-quality-btn').forEach(btn => {
            const q = parseInt(btn.dataset.quality);
            btn.classList.remove('active');
            if (q === qn) {
                btn.classList.add('pending');
            } else {
                btn.classList.remove('pending');
            }
        });
    }

    _showBiliToast(msg, type = 'info') {
        let toast = this._el?.querySelector('.bili-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'bili-toast';
            this._el?.querySelector('.bili-player-area')?.appendChild(toast);
        }
        toast.textContent = msg;
        toast.className = `bili-toast bili-toast-${type} bili-toast-show`;
        clearTimeout(this._biliToastTimer);
        this._biliToastTimer = setTimeout(() => toast.classList.remove('bili-toast-show'), 3000);
    }

    _updateQualityUI() {
        this._el.querySelectorAll('.bili-quality-btn').forEach(btn => {
            const q = parseInt(btn.dataset.quality);
            btn.classList.toggle('active', q === this._currentQuality);
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

        const container = this._el.querySelector('#bili-quality-btns');
        if (!container) return;
        container.innerHTML = available.map(qn => {
            const label = descriptions[qn] || String(qn);
            const isActive = qn === this._currentQuality ? ' active' : '';
            return `<button class="bili-quality-btn${isActive}" data-quality="${qn}">${this._esc(label)}</button>`;
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

    async _onActionLike() {
        const v = this._currentVideo;
        if (!v?.aid || !this._loggedIn) return;
        const btn = this._el.querySelector('#bili-act-like');
        btn.classList.toggle('active');
        try { await this._likeVideo(v.aid, btn.classList.contains('active') ? 1 : 2); }
        catch (e) { console.warn('[Bilibili] 点赞失败:', e.message); btn.classList.toggle('active'); }
    }

    async _onActionAddLater() {
        const v = this._currentVideo;
        if (!v?.aid || !this._loggedIn) return;
        const btn = this._el.querySelector('#bili-act-later');
        try {
            await this._addWatchlater(v.aid);
            btn.innerHTML = '<i class="fas fa-check"></i>已添加';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-clock"></i>稍后看'; }, 1500);
        } catch (e) { console.warn('[Bilibili] 添加稍后看失败:', e.message); }
    }

    async _onActionRemoveLater() {
        const v = this._currentVideo;
        if (!v?.aid || !this._loggedIn) return;
        const btn = this._el.querySelector('#bili-act-rm-later');
        try {
            await this._cancelWatchlater(v.aid);
            btn.innerHTML = '<i class="fas fa-check"></i>已移除';
            this._removeListItemByAid(v.aid);
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-times-circle"></i>移除稍后看'; }, 1500);
        } catch (e) { console.warn('[Bilibili] 移除稍后看失败:', e.message); }
    }

    async _onActionRemoveFav() {
        const v = this._currentVideo;
        if (!v?.aid || !this._loggedIn) return;
        const btn = this._el.querySelector('#bili-act-rm-fav');
        try {
            await this._cancelFavorite(v.aid);
            btn.innerHTML = '<i class="fas fa-check"></i>已取消';
            this._removeListItemByAid(v.aid);
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-heart-broken"></i>取消收藏'; }, 1500);
        } catch (e) { console.warn('[Bilibili] 取消收藏失败:', e.message); }
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
        this._commentPage = 1;
        this._loadComments();
    }

    _hideComments() {
        const panel = this._el.querySelector('#bili-comments');
        if (!panel) return;
        this._commentsOpen = false;
        panel.classList.add('hidden');
        this._el.querySelector('#bili-act-comments')?.classList.remove('active');
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
        this._el.querySelectorAll('.bili-pill').forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
        this._el.querySelectorAll('.bili-stab').forEach(s => s.classList.toggle('active', s.dataset.tab === tab));
    }

    _toggleSidebar() {
        this._sidebarOpen = !this._sidebarOpen;
        this._el.querySelector('#bili-sidebar').classList.toggle('visible', this._sidebarOpen);
        this._el.querySelector('#bili-sidebar-toggle').classList.toggle('open', this._sidebarOpen);
    }

    // ===================== Render =====================

    _showListLoading() {
        this._el.querySelector('#bili-list').innerHTML =
            '<div class="bili-list-msg"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    }

    _showListError(tab, msg) {
        const needLogin = ['history', 'watchlater', 'favorite', 'course', 'following'].includes(tab) && !this._loggedIn;
        this._el.querySelector('#bili-list').innerHTML = needLogin
            ? `<div class="bili-list-msg"><i class="fas fa-user-lock"></i> 请先在浏览器中<br>登录 bilibili.com<br><small>扩展自动共享浏览器登录状态</small></div>`
            : `<div class="bili-list-msg"><i class="fas fa-exclamation-circle"></i> ${this._esc(msg)}</div>`;
    }

    _renderList(tab, items) {
        if (tab === 'recommend') {
            this._renderRecommendList(items);
            return;
        }
        const listEl = this._el.querySelector('#bili-list');
        if (!items.length) {
            const needLogin = ['history', 'watchlater', 'favorite'].includes(tab) && !this._loggedIn;
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

    _renderVideoItem(v, idx, tab, showRemoveBtn) {
        const isPlaying = this._currentVideo?.bvid === v.bvid;
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
        return `<div class="bili-item${isPlaying ? ' playing' : ''}" data-idx="${idx}">
            ${rankHtml}
            <img class="bili-item-cover" src="${this._esc(v.cover)}" alt="" loading="lazy">
            <span class="bili-item-dur">${this._esc(v.duration)}</span>
            ${pagesBadge}
            <div class="bili-item-info">
                <div class="bili-item-title">${this._esc(v.title)}</div>
                <div class="bili-item-meta">
                    <span><i class="fas fa-user"></i> ${this._esc(v.author)}</span>
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
        return `<div class="bili-item" data-idx="${idx}">
            <img class="bili-item-cover" src="${this._esc(v.cover)}" alt="" loading="lazy">
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
        listEl.querySelectorAll('.bili-item').forEach(itemEl => {
            itemEl.addEventListener('click', (e) => {
                if (e.target.closest('.bili-item-rm-btn')) return;
                const idx = parseInt(itemEl.dataset.idx);
                const item = items[idx];
                if (item) this._playItem(item);
                listEl.querySelectorAll('.bili-item').forEach(el => el.classList.remove('playing'));
                itemEl.classList.add('playing');
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

    async _playItem(item) {
        if (!item.watchPage && item.bvid) {
            const mem = this._getWatchMemory(item.bvid);
            if (mem && mem.page > 1) {
                item.watchPage = mem.page;
                if (!item.progressSec && mem.time > 0) item.progressSec = mem.time;
            }
        }

        this._currentVideo = item;
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

        const info = this._el.querySelector('#bili-player-info');
        info.classList.remove('hidden');
        let titleText = item.title;
        if (item.totalPages > 1 && item.watchPage > 0) {
            titleText += ` [P${item.watchPage}/${item.totalPages}`;
            if (item.showTitle) titleText += ` ${item.showTitle}`;
            titleText += ']';
        }
        this._el.querySelector('#bili-pi-title').textContent = titleText;
        this._el.querySelector('#bili-pi-author').textContent = item.author;

        const viewsEl = this._el.querySelector('#bili-pi-views');
        const viewsIconEl = viewsEl?.parentElement?.querySelector('i');
        if (item.viewedAt && !item.views) {
            if (viewsIconEl) { viewsIconEl.className = 'fas fa-clock'; }
            viewsEl.textContent = item.viewedAt;
        } else {
            if (viewsIconEl) { viewsIconEl.className = 'fas fa-play'; }
            viewsEl.textContent = item.views || '';
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
            const el = this._el.querySelector(`#${id}`);
            if (!el) return;
            const span = el.querySelector('span');
            if (val) { span.textContent = val; el.style.display = ''; }
            else { el.style.display = 'none'; }
        };
        setMeta('bili-pi-likes', item.likes);
        setMeta('bili-pi-coins', item.coins);
        setMeta('bili-pi-favs', item.favorites);
        setMeta('bili-pi-shares', item.shares);
        setMeta('bili-pi-dur', item.duration);
        setMeta('bili-pi-bvid', item.bvid);
        setMeta('bili-pi-tname', item.tname);

        this._el.querySelector('#bili-act-like').classList.remove('active');

        const ctrlBar = this._el.querySelector('#bili-ctrl-bar');
        if (item.type !== 'course') {
            ctrlBar?.classList.remove('hidden');
            this._el.querySelector('#bili-quality-btns').innerHTML = '<span class="bili-quality-hint">加载中...</span>';
            this._qualityList = [];
            this._currentQuality = 0;
            this._pendingQuality = 0;
            this._qualityAutoApplied = false;
            clearTimeout(this._qualityFailTimer);
            if (this._currentSpeed !== 1) {
                setTimeout(() => this._setSpeed(this._currentSpeed), 2000);
            }
            setTimeout(() => {
                this._sendPlayerMsg({ type: 'bili-ext-get-quality' });
            }, 4000);
        } else {
            ctrlBar?.classList.add('hidden');
        }
    }

    // ===================== Show/Hide =====================

    show() {
        if (!this._el) return;
        this._panelOpen = true;
        this._el.classList.add('visible');
        document.body.classList.add('bili-panel-open');
    }

    hide() {
        if (!this._el) return;
        this._destroyAllIframes();
        clearTimeout(this._qualityVerifyTimer);
        clearTimeout(this._biliToastTimer);
        this._clearBiliCookieRules();
        this._panelOpen = false;
        this._el.classList.remove('visible');
        document.body.classList.remove('bili-panel-open');
    }

    _destroyAllIframes() {
        this._el.querySelectorAll('iframe').forEach(iframe => {
            try { iframe.src = 'about:blank'; } catch {}
            iframe.remove();
        });
        const frame = this._el.querySelector('#bili-player-frame');
        frame.innerHTML = '<div class="bili-player-empty"><i class="fab fa-bilibili"></i><p>从右侧列表中选择一个视频开始播放</p></div>';
        this._el.querySelector('#bili-player-info').classList.add('hidden');
        this._el.querySelector('#bili-ctrl-bar')?.classList.add('hidden');
        this._el.querySelector('#bili-now-playing')?.classList.add('hidden');
        this._hideComments();
        this._currentVideo = null;
        this._pendingSeek = null;
    }

    toggle() { this._panelOpen ? this.hide() : this.show(); }
    isOpen() { return this._panelOpen; }

    // ===================== Utils =====================

    _esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

    _httpsCover(url) {
        if (!url) return '';
        return url.replace(/^http:/, 'https:').replace(/^\/\//, 'https://');
    }

    _fmtDuration(sec) {
        if (!sec || sec <= 0) return '0:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
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
