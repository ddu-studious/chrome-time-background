/**
 * 哔哩哔哩集成控制器 v3.15.0
 * 技术方案：Embed Player + Cookie API + declarativeNetRequest Cookie 注入
 * 功能：热门/历史/稍后看/收藏/排行/课程/关注 七分类 + 搜索 + 嵌入播放器
 * v3.15.0: DNR Cookie 注入（解决嵌入播放器第三方 Cookie 隔离导致画质受限）
 *          + 允许跳转到 B 站站内 + 修复画质 toast 显示 [object Object]
 */
class BilibiliController {
    constructor() {
        this._el = null;
        this._panelOpen = false;
        this._sidebarOpen = true;
        this._currentTab = 'popular';
        this._currentVideo = null;
        this._loggedIn = false;
        this._userMid = 0;
        this._cache = {};
        this._loading = false;
        this._followGroups = null;
        this._activeGroupId = 'all';
        this._favFolderId = 0;
        this._currentSpeed = 1;
        this._currentQuality = 0;
        this._pendingQuality = 0;
        this._qualityList = [];
        this._qualityDescriptions = {};
        this._playerState = null;
    }

    async init() {
        this._injectDOM();
        this._bindEvents();
        try {
            const loginInfo = await this._checkLogin();
            this._loggedIn = loginInfo.loggedIn;
            this._userMid = loginInfo.mid;
        } catch { this._loggedIn = false; }
        if (this._loggedIn) {
            await this._injectBiliCookies();
        }
        try {
            await this._loadTab('popular');
        } catch (e) { console.warn('[Bilibili] 初始化加载失败:', e.message); }
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

    async _loadTab(tab) {
        if (this._loading) return;
        this._currentTab = tab;

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

        if (this._cache[tab]) {
            this._renderList(tab, this._cache[tab]);
            return;
        }

        this._loading = true;
        this._showListLoading();

        try {
            let items = [];
            switch (tab) {
                case 'popular':   items = await this._fetchPopular(); break;
                case 'history':   items = await this._fetchHistory(); break;
                case 'watchlater':items = await this._fetchWatchlater(); break;
                case 'favorite':  items = await this._fetchFavorite(); break;
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
        return (resp?.data?.list || []).map(v => this._normalizeVideo(v));
    }

    async _fetchFavorite() {
        if (!this._loggedIn) return [];
        const mid = this._userMid || (await this._checkLogin()).mid;
        if (!mid) return [];
        const foldersResp = await this._biliApi('/x/v3/fav/folder/created/list-all', { up_mid: mid });
        const folders = foldersResp?.data?.list || [];
        if (!folders.length) return [];
        this._favFolderId = folders[0].id;
        const listResp = await this._biliApi('/x/v3/fav/resource/list', { media_id: this._favFolderId, pn: 1, ps: 20 });
        return (listResp?.data?.medias || []).map(v => this._normalizeFav(v));
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
        if (this._cache['favorite']) {
            this._cache['favorite'] = this._cache['favorite'].filter(v => v.aid !== aid);
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
    }

    // ===================== Data Normalizers =====================

    _normalizeVideo(v) {
        return {
            bvid: v.bvid || '',
            aid: v.aid || 0,
            title: v.title || '',
            cover: this._httpsCover(v.pic || v.cover || ''),
            author: v.owner?.name || '',
            mid: v.owner?.mid || 0,
            duration: this._fmtDuration(v.duration || 0),
            durationSec: v.duration || 0,
            views: this._fmtNum(v.stat?.view || 0),
            danmaku: this._fmtNum(v.stat?.danmaku || 0),
            likes: this._fmtNum(v.stat?.like || 0),
            coins: this._fmtNum(v.stat?.coin || 0),
            favorites: this._fmtNum(v.stat?.favorite || 0),
            shares: this._fmtNum(v.stat?.share || 0),
            pubdate: v.pubdate || 0,
            pubdateStr: this._fmtDate(v.pubdate || 0),
            tname: v.tname || '',
            type: 'video',
        };
    }

    _normalizeHistory(v) {
        const h = v.history || {};
        return {
            bvid: h.bvid || v.bvid || '',
            aid: h.oid || v.aid || 0,
            title: v.title || '',
            cover: this._httpsCover(v.cover || ''),
            author: v.author_name || '',
            mid: v.author_mid || 0,
            duration: this._fmtDuration(v.duration || 0),
            durationSec: v.duration || 0,
            views: this._fmtNum(v.view_at || 0),
            danmaku: '',
            likes: '', coins: '', favorites: '', shares: '',
            pubdate: 0, pubdateStr: '',
            tname: v.tag_name || '',
            progress: v.progress > 0 && v.duration > 0 ? Math.round(v.progress / v.duration * 100) : 0,
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
                    <button class="bili-pill active" data-tab="popular"><i class="fas fa-fire"></i>热门</button>
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
                        </div>
                    </div>
                </div>
                <div class="bili-sidebar visible" id="bili-sidebar">
                    <div class="bili-stabs">
                        <div class="bili-stab active" data-tab="popular"><i class="fas fa-fire"></i>热门</div>
                        <div class="bili-stab" data-tab="history"><i class="fas fa-history"></i>历史</div>
                        <div class="bili-stab" data-tab="watchlater"><i class="fas fa-clock"></i>稍后看</div>
                        <div class="bili-stab" data-tab="favorite"><i class="fas fa-star"></i>收藏</div>
                        <div class="bili-stab" data-tab="ranking"><i class="fas fa-trophy"></i>排行</div>
                        <div class="bili-stab" data-tab="course"><i class="fas fa-graduation-cap"></i>课程</div>
                        <div class="bili-stab" data-tab="following"><i class="fas fa-users"></i>关注</div>
                    </div>
                    <div class="bili-list" id="bili-list"></div>
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

        window.addEventListener('message', (e) => {
            if (!e.data || typeof e.data.type !== 'string') return;
            if (e.data.type === 'bili-ext-state') {
                this._playerState = e.data;
                if (e.data.speed && e.data.speed !== this._currentSpeed) {
                    this._currentSpeed = e.data.speed;
                    this._updateSpeedUI();
                }
            } else if (e.data.type === 'bili-ext-quality-info') {
                this._onQualityInfo(e.data);
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
    }

    _updateSpeedUI() {
        this._el.querySelectorAll('.bili-speed-btn').forEach(btn => {
            const s = parseFloat(btn.dataset.speed);
            btn.classList.toggle('active', s === this._currentSpeed);
        });
    }

    _setQuality(qn) {
        this._pendingQuality = qn;
        this._sendPlayerMsg({ type: 'bili-ext-set-quality', quality: qn });
        this._markQualityPending(qn);
        const label = this._safeQualityLabel(this._qualityDescriptions, qn);
        this._showBiliToast(`切换画质: ${label}`, 'info');

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
        return `<div class="bili-item${isPlaying ? ' playing' : ''}" data-idx="${idx}">
            ${rankHtml}
            <img class="bili-item-cover" src="${this._esc(v.cover)}" alt="" loading="lazy">
            <span class="bili-item-dur">${this._esc(v.duration)}</span>
            <div class="bili-item-info">
                <div class="bili-item-title">${this._esc(v.title)}</div>
                <div class="bili-item-meta">
                    <span><i class="fas fa-user"></i> ${this._esc(v.author)}</span>
                    <span><i class="fas fa-play"></i> ${v.views}</span>
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
    }

    // ===================== Player =====================

    async _playItem(item) {
        this._currentVideo = item;
        const frame = this._el.querySelector('#bili-player-frame');
        const SANDBOX_PLAYER = 'allow-scripts allow-same-origin allow-forms allow-presentation allow-popups allow-popups-to-escape-sandbox';

        if (this._loggedIn) {
            await this._injectBiliCookies();
        }

        if (item.type === 'course' && item.seasonId) {
            frame.innerHTML = `<iframe src="https://www.bilibili.com/cheese/play/ss${item.seasonId}" sandbox="${SANDBOX_PLAYER}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
        } else if (item.bvid) {
            frame.innerHTML = `<iframe src="https://www.bilibili.com/video/${item.bvid}/" sandbox="${SANDBOX_PLAYER}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
        }

        const info = this._el.querySelector('#bili-player-info');
        info.classList.remove('hidden');
        this._el.querySelector('#bili-pi-title').textContent = item.title;
        this._el.querySelector('#bili-pi-author').textContent = item.author;
        this._el.querySelector('#bili-pi-views').textContent = item.views || '';
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
            clearTimeout(this._qualityFailTimer);
            if (this._currentSpeed !== 1) {
                setTimeout(() => this._setSpeed(this._currentSpeed), 2000);
            }
            setTimeout(() => this._sendPlayerMsg({ type: 'bili-ext-get-quality' }), 4000);
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
        this._currentVideo = null;
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
