(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.HuyaCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 虎牙网页与公开接口的固定入口。网页内容一律按不可信文本处理，只经过本模块白名单投影后进入界面或存储。
    const ORIGIN = 'https://www.huya.com';
    const FOLLOW_PAGE_URL = `${ORIGIN}/myfollow`;
    const FOLLOW_TAB_MARKER = '#tk-follow-';
    const LIVE_LIST_ENDPOINT = 'https://live.cdn.huya.com/liveHttpUI/getLiveList';
    const EMBED_ORIGIN = 'https://liveshare.huya.com';
    const LOGIN_COOKIE = 'udb_uid';
    const FOLLOW_CACHE_KEY = 'huyaFollowCache';
    const SETTINGS_KEY = 'huyaSettings';
    // 本机“最近观看”与“关注分组”：只存白名单字段，读取时重新校验，仅保存在 chrome.storage.local。
    const RECENT_KEY = 'huyaRecent';
    const GROUPS_KEY = 'huyaGroups';
    const RECENT_LIMIT = 30;
    const RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const GROUP_LIMIT = 12;
    const GROUP_NAME_MAX = 12;
    const GROUP_MEMBER_LIMIT = 400;
    const FOLLOW_CACHE_TTL_MS = 3 * 60 * 1000;
    const FOLLOW_MAX_ITEMS = 300;
    const FOLLOW_MAX_PAGES = 20;
    const FOLLOW_PAGE_TIMEOUT_MS = 40_000;
    // 弹窗里的房间页等待播放器控制条就绪、再点“剧场模式”的上限（页面通常几秒内就绪）。
    const THEATER_PAGE_TIMEOUT_MS = 45_000;
    const RECOMMEND_PAGE_SIZE = 120;
    const RECOMMEND_MAX_PAGES = 8;
    const RECOMMEND_MAX_ITEMS = 1000;

    // iGid 同时接受游戏 ID 与大类 ID；全部来自虎牙首页公开分类，2026-10-11 用公开列表接口逐项核对过非空结果。
    const CATEGORIES = Object.freeze([
        { id: 'hot', label: '热门推荐', gid: 0, icon: 'fas fa-fire' },
        { id: 'online', label: '网游竞技', gid: 100023, icon: 'fas fa-desktop' },
        { id: 'single', label: '单机热游', gid: 100002, icon: 'fas fa-gamepad' },
        { id: 'mobile', label: '手游休闲', gid: 100004, icon: 'fas fa-mobile-alt' },
        { id: 'fun', label: '娱乐天地', gid: 100022, icon: 'fas fa-microphone-alt' },
        { id: 'lol', label: '英雄联盟', gid: 1, icon: 'fas fa-shield-alt' },
        { id: 'wzry', label: '王者荣耀', gid: 2336, icon: 'fas fa-crown' },
        { id: 'peace', label: '和平精英', gid: 3203, icon: 'fas fa-crosshairs' },
        { id: 'outdoor', label: '户外', gid: 2165, icon: 'fas fa-mountain' },
    ].map(category => Object.freeze(category)));

    const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
    const IMAGE_HOST = /(^|\.)(msstatic\.com|huya\.com|myqcloud\.com)$/i;
    const RESIZABLE_IMAGE_HOST = /^(live-cover\.msstatic\.com|v-huya-img2\.msstatic\.com|image\.myqcloud\.com)$/i;
    const ROOM_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
    const EMBEDDABLE_HOST = /^[A-Za-z0-9]{1,64}$/;
    const POSITIVE_ID = /^[1-9]\d{0,19}$/;
    const ROOM_PATH = /^(?:[A-Za-z0-9_-]{1,64}|yy\/[1-9]\d{0,19}|video\/u\/[1-9]\d{0,19})$/;
    const STATUSES = new Set(['live', 'replay', 'offline']);

    function fail(code) {
        return Object.assign(new Error(code), { code });
    }

    function text(value, limit = 200) {
        return String(value ?? '').replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
    }

    function positiveInteger(value, fallback = 0) {
        const number = Number(value);
        return Number.isSafeInteger(number) && number > 0 ? number : fallback;
    }

    function parseCount(value) {
        const raw = text(value, 32).replace(/,/g, '');
        const match = raw.match(/^(\d+(?:\.\d+)?)\s*([万亿wW]?)\s*[人位]?$/);
        if (!match) return null;
        const unit = match[2];
        const multiplier = unit === '亿' ? 1e8 : (unit ? 1e4 : 1);
        const number = Math.round(Number(match[1]) * multiplier);
        return Number.isSafeInteger(number) ? number : null;
    }

    function formatCount(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) return '';
        const trim = amount => amount.toFixed(1).replace(/\.0$/, '');
        if (number >= 1e8) return `${trim(number / 1e8)}亿`;
        if (number >= 1e4) return `${trim(number / 1e4)}万`;
        return String(Math.round(number));
    }

    function safeImage(value) {
        const raw = text(value, 1000);
        if (!raw) return '';
        let url;
        try { url = new URL(raw, `${ORIGIN}/`); } catch { return ''; }
        if (url.protocol === 'http:') url.protocol = 'https:';
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !IMAGE_HOST.test(url.hostname)) return '';
        return url.href;
    }

    function thumbnail(value, width = 320, height = 180) {
        const safe = safeImage(value);
        if (!safe) return '';
        const url = new URL(safe);
        // 与虎牙网页自身一致：封面通过 OSS 参数缩放，列表不必下载约 150 KB 的 1080p 原图。
        if (RESIZABLE_IMAGE_HOST.test(url.hostname) && !url.searchParams.has('x-oss-process')) {
            const process = `x-oss-process=image/resize,limit_0,m_fill,w_${width},h_${height}/sharpen,80/format,jpg/interlace,1/quality,q_85`;
            url.search = url.search ? `${url.search}&${process}` : `?${process}`;
        }
        return url.href;
    }

    // 复刻虎牙页面 TT.createRoomHost(privateHost, roomId, yyid)：含字母的 privateHost 优先，其次房间号，最后 yy 路径。
    function createRoomHost(privateHost, roomId, yyid) {
        const privateText = text(privateHost, 64);
        if (privateText && /[^0-9]/.test(privateText)) return ROOM_SEGMENT.test(privateText) ? privateText : '';
        const room = positiveInteger(roomId);
        if (room) return String(room);
        const yy = privateText || String(positiveInteger(yyid) || '');
        return POSITIVE_ID.test(yy) ? `yy/${yy}` : '';
    }

    function parseRoomHref(value) {
        let url;
        try { url = new URL(text(value, 600), `${ORIGIN}/`); } catch { return null; }
        if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'www.huya.com' || url.username || url.password || url.port) return null;
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length === 1 && ROOM_SEGMENT.test(segments[0])) {
            return { kind: 'room', host: segments[0], path: segments[0] };
        }
        if (segments.length === 2 && segments[0] === 'yy' && POSITIVE_ID.test(segments[1])) {
            return { kind: 'yy', host: `yy/${segments[1]}`, path: `yy/${segments[1]}` };
        }
        if (segments.length === 3 && segments[0] === 'video' && segments[1] === 'u' && POSITIVE_ID.test(segments[2])) {
            return { kind: 'video', host: '', path: segments.join('/') };
        }
        return null;
    }

    // 先校验原始路径再拼接：URL 解析会把 ../ 折叠成合法路径，不能让它掩盖不可信输入。
    function roomUrl(path) {
        const value = String(path ?? '');
        return ROOM_PATH.test(value) ? `${ORIGIN}/${value}` : '';
    }

    function embedUrl(host) {
        return EMBEDDABLE_HOST.test(String(host || '')) ? `${EMBED_ORIGIN}/iframe/${host}` : '';
    }

    function buildLiveListUrl({ gid = 0, page = 1 } = {}) {
        const category = Number(gid);
        const pageNumber = Number(page);
        if (!Number.isSafeInteger(category) || category < 0 || category > 1e9) throw fail('huya-invalid-category');
        if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > RECOMMEND_MAX_PAGES) throw fail('huya-invalid-page');
        return `${LIVE_LIST_ENDPOINT}?iGid=${category}&iPageNo=${pageNumber}&iPageSize=${RECOMMEND_PAGE_SIZE}`;
    }

    function categoryById(id) {
        return CATEGORIES.find(category => category.id === id) || CATEGORIES[0];
    }

    function normalizeLiveList(payload) {
        if (!payload || typeof payload !== 'object' || !Array.isArray(payload.vList)) throw fail('huya-format-changed');
        const seen = new Set();
        const items = [];
        for (const raw of payload.vList.slice(0, RECOMMEND_PAGE_SIZE + 20)) {
            if (!raw || typeof raw !== 'object') continue;
            const nick = text(raw.sNick, 80);
            const uid = POSITIVE_ID.test(String(raw.lUid ?? '')) ? String(raw.lUid) : '';
            const host = createRoomHost(raw.sPrivateHost, raw.lProfileRoom, raw.lYyid);
            const id = uid ? `u${uid}` : (host ? `h${host}` : '');
            if (!nick || !id || !host || seen.has(id)) continue;
            seen.add(id);
            const viewers = Math.max(0, Number(raw.lUserCount ?? raw.lTotalCount) || 0);
            const locked = Boolean(Number(raw.iIsSecret) || Number(raw.iIsRoomPay));
            items.push({
                id,
                uid,
                source: 'recommend',
                nick,
                title: text(raw.sIntroduction || raw.sRoomName || `${nick}的直播间`, 120),
                game: text(raw.sGameFullName, 40),
                avatar: safeImage(raw.sAvatar180 || raw.sAvatar),
                cover: thumbnail(raw.sScreenshot),
                status: 'live',
                viewers,
                viewersLabel: formatCount(viewers),
                followersLabel: '',
                schedule: '',
                host,
                url: roomUrl(host),
                embedHost: locked ? '' : (EMBEDDABLE_HOST.test(host) ? host : ''),
                locked,
            });
        }
        return {
            items,
            page: positiveInteger(payload.iPageNo, 1),
            totalPages: positiveInteger(payload.iTotalPage, 1),
        };
    }

    function mergeUnique(existing = [], incoming = [], limit = RECOMMEND_MAX_ITEMS) {
        const seen = new Set();
        const merged = [];
        for (const item of [...existing, ...incoming]) {
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            merged.push(item);
            if (merged.length >= limit) break;
        }
        return merged;
    }

    function followItem(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const link = parseRoomHref(raw.href ?? raw.url);
        const nick = text(raw.nick, 80);
        const uid = POSITIVE_ID.test(String(raw.uid ?? '')) ? String(raw.uid) : '';
        const id = uid ? `u${uid}` : (link?.path ? `h${link.path}` : '');
        if (!nick || !id) return null;
        const status = STATUSES.has(raw.status) ? raw.status : (raw.live ? 'live' : (raw.replay ? 'replay' : 'offline'));
        const viewers = Number.isFinite(Number(raw.viewers)) && raw.viewers !== null && raw.viewers !== ''
            ? Math.max(0, Number(raw.viewers))
            : parseCount(raw.viewers);
        const followers = parseCount(raw.followers);
        const storedLabel = /^\d+(?:\.\d)?[万亿]?$/.test(text(raw.followersLabel, 24)) ? text(raw.followersLabel, 24) : '';
        const host = link?.kind === 'room' ? link.host : '';
        // 虎牙对长期不开播的主播使用占位截图，不是真实封面，留给界面显示统一占位。
        const cover = /default_screenshot/i.test(String(raw.cover || '')) ? '' : thumbnail(raw.cover);
        return {
            id,
            uid,
            source: 'follow',
            nick,
            title: text(raw.title, 120),
            game: '',
            avatar: safeImage(raw.avatar),
            cover,
            status,
            viewers: status === 'live' && viewers !== null ? viewers : null,
            viewersLabel: status === 'live' && viewers !== null ? formatCount(viewers) : '',
            followersLabel: storedLabel || (followers !== null ? formatCount(followers) : ''),
            schedule: text(raw.schedule, 100),
            host: link?.host || '',
            url: link ? `${ORIGIN}/${link.path}` : '',
            embedHost: status !== 'offline' && EMBEDDABLE_HOST.test(host) ? host : '',
            locked: false,
        };
    }

    function normalizeFollowSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.items)
            || snapshot.items.length > FOLLOW_MAX_ITEMS + 50) throw fail('huya-format-changed');
        const seen = new Set();
        const items = [];
        for (const raw of snapshot.items) {
            const item = followItem(raw);
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            items.push(item);
            if (items.length >= FOLLOW_MAX_ITEMS) break;
        }
        // 页面已经出现关注项却一个也不能识别，说明结构变化；不能把它显示成“没有关注”。
        if (snapshot.items.length > 0 && items.length === 0) throw fail('huya-format-changed');
        return { items, complete: snapshot.complete !== false && snapshot.items.length <= FOLLOW_MAX_ITEMS };
    }

    function sanitizeFollowCache(entry, account, now = Date.now()) {
        if (!entry || typeof entry !== 'object' || typeof account !== 'string' || entry.account !== account) return null;
        const fetchedAt = Number(entry.fetchedAt);
        if (!Number.isFinite(fetchedAt) || fetchedAt <= 0 || fetchedAt > now + 60_000) return null;
        if (!Array.isArray(entry.items) || entry.items.length > FOLLOW_MAX_ITEMS) return null;
        const seen = new Set();
        const items = [];
        for (const raw of entry.items) {
            const item = followItem({ ...raw, href: raw?.url, followersLabel: raw?.followersLabel });
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            items.push(item);
        }
        return { account, fetchedAt, items, complete: entry.complete !== false };
    }

    function groupFollowItems(items = []) {
        const groups = { live: [], replay: [], offline: [] };
        for (const item of items) (groups[item.status] || groups.offline).push(item);
        return groups;
    }

    // 关注列表的本地检索：只在已经白名单投影过的昵称、标题、游戏里匹配，不发任何网络请求。
    // 查询按空白拆成词，每个词都要命中（NFKC 归一化后不区分大小写与全半角）。
    function normalizeQuery(value) {
        return String(value ?? '').replace(CONTROL_CHARACTERS, ' ').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
    }

    function filterItems(items = [], query = '') {
        const list = Array.isArray(items) ? items : [];
        const tokens = normalizeQuery(query).split(' ').filter(Boolean);
        if (!tokens.length) return list.slice();
        return list.filter(item => {
            const haystack = normalizeQuery(`${item?.nick || ''} ${item?.title || ''} ${item?.game || ''}`);
            return tokens.every(token => haystack.includes(token));
        });
    }

    // 人气从高到低；没有人气数据的排在最后。稳定排序：并列时保持虎牙原有顺序。
    function sortByViewers(items = []) {
        const rank = item => (Number.isFinite(item?.viewers) ? item.viewers : -1);
        return (Array.isArray(items) ? items : [])
            .map((item, index) => ({ item, index }))
            .sort((a, b) => (rank(b.item) - rank(a.item)) || (a.index - b.index))
            .map(entry => entry.item);
    }

    // 条目 id 只有两种来源：u<uid>，或 h<房间路径>。本机存储里的分组成员和观看记录都用它；其他形状一律不是本模块生成的。
    function isItemId(value) {
        const raw = String(value ?? '');
        if (/^u[1-9]\d{0,19}$/.test(raw)) return true;
        return raw.length > 1 && raw[0] === 'h' && ROOM_PATH.test(raw.slice(1));
    }

    // ---- 打开方式：弹窗观看是默认，内嵌播放必须由用户明确选择 ----
    // 虎牙官方嵌入页对站外播放有试看限制（每天累计约 5 分钟），连续观看只能走官方页面，所以没有明确选择时默认弹窗。
    // “明确选择”：用户点过“弹窗优先”开关（openModeChosen === true）且保存的值是两个合法取值之一。
    // 旧版本每次保存偏好都会自动写入 openMode，却没有这个标记，所以不算选择；损坏的取值同样不算。
    function isOpenModeChosen(settings) {
        const stored = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
        return stored.openModeChosen === true && (stored.openMode === 'embed' || stored.openMode === 'popup');
    }

    // 只有明确选择了 'embed' 才内嵌；其余情况一律回到默认弹窗。
    function resolveOpenMode(settings) {
        return isOpenModeChosen(settings) && settings.openMode === 'embed' ? 'embed' : 'popup';
    }

    // ---- 最近观看：用户在工作台里实际打开过的直播间。只存白名单字段，仅保存在本机 ----

    function recentEntry(item, watchedAt) {
        if (!item || typeof item !== 'object') return null;
        const id = String(item.id ?? '');
        const link = parseRoomHref(item.url);
        const nick = text(item.nick, 80);
        if (!isItemId(id) || !link || !nick) return null;
        if (!Number.isSafeInteger(watchedAt) || watchedAt <= 0) return null;
        return {
            id,
            uid: POSITIVE_ID.test(String(item.uid ?? '')) ? String(item.uid) : '',
            nick,
            title: text(item.title, 120),
            game: text(item.game, 40),
            avatar: safeImage(item.avatar),
            cover: /default_screenshot/i.test(String(item.cover || '')) ? '' : thumbnail(item.cover),
            host: link.host,
            url: `${ORIGIN}/${link.path}`,
            locked: item.locked === true,
            watchedAt,
        };
    }

    // 读取本机存储的记录：逐条重新校验，来自未来或超过期限的记录不可信，直接丢弃；同一主播只保留最新一条。
    function sanitizeRecent(value, now = Date.now()) {
        const raw = Array.isArray(value) ? value : (value && Array.isArray(value.items) ? value.items : []);
        const seen = new Set();
        const items = [];
        for (const candidate of raw.slice(0, RECENT_LIMIT * 4)) {
            const entry = recentEntry(candidate, Number(candidate?.watchedAt));
            if (!entry || entry.watchedAt > now + 60_000 || now - entry.watchedAt > RECENT_TTL_MS) continue;
            items.push(entry);
        }
        items.sort((left, right) => right.watchedAt - left.watchedAt);
        return items.filter(entry => (seen.has(entry.id) ? false : (seen.add(entry.id), true))).slice(0, RECENT_LIMIT);
    }

    // 新的观看移到最前；item 无法打开（没有合法房间地址）时原样返回已有记录。
    function mergeRecent(list = [], item, now = Date.now()) {
        const current = sanitizeRecent(list, now);
        const entry = recentEntry(item, now);
        if (!entry) return current;
        return [entry, ...current.filter(existing => existing.id !== entry.id)].slice(0, RECENT_LIMIT);
    }

    function removeRecent(list = [], id) {
        return (Array.isArray(list) ? list : []).filter(entry => entry?.id !== id);
    }

    // 记录没有直播状态：状态是“未知”，不能被界面当成“直播中”；能否内嵌由房间标识和是否加密决定。
    function recentToItem(entry) {
        const host = entry.host;
        return {
            id: entry.id,
            uid: entry.uid,
            source: 'recent',
            nick: entry.nick,
            title: entry.title || `${entry.nick}的直播间`,
            game: entry.game,
            avatar: entry.avatar,
            cover: entry.cover,
            status: 'unknown',
            viewers: null,
            viewersLabel: '',
            followersLabel: '',
            schedule: '',
            host,
            url: entry.url,
            embedHost: !entry.locked && EMBEDDABLE_HOST.test(host) ? host : '',
            locked: entry.locked,
            watchedAt: entry.watchedAt,
        };
    }

    // 用调用方已经读到的、足够新的直播数据补上当前状态；没有数据就保持“未知”，不去猜测是否在播。
    // 同一主播在多个来源里出现时，直播中优先于重播，重播优先于未开播。
    function enrichRecent(entries = [], liveItems = []) {
        const rank = status => ({ live: 3, replay: 2, offline: 1 })[status] || 0;
        const index = new Map();
        for (const live of Array.isArray(liveItems) ? liveItems : []) {
            if (!live || !live.id || !rank(live.status)) continue;
            const known = index.get(live.id);
            if (!known || rank(live.status) > rank(known.status)) index.set(live.id, live);
        }
        return (Array.isArray(entries) ? entries : []).map(entry => {
            const base = recentToItem(entry);
            const live = index.get(entry.id);
            if (!live) return base;
            const viewers = Number.isFinite(live.viewers) && live.viewers >= 0 ? live.viewers : null;
            return {
                ...base,
                status: live.status,
                viewers: live.status === 'live' ? viewers : null,
                viewersLabel: live.status === 'live' && viewers !== null ? formatCount(viewers) : '',
                title: text(live.title, 120) || base.title,
                game: text(live.game, 40) || base.game,
                avatar: safeImage(live.avatar) || base.avatar,
                cover: safeImage(live.cover) || base.cover,
                embedHost: live.status !== 'offline' ? base.embedHost : '',
            };
        });
    }

    // ---- 关注分组：用户在本机给已关注的主播打的分类标签（虎牙的关注列表里没有游戏字段，无法自动按游戏分类） ----

    const GROUP_ID = /^g[a-z0-9]{3,18}$/;

    function normalizeGroupName(value) {
        return text(value, 60);
    }

    function groupNameKey(name) {
        return normalizeQuery(name);
    }

    // 读取本机存储的分组：整体丢弃不合法的组、重复的 id / 名称、不合法或重复的成员，超过上限的部分截断。
    function sanitizeGroups(value) {
        const raw = Array.isArray(value) ? value : (value && Array.isArray(value.groups) ? value.groups : []);
        const ids = new Set();
        const names = new Set();
        const groups = [];
        for (const entry of raw.slice(0, GROUP_LIMIT * 3)) {
            if (groups.length >= GROUP_LIMIT) break;
            if (!entry || typeof entry !== 'object') continue;
            const id = GROUP_ID.test(String(entry.id ?? '')) ? String(entry.id) : '';
            const name = normalizeGroupName(entry.name);
            const key = groupNameKey(name);
            if (!id || !name || !key || Array.from(name).length > GROUP_NAME_MAX || ids.has(id) || names.has(key)) continue;
            const seen = new Set();
            const members = [];
            for (const member of Array.isArray(entry.members) ? entry.members : []) {
                const memberId = String(member ?? '');
                if (!isItemId(memberId) || seen.has(memberId)) continue;
                seen.add(memberId);
                members.push(memberId);
                if (members.length >= GROUP_MEMBER_LIMIT) break;
            }
            ids.add(id);
            names.add(key);
            groups.push({ id, name, members });
        }
        return { groups };
    }

    function newGroupId(existing, random = Math.random, now = Date.now) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const id = `g${Math.floor(now()).toString(36).slice(-6)}${Math.floor(random() * 36 ** 3).toString(36).padStart(3, '0')}`;
            if (GROUP_ID.test(id) && !existing.has(id)) return id;
        }
        return '';
    }

    function checkGroupName(groups, value, exceptId = '') {
        const name = normalizeGroupName(value);
        if (!name || !groupNameKey(name)) return { ok: false, code: 'group-name-empty' };
        if (Array.from(name).length > GROUP_NAME_MAX) return { ok: false, code: 'group-name-long' };
        const key = groupNameKey(name);
        if (groups.some(group => group.id !== exceptId && groupNameKey(group.name) === key)) return { ok: false, code: 'group-name-duplicate' };
        return { ok: true, name };
    }

    // 以下操作都是纯函数：返回 { ok, state, ... } 或 { ok: false, code }，不修改传入的状态。
    function addGroup(state, value, options = {}) {
        const groups = sanitizeGroups(state).groups;
        if (groups.length >= GROUP_LIMIT) return { ok: false, code: 'group-limit' };
        const checked = checkGroupName(groups, value);
        if (!checked.ok) return checked;
        const id = options.id && GROUP_ID.test(options.id) && !groups.some(group => group.id === options.id)
            ? options.id
            : newGroupId(new Set(groups.map(group => group.id)), options.random, options.now);
        if (!id) return { ok: false, code: 'group-limit' };
        const group = { id, name: checked.name, members: [] };
        return { ok: true, state: { groups: [...groups, group] }, group };
    }

    function renameGroup(state, id, value) {
        const groups = sanitizeGroups(state).groups;
        if (!groups.some(group => group.id === id)) return { ok: false, code: 'group-missing' };
        const checked = checkGroupName(groups, value, id);
        if (!checked.ok) return checked;
        const next = groups.map(group => (group.id === id ? { ...group, name: checked.name } : group));
        return { ok: true, state: { groups: next }, group: next.find(group => group.id === id) };
    }

    function deleteGroup(state, id) {
        const groups = sanitizeGroups(state).groups;
        if (!groups.some(group => group.id === id)) return { ok: false, code: 'group-missing' };
        return { ok: true, state: { groups: groups.filter(group => group.id !== id) } };
    }

    function setGroupMember(state, groupId, memberId, on) {
        const groups = sanitizeGroups(state).groups;
        const target = groups.find(group => group.id === groupId);
        if (!target) return { ok: false, code: 'group-missing' };
        if (!isItemId(memberId)) return { ok: false, code: 'group-member-invalid' };
        const has = target.members.includes(memberId);
        if (on && !has && target.members.length >= GROUP_MEMBER_LIMIT) return { ok: false, code: 'group-member-limit' };
        const members = on ? (has ? target.members : [...target.members, memberId]) : target.members.filter(member => member !== memberId);
        const next = groups.map(group => (group.id === groupId ? { ...group, members } : group));
        return { ok: true, state: { groups: next }, group: next.find(group => group.id === groupId) };
    }

    function groupsOfMember(state, memberId) {
        return sanitizeGroups(state).groups.filter(group => group.members.includes(memberId));
    }

    // 成员 id -> 所属分组名称。列表有几百张卡片，渲染时只建一次索引；传入的必须是已经 sanitizeGroups 过的状态。
    function membershipIndex(state) {
        const index = new Map();
        for (const group of Array.isArray(state?.groups) ? state.groups : []) {
            for (const member of Array.isArray(group?.members) ? group.members : []) {
                const names = index.get(member);
                if (names) names.push(group.name);
                else index.set(member, [group.name]);
            }
        }
        return index;
    }

    // 只按成员 id 过滤已读取的关注列表；分组本身不发任何网络请求。
    function filterByGroup(items = [], group = null) {
        const list = Array.isArray(items) ? items : [];
        if (!group || !Array.isArray(group.members)) return list.slice();
        const members = new Set(group.members);
        return list.filter(item => members.has(item?.id));
    }

    function parseLoginCookie(value) {
        const raw = String(value ?? '').trim();
        return /^[1-9]\d{0,19}$/.test(raw) ? raw : '';
    }

    // 以下函数会被 chrome.scripting.executeScript 序列化后注入虎牙“我的关注”页面执行：
    // 不得引用模块作用域变量，只读取页面 DOM，并只点击页面自己的“加载更多”。
    async function readFollowPage(options) {
        const settings = Object.assign({ timeoutMs: 40000, maxItems: 300, maxPages: 20, pollMs: 400 }, options || {});
        const deadline = Date.now() + settings.timeoutMs;
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const clean = (value, limit) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, limit);
        // 虎牙页面把关注列表渲染到 #J_MOD_LIST；“加载更多”与列表同属这个容器，避免误点页头同名按钮。
        const scope = () => document.getElementById('J_MOD_LIST') || document;
        const rows = () => Array.from(scope().querySelectorAll('li.subscribe-live-item'));
        const moreButton = () => scope().querySelector('.btn-more');
        // 虎牙在“请求失败”和“确实没有关注”时都会渲染同一个空列表提示，所以这里只能说页面没有给出列表。
        const emptyMarker = () => scope().querySelector('.subscribe-list-none');
        const exhausted = () => {
            const button = moreButton();
            return !button || button.classList.contains('all');
        };
        const textOf = (root, selector, limit) => {
            const element = root.querySelector(selector);
            return element ? clean(element.textContent, limit) : '';
        };
        const attributeOf = (root, selector, name, limit) => {
            const element = root.querySelector(selector);
            return element ? clean(element.getAttribute(name), limit) : '';
        };
        const imageOf = (root, selector) => {
            const element = root.querySelector(selector);
            return element ? clean(element.getAttribute('data-original') || element.getAttribute('src'), 800) : '';
        };

        while (Date.now() < deadline && !rows().length) {
            if (emptyMarker()) return { state: 'empty', items: [], pages: 0, complete: true };
            await sleep(settings.pollMs);
        }
        if (!rows().length) {
            return { state: emptyMarker() ? 'empty' : 'timeout', items: [], pages: 0, complete: false };
        }

        let pages = 1;
        while (pages < settings.maxPages && Date.now() < deadline && !exhausted() && rows().length < settings.maxItems) {
            const before = rows().length;
            moreButton().click();
            pages += 1;
            const waitUntil = Math.min(deadline, Date.now() + 8000);
            while (Date.now() < waitUntil && rows().length === before && !exhausted()) await sleep(settings.pollMs);
            if (rows().length === before) break;
        }

        const items = rows().slice(0, settings.maxItems).map(row => ({
            uid: clean(row.getAttribute('data-lp'), 24),
            href: attributeOf(row, 'a.video-info', 'href', 600) || attributeOf(row, 'a.nick', 'href', 600),
            cover: imageOf(row, 'img.pic'),
            avatar: imageOf(row, 'a.avatar img'),
            nick: textOf(row, 'a.nick', 80),
            title: textOf(row, 'a.intro', 160),
            live: Boolean(row.querySelector('.tag-living')),
            replay: Boolean(row.querySelector('.tag-replay')),
            viewers: textOf(row, '.num.total', 24),
            followers: textOf(row, '.num.activity', 24),
            schedule: textOf(row, '.schedule-msg', 100),
        }));
        return { state: 'ready', items, pages, complete: exhausted() && rows().length <= settings.maxItems };
    }

    // 同样会被 chrome.scripting.executeScript 序列化后注入弹窗里的虎牙房间页执行：不得引用模块作用域变量。
    // 它只做一件事：等虎牙自己的播放器控制条就绪后，点一下页面里的“剧场模式”按钮（#player-fullpage-btn），效果与用户手动点击相同
    // （body 加上 mode-page-theater，按钮变成“退出剧场”）。不读取或改写页面数据、存储与请求，也不碰其他元素。
    // 2026-10-14 在真实页面实测：该按钮的 DOM 在播放器脚本初始化前就已存在，但点击处理函数要等播放器把它显示出来（行内 style.display 被设为 block）才绑定，
    // 这两件事在同一时刻出现，比按钮出现晚约 1 秒；所以只在页面设置了 display 之后才点。点后按“按钮变成退出剧场 / body 带剧场类”核对，
    // 没生效才在间隔后再点，次数有上限，页面改版认不出时也不会来回切换。已经在剧场模式（含用户自己先点了）时不再点击。
    async function enterTheaterPage(options) {
        const settings = Object.assign({ timeoutMs: 45000, pollMs: 250, retryMs: 1500, maxClicks: 3 }, options || {});
        const deadline = Date.now() + settings.timeoutMs;
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const button = () => document.getElementById('player-fullpage-btn');
        // 剧场模式下按钮换成 player-narrowpage（标题“退出剧场”）；页面脚本再给 body 加 mode-page-theater，聊天叠在画面上时是 mode-page-full。
        const inTheater = target => {
            if (target && target.classList.contains('player-narrowpage')) return true;
            const body = document.body;
            return Boolean(body && (body.classList.contains('mode-page-theater') || body.classList.contains('mode-page-full')));
        };
        const clickable = target => Boolean(target)
            && target.classList.contains('player-fullpage-btn')
            && target.style.display !== '' && target.style.display !== 'none';

        let clicks = 0;
        let nextClickAt = 0;
        while (Date.now() < deadline) {
            const target = button();
            if (inTheater(target)) return { state: clicks ? 'entered' : 'already', clicks };
            const now = Date.now();
            if (now >= nextClickAt) {
                // 点满次数后又留足一个核对间隔仍没生效，就不再等了。
                if (clicks >= settings.maxClicks) break;
                if (clickable(target)) {
                    target.click();
                    clicks += 1;
                    nextClickAt = now + settings.retryMs;
                }
            }
            await sleep(settings.pollMs);
        }
        return { state: clicks ? 'unconfirmed' : 'timeout', clicks };
    }

    return Object.freeze({
        ORIGIN,
        FOLLOW_PAGE_URL,
        FOLLOW_TAB_MARKER,
        LIVE_LIST_ENDPOINT,
        EMBED_ORIGIN,
        LOGIN_COOKIE,
        FOLLOW_CACHE_KEY,
        SETTINGS_KEY,
        RECENT_KEY,
        GROUPS_KEY,
        RECENT_LIMIT,
        RECENT_TTL_MS,
        GROUP_LIMIT,
        GROUP_NAME_MAX,
        GROUP_MEMBER_LIMIT,
        FOLLOW_CACHE_TTL_MS,
        FOLLOW_MAX_ITEMS,
        FOLLOW_MAX_PAGES,
        FOLLOW_PAGE_TIMEOUT_MS,
        THEATER_PAGE_TIMEOUT_MS,
        RECOMMEND_PAGE_SIZE,
        RECOMMEND_MAX_PAGES,
        RECOMMEND_MAX_ITEMS,
        CATEGORIES,
        fail,
        text,
        parseCount,
        formatCount,
        safeImage,
        thumbnail,
        createRoomHost,
        parseRoomHref,
        roomUrl,
        embedUrl,
        buildLiveListUrl,
        categoryById,
        normalizeLiveList,
        mergeUnique,
        normalizeFollowSnapshot,
        sanitizeFollowCache,
        groupFollowItems,
        normalizeQuery,
        filterItems,
        sortByViewers,
        isItemId,
        isOpenModeChosen,
        resolveOpenMode,
        recentEntry,
        sanitizeRecent,
        mergeRecent,
        removeRecent,
        recentToItem,
        enrichRecent,
        normalizeGroupName,
        sanitizeGroups,
        addGroup,
        renameGroup,
        deleteGroup,
        setGroupMember,
        groupsOfMember,
        membershipIndex,
        filterByGroup,
        parseLoginCookie,
        readFollowPage,
        enterTheaterPage,
    });
});
