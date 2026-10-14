(function () {
    'use strict';

    const Core = window.HuyaCore;
    if (!Core) throw new Error('HuyaCore 必须先于 huya-controller.js 加载');

    const VIEWS = new Set(['follow', 'recent', 'recommend']);
    const RECOMMEND_TTL_MS = 60 * 1000;
    const LIST_FETCH_TIMEOUT_MS = 12_000;
    const FOLLOW_MESSAGE_TIMEOUT_MS = 90_000;
    const CACHE_MESSAGE_TIMEOUT_MS = 10_000;
    const FRAME_NOTICE_TIMEOUT_MS = 30_000;
    const RAIL_LIMIT = 14;
    // 官方嵌入页只需要脚本、同源存储与弹出窗口；没有 allow-top-navigation / allow-modals / allow-downloads。
    const PLAYER_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation';
    const PLAYER_ALLOW = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    const STATUS_LABELS = Object.freeze({ live: '直播中', replay: '重播中', offline: '未开播' });
    const IMMERSIVE_TITLE_OFF = '网页全屏：铺满整个扩展页面（不是浏览器全屏）';
    const IMMERSIVE_TITLE_ON = '退出网页全屏（Esc）';
    // 站外嵌入播放器的试看限制来自虎牙自己的播放器脚本与服务端配置，见 docs/technical/huya-app-20261011.md。
    // 2026-10-11 真实 Chrome 实测：匿名环境下从开始播放计 300 秒后暂停并出现“立即前往”，同一天换房间立即提示；画面实测 800×450（另一房间 1280×720），随房间与网络变化。
    const TRIAL_NOTE = '播放由虎牙官方嵌入页提供。虎牙对站外播放有试看限制：每天累计约 5 分钟（时长由虎牙决定，换房间不重置，通常次日恢复），清晰度档位也由嵌入页决定、可能低于官网；试看结束后画面会出现“立即前往”。想连续观看或无法播放时，请使用上方“弹窗观看”或“在虎牙打开”；右上角的“弹窗优先”决定点击直播间时直接弹窗，还是像现在这样在这里内嵌。';
    const POPUP_MAX_WIDTH = 1280;
    const POPUP_MAX_HEIGHT = 820;
    // 弹窗打开后等虎牙房间页提交的上限与轮询间隔；页内等待播放器就绪另有 Core.THEATER_PAGE_TIMEOUT_MS。
    const THEATER_COMMIT_TIMEOUT_MS = 30_000;
    const THEATER_POLL_MS = 200;
    const THEATER_MAX_INJECTIONS = 3;
    const SEARCH_DEBOUNCE_MS = 120;
    // “继续观看”提示只在最近一次观看后的这段时间内出现；最近观看里的主播状态只采用这段时间内读取过的数据，更早的一律显示“状态未知”。
    const RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;
    const LIVE_SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;
    const CONFIRM_WINDOW_MS = 5_000;
    const GROUP_ID_PATTERN = /^g[a-z0-9]{3,18}$/;

    const GROUP_MESSAGES = Object.freeze({
        'group-name-empty': '分组名称不能为空。',
        'group-name-long': `分组名称最多 ${Core.GROUP_NAME_MAX} 个字。`,
        'group-name-duplicate': '已经有同名的分组了。',
        'group-limit': `最多只能创建 ${Core.GROUP_LIMIT} 个分组。`,
        'group-missing': '这个分组已经不存在了，请关闭后重新打开。',
        'group-member-invalid': '无法为这位主播设置分组。',
        'group-member-limit': `这个分组已满（最多 ${Core.GROUP_MEMBER_LIMIT} 位主播）。`,
    });

    const ERROR_MESSAGES = Object.freeze({
        'huya-cookie-unavailable': '无法读取浏览器的虎牙登录状态。更新扩展后需要在 chrome://extensions 重新加载，并允许访问虎牙站点。',
        'huya-busy': '上一次读取还在进行，请稍候再试。',
        'huya-timeout': '虎牙页面加载太慢，没有在限定时间内给出关注列表。网络恢复后重试即可。',
        'huya-load-failed': '虎牙页面无法打开，请检查网络后重试。',
        'huya-redirected': '虎牙把页面跳转到了其他地址（可能需要重新登录）。请在浏览器里打开虎牙确认登录状态后重试。',
        'huya-tab-closed': '后台读取用的页面被提前关闭，请重试。',
        'huya-format-changed': '虎牙“我的关注”页面结构发生了变化，当前版本无法识别。热门推荐与播放不受影响。',
        'huya-read-failed': '读取关注列表失败，请稍后重试。',
        'huya-cancelled': '已取消读取。',
        'huya-forbidden': '关注列表只能在扩展新标签页中读取。',
        'huya-network': '连接虎牙失败。可能是网络暂时不通，请稍后重试。',
        'huya-http': '虎牙服务返回了异常状态，请稍后重试。',
        'request-timeout': '等待扩展后台响应超时，请重试。',
        'runtime-error': '扩展后台暂时不可用，请重新加载扩展后再试。',
        'background-unavailable': '当前页面没有扩展后台服务（例如本地预览）。关注列表需要在真实扩展中使用。',
    });

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[character]);
    }

    function relativeTime(timestamp, now = Date.now()) {
        const value = Number(timestamp);
        if (!Number.isFinite(value) || value <= 0) return '';
        const seconds = Math.max(0, Math.round((now - value) / 1000));
        if (seconds < 45) return '刚刚';
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes} 分钟前`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} 小时前`;
        return `${Math.round(hours / 24)} 天前`;
    }

    function errorMessage(code) {
        return ERROR_MESSAGES[code] || '请求未完成，请稍后重试。';
    }

    function groupErrorMessage(code) {
        return GROUP_MESSAGES[code] || '操作没有完成，请稍后重试。';
    }

    function safeLink(item) {
        const link = Core.parseRoomHref(item?.url);
        return link ? Core.roomUrl(link.path) : '';
    }

    function isEmbeddable(item) {
        return Boolean(item) && item.status !== 'offline' && !item.locked && Boolean(Core.embedUrl(item.embedHost));
    }

    function summarize(items = []) {
        const summary = { total: items.length, live: 0, replay: 0, offline: 0 };
        for (const item of items) summary[STATUS_LABELS[item?.status] ? item.status : 'offline'] += 1;
        return summary;
    }

    const OPEN_MODE_TITLE_OFF = '弹窗优先：开启后，点击直播间会直接在独立窗口观看（走虎牙官方页面，不受内嵌试看限制）';
    const OPEN_MODE_TITLE_ON = '弹窗优先已开启：点击直播间会在独立窗口观看；再点一次恢复为在这里内嵌播放';

    function resumeKey(entry) {
        return `${entry.id}:${entry.watchedAt}`;
    }

    // 播放器“返回”按钮上的来源名称。
    function originLabel(origin) {
        if (origin?.view === 'follow') return '我的关注';
        if (origin?.view === 'recent') return '最近观看';
        return Core.categoryById(origin?.categoryId).label;
    }

    const UNKNOWN_LABEL = '状态未知';
    const UNKNOWN_HINT = '最近没有读取到这个直播间的状态，点击会直接打开直播间';

    // options：popup（点击卡片会弹窗观看）、membership（成员 id → 分组名称，传入时关注卡片显示“分组”按钮）、removable（最近观看里可单条移除）、now。
    function cardMarkup(item, options = {}) {
        const unknown = item.status === 'unknown';
        const status = STATUS_LABELS[item.status] ? item.status : (unknown ? 'unknown' : 'live');
        const url = safeLink(item);
        const embeddable = isEmbeddable(item);
        const popup = embeddable && options.popup === true;
        const cover = Core.safeImage(item.cover);
        const avatar = Core.safeImage(item.avatar);
        const title = item.title || `${item.nick}的直播间`;
        const id = escapeHtml(item.id);
        const verb = embeddable ? (popup ? '弹窗观看' : '观看') : '在虎牙打开';
        const target = embeddable ? `data-hy-play="${id}"` : (url ? `data-hy-open="${id}"` : 'disabled');
        const badge = unknown
            ? `<span class="hy-badge hy-badge-unknown" title="${escapeHtml(UNKNOWN_HINT)}">${UNKNOWN_LABEL}</span>`
            : `<span class="hy-badge hy-badge-${status}">${status === 'live' ? '<i aria-hidden="true"></i>' : ''}${STATUS_LABELS[status]}</span>`;
        const lock = item.locked ? '<span class="hy-badge hy-badge-lock"><i class="fas fa-lock" aria-hidden="true"></i>需在虎牙观看</span>' : '';
        const viewers = status === 'live' && item.viewersLabel ? `<span class="hy-viewers" title="当前人气"><i class="fas fa-user" aria-hidden="true"></i>${escapeHtml(item.viewersLabel)}</span>` : '';
        const media = cover
            ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : '<span class="hy-card-placeholder"><i class="hy-tiger-icon" aria-hidden="true"></i></span>';
        const playIcon = embeddable ? (popup ? 'fa-window-restore' : 'fa-play') : 'fa-arrow-up-right-from-square';
        const meta = [item.nick, item.game].filter(Boolean).map(escapeHtml).join(' · ');
        const watched = item.source === 'recent' && item.watchedAt ? `上次观看 ${relativeTime(item.watchedAt, options.now) || '刚刚'}` : '';
        const extra = watched
            ? `<small class="hy-card-note">${escapeHtml(watched)}</small>`
            : (status === 'offline' && item.schedule
                ? `<small class="hy-card-note">${escapeHtml(item.schedule)}</small>`
                : (item.followersLabel && status !== 'live' ? `<small class="hy-card-note">${escapeHtml(item.followersLabel)} 关注</small>` : ''));
        const groupNames = item.source === 'follow' && typeof options.membership?.get === 'function' ? (options.membership.get(item.id) || []) : null;
        const tools = [];
        if (groupNames) {
            tools.push(`<button class="hy-card-tool${groupNames.length ? ' is-on' : ''}" type="button" data-hy-action="group-assign" data-hy-id="${id}" title="${escapeHtml(groupNames.length ? `分组：${groupNames.join('、')}` : '加入分组')}" aria-label="${escapeHtml(`设置${item.nick}的分组`)}"><i class="fas fa-tag" aria-hidden="true"></i></button>`);
        }
        if (options.removable) {
            tools.push(`<button class="hy-card-tool" type="button" data-hy-action="recent-remove" data-hy-id="${id}" title="从最近观看移除" aria-label="${escapeHtml(`从最近观看移除${item.nick}`)}"><i class="fas fa-xmark" aria-hidden="true"></i></button>`);
        }
        if (url) {
            tools.push(`<a class="hy-card-link" data-hy-link="${id}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="在虎牙打开" aria-label="在虎牙打开 ${escapeHtml(item.nick)}"><i class="fas fa-external-link-alt" aria-hidden="true"></i></a>`);
        }
        const hasTool = Boolean(groupNames) || options.removable === true;
        return `<article class="hy-card is-${status}${embeddable ? '' : ' is-external'}${hasTool ? ' has-tool' : ''}" role="listitem">`
            + `<button class="hy-card-media" type="button" ${target} aria-label="${verb} ${escapeHtml(item.nick)}：${escapeHtml(title)}">${media}${badge}${lock}${viewers}<span class="hy-play-badge"><i class="fas ${playIcon}" aria-hidden="true"></i></span></button>`
            + `<div class="hy-card-copy">${avatar ? `<img class="hy-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="hy-avatar is-empty"><i class="fas fa-user" aria-hidden="true"></i></span>'}`
            + `<div><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><span>${meta}</span>${extra}</div></div>`
            + `<div class="hy-card-actions">${tools.join('')}</div></article>`;
    }

    function cardOptions(options = {}) {
        return { popup: options.popup === true, membership: options.membership, removable: options.removable === true, now: options.now };
    }

    function gridMarkup(items, options = {}) {
        const cards = cardOptions(options);
        return `<div class="hy-grid" role="list">${items.map(item => cardMarkup(item, cards)).join('')}</div>`;
    }

    function stateMarkup({ icon = 'fa-circle-info', eyebrow = '', title, text = '', actions = '', tone = '' }) {
        return `<div class="hy-state${tone ? ` is-${tone}` : ''}" role="${tone === 'error' ? 'alert' : 'status'}"><i class="fas ${icon}" aria-hidden="true"></i>${eyebrow ? `<span class="hy-eyebrow">${escapeHtml(eyebrow)}</span>` : ''}<h3>${escapeHtml(title)}</h3>${text ? `<p>${escapeHtml(text)}</p>` : ''}${actions ? `<div class="hy-state-actions">${actions}</div>` : ''}</div>`;
    }

    function loadingMarkup(label) {
        return `<div class="hy-loading" role="status"><span aria-hidden="true"></span><p>${escapeHtml(label)}</p></div>`;
    }

    const HUYA_HOME_LINK = `<a class="hy-secondary" href="${Core.ORIGIN}/" target="_blank" rel="noopener noreferrer">打开虎牙 <i class="fas fa-external-link-alt" aria-hidden="true"></i></a>`;

    function loginMarkup() {
        return stateMarkup({
            icon: 'fa-user-lock',
            eyebrow: 'LOGIN REQUIRED',
            title: '还没有检测到虎牙登录',
            text: '关注列表只有登录虎牙后才存在。请先在浏览器新标签页登录虎牙，回到这里点击“我已登录”。扩展只检查虎牙的登录标记（udb_uid）来判断是否登录，不读取或保存密码和登录票据；关注列表由后台标签页读取虎牙“我的关注”页面显示的内容。',
            actions: `<a class="hy-primary" href="${Core.ORIGIN}/" target="_blank" rel="noopener noreferrer">登录虎牙 <i class="fas fa-external-link-alt" aria-hidden="true"></i></a><button class="hy-secondary" type="button" data-hy-action="refresh-follow">我已登录，重新读取</button><button class="hy-secondary" type="button" data-huya-view="recommend">先看看热门推荐</button>`,
        });
    }

    function failureMarkup(code, title = '关注列表读取失败') {
        return stateMarkup({
            icon: 'fa-triangle-exclamation',
            eyebrow: code,
            title,
            text: errorMessage(code),
            tone: 'error',
            actions: `<button class="hy-primary" type="button" data-hy-action="retry">重试</button>${HUYA_HOME_LINK}<button class="hy-secondary" type="button" data-huya-view="recommend">看看热门推荐</button>`,
        });
    }

    function emptyFollowMarkup() {
        return stateMarkup({
            icon: 'fa-heart-crack',
            title: '虎牙页面没有返回关注的主播',
            text: '这可能是你确实还没有关注主播，也可能是虎牙这次请求临时失败。可以重试，或先去热门推荐里找找感兴趣的直播间。',
            actions: `<button class="hy-primary" type="button" data-hy-action="refresh-follow">重新读取</button><button class="hy-secondary" type="button" data-huya-view="recommend">热门推荐</button>${HUYA_HOME_LINK}`,
        });
    }

    // 工具栏里的统计文字：有搜索词时显示命中数，否则显示直播中人数与更新时间。
    function followInfoMarkup(data, options = {}) {
        const all = Array.isArray(data?.items) ? data.items : [];
        // 选中分组时，统计的范围就是这个分组里仍在关注列表中的主播。
        const items = options.group ? Core.filterByGroup(all, options.group) : all;
        const scope = options.group ? `分组「${escapeHtml(options.group.name)}」· ` : '';
        const summary = summarize(items);
        if (Core.normalizeQuery(options.query)) {
            const matched = Core.filterItems(items, options.query);
            return `${scope}匹配 <strong>${matched.length}</strong> / ${summary.total} 位 · 其中 ${matched.filter(item => item.status === 'live').length} 位直播中`;
        }
        const updated = relativeTime(data?.fetchedAt, options.now);
        const updatedTitle = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString('zh-CN') : '';
        return `${scope}<strong>${summary.live}</strong> 位直播中 · 共 ${summary.total} 位${updated ? ` · <time title="${escapeHtml(updatedTitle)}">更新于${escapeHtml(updated)}</time>` : ''}`;
    }

    // 没有任何直播时，未开播列表就是全部内容，默认展开；否则默认折叠，由用户的展开选择决定。
    function shouldOpenOffline(options, summary) {
        return options.offlineOpen === true || (options.offlineOpen === undefined && summary.live + summary.replay === 0);
    }

    // 分组列表单独成块：搜索时只替换这一块，输入框与光标不受影响。
    function followGroupsMarkup(items, options = {}) {
        const scoped = options.group ? Core.filterByGroup(items, options.group) : items;
        const filtering = Boolean(Core.normalizeQuery(options.query));
        const matched = filtering ? Core.filterItems(scoped, options.query) : scoped;
        if (filtering && !matched.length) {
            return stateMarkup({
                icon: 'fa-search',
                title: '没有匹配的主播',
                text: `${options.group ? `分组「${options.group.name}」` : '关注列表'}里没有昵称、标题或游戏包含“${String(options.query).trim().slice(0, 40)}”的主播。`,
                actions: '<button class="hy-secondary" type="button" data-hy-action="clear-search">清除搜索</button>',
            });
        }
        if (options.group && !matched.length) {
            return stateMarkup({
                icon: 'fa-tag',
                title: `分组「${options.group.name}」里还没有主播`,
                text: '点击主播卡片右下角的标签按钮，就可以把他加入分组。分组里的主播如果已经取消关注，不会显示在这里。',
                actions: '<button class="hy-secondary" type="button" data-hy-action="group-filter" data-hy-group="">显示全部关注</button>',
            });
        }
        const groups = Core.groupFollowItems(matched);
        if (options.sort === 'viewers') {
            groups.live = Core.sortByViewers(groups.live);
            groups.replay = Core.sortByViewers(groups.replay);
        }
        const cards = cardOptions(options);
        const group = (key, label, list) => (list.length
            ? `<section class="hy-group is-${key}" aria-label="${label}"><header><h3>${label}</h3><span>${list.length}</span></header>${gridMarkup(list, cards)}</section>`
            : '');
        // 搜索时一定展开未开播：用户在找某个主播，不应该被折叠的分组藏住。
        const open = filtering || shouldOpenOffline(options, summarize(scoped));
        const offline = groups.offline.length
            ? `<details class="hy-group is-offline" data-hy-offline${open ? ' open' : ''}><summary><h3>未开播</h3><span>${groups.offline.length}</span></summary>${gridMarkup(groups.offline, cards)}</details>`
            : '';
        return `${group('live', '直播中', groups.live)}${group('replay', '重播中', groups.replay)}${offline}`;
    }

    // 关注分组筛选条：分组是用户在本机给主播打的标签（虎牙的关注列表里没有游戏字段）。选中状态用 aria-pressed 表达。
    // 分组人数：只统计仍在关注列表里的主播，筛选条与分组面板口径一致；没有传入关注列表时退回已保存的成员数。
    function groupCount(group, present) {
        return typeof present?.has === 'function' ? group.members.filter(id => present.has(id)).length : group.members.length;
    }

    function groupChipsMarkup(groupState, items = [], options = {}) {
        const groups = Array.isArray(groupState?.groups) ? groupState.groups : [];
        const present = new Set((Array.isArray(items) ? items : []).map(item => item.id));
        const active = options.group ? options.group.id : '';
        const chip = (id, label, total) => `<button type="button" class="hy-chip" data-hy-action="group-filter" data-hy-group="${escapeHtml(id)}" aria-pressed="${active === id}">${escapeHtml(label)} <em>${total}</em></button>`;
        if (!groups.length) {
            return '<div class="hy-chips"><span class="hy-chips-label"><i class="fas fa-tags" aria-hidden="true"></i>分组</span>'
                + '<button type="button" class="hy-chip hy-chip-manage" data-hy-action="group-manage"><i class="fas fa-plus" aria-hidden="true"></i> 新建分组</button>'
                + '<span class="hy-chips-hint">给关注的主播打上自己的标签，再按标签筛选（只保存在本机）</span></div>';
        }
        const total = present.size;
        const count = group => groupCount(group, present);
        return `<div class="hy-chips" role="group" aria-label="按分组筛选关注的主播"><span class="hy-chips-label"><i class="fas fa-tags" aria-hidden="true"></i>分组</span>${chip('', '全部', total)}${groups.map(group => chip(group.id, group.name, count(group))).join('')}`
            + '<button type="button" class="hy-chip hy-chip-manage" data-hy-action="group-manage"><i class="fas fa-pen" aria-hidden="true"></i> 管理</button></div>';
    }

    // 继续观看：只显示最近一次观看的直播间，由控制器决定是否显示（时间窗口、是否被用户隐藏）。
    function resumeMarkup(item, options = {}) {
        if (!item) return '';
        const embeddable = isEmbeddable(item);
        const url = safeLink(item);
        if (!embeddable && !url) return '';
        const id = escapeHtml(item.id);
        const when = relativeTime(item.watchedAt, options.now) || '刚刚';
        const popup = embeddable && options.popup === true;
        const button = embeddable
            ? `<button type="button" class="hy-primary" data-hy-play="${id}"><i class="fas ${popup ? 'fa-window-restore' : 'fa-play'}" aria-hidden="true"></i> ${popup ? '弹窗继续观看' : '继续观看'}</button>`
            : `<button type="button" class="hy-primary" data-hy-open="${id}">在虎牙打开 <i class="fas fa-external-link-alt" aria-hidden="true"></i></button>`;
        const label = item.title ? `${item.nick} · ${item.title}` : item.nick;
        return `<div class="hy-resume" role="region" aria-label="继续观看"><i class="hy-tiger-icon" aria-hidden="true"></i><div class="hy-resume-copy"><span>${escapeHtml(when)}看过</span><strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong></div>${button}`
            + '<button type="button" class="hy-resume-dismiss" data-hy-action="resume-dismiss" aria-label="隐藏继续观看提示" title="隐藏此提示"><i class="fas fa-xmark" aria-hidden="true"></i></button></div>';
    }

    // 最近观看：直播状态只在调用方传入足够新的数据时才有；否则显示“状态未知”，由用户点开确认。
    function recentMarkup(items, options = {}) {
        const days = Math.round(Core.RECENT_TTL_MS / 86_400_000);
        const toolbar = `<div class="hy-toolbar"><div class="hy-toolbar-main"><span class="hy-toolbar-info"><strong>${items.length}</strong> 个直播间 · 只保存在本机浏览器，最多 ${Core.RECENT_LIMIT} 个、保留 ${days} 天</span></div>`
            + `<div class="hy-toolbar-side"><button type="button" class="hy-link-button${options.clearArmed ? ' is-armed' : ''}" data-hy-action="clear-recent"${items.length ? '' : ' disabled'}>${options.clearArmed ? '再次点击确认清除' : '清除记录'}</button></div></div>`;
        if (!items.length) {
            return `${toolbar}${stateMarkup({
                icon: 'fa-clock-rotate-left',
                title: '还没有观看记录',
                text: '在这里内嵌播放、弹窗观看过的直播间会按时间记在这里，方便下次接着看。记录只保存在本机浏览器，随时可以清除。',
                actions: '<button class="hy-primary" type="button" data-huya-view="follow">看看我的关注</button><button class="hy-secondary" type="button" data-huya-view="recommend">热门推荐</button>',
            })}`;
        }
        return `${toolbar}${gridMarkup(items, { popup: options.popup, removable: true, now: options.now })}`;
    }

    function followMarkup(data, options = {}) {
        const items = Array.isArray(data?.items) ? data.items : [];
        const note = options.refreshing
            ? '<div class="hy-banner" role="status"><span class="hy-spinner" aria-hidden="true"></span>正在后台刷新直播状态（首次读取约需 10–20 秒），先显示上次的列表。</div>'
            : (options.notice ? `<div class="hy-banner is-warning" role="status"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>${escapeHtml(options.notice)}</div>` : '');
        const incomplete = data && data.complete === false
            ? '<div class="hy-banner is-warning" role="status"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>关注较多，仅读取了前面一部分；其余请到虎牙官网查看。</div>'
            : '';
        const search = `<label class="hy-search"><i class="fas fa-search" aria-hidden="true"></i><input type="search" data-hy-search value="${escapeHtml(String(options.query || '').slice(0, 40))}" placeholder="搜索主播、标题或游戏" aria-label="搜索关注的主播" maxlength="40" autocomplete="off" spellcheck="false"></label>`;
        const sort = `<button type="button" class="hy-secondary" data-hy-action="toggle-sort" aria-pressed="${options.sort === 'viewers'}" title="直播中和重播中的主播按人气从高到低排列"><i class="fas fa-fire" aria-hidden="true"></i> 按人气</button>`;
        const toolbar = `<div class="hy-toolbar"><div class="hy-toolbar-main"><button type="button" class="hy-secondary" data-hy-action="refresh-follow"${options.busy ? ' disabled' : ''}><i class="fas fa-sync-alt${options.busy ? ' is-spinning' : ''}" aria-hidden="true"></i> 刷新</button>${search}${sort}<span class="hy-toolbar-info">${followInfoMarkup(data, options)}</span></div><div class="hy-toolbar-side"><a href="${Core.FOLLOW_PAGE_URL}" target="_blank" rel="noopener noreferrer">虎牙关注页 <i class="fas fa-external-link-alt" aria-hidden="true"></i></a><button type="button" class="hy-link-button${options.clearArmed ? ' is-armed' : ''}" data-hy-action="clear-follow">${options.clearArmed ? '再次点击确认清除' : '清除缓存'}</button></div></div>`;
        return `${toolbar}${note}${incomplete}${options.resume || ''}${groupChipsMarkup(options.groups, items, options)}<div class="hy-follow-groups">${followGroupsMarkup(items, options)}</div>`;
    }

    function sheetCreateForm(kind, label) {
        return `<form class="hy-sheet-create" data-hy-sheet-form="${kind}"><input class="hy-sheet-input" type="text" name="name" maxlength="${Core.GROUP_NAME_MAX}" placeholder="新分组名称（最多 ${Core.GROUP_NAME_MAX} 个字）" aria-label="新分组名称" data-hy-group-new autocomplete="off" spellcheck="false"><button class="hy-secondary" type="submit">${label}</button></form>`;
    }

    // 分组面板只返回对话框本身，遮罩由控制器创建；输入框的 maxlength 只是提示，真正的校验在 HuyaCore 里。
    function assignSheetMarkup(item, groupState, options = {}) {
        const groups = Array.isArray(groupState?.groups) ? groupState.groups : [];
        const rows = groups.map(group => `<li class="hy-sheet-row"><label><input type="checkbox" data-hy-group-toggle="${escapeHtml(group.id)}"${group.members.includes(item.id) ? ' checked' : ''}><span>${escapeHtml(group.name)}</span></label><span class="hy-sheet-count">${groupCount(group, options.present)} 位</span></li>`).join('');
        return '<div class="hy-sheet" role="dialog" aria-modal="true" aria-labelledby="hy-sheet-title" data-hy-sheet="assign">'
            + `<h3 id="hy-sheet-title">设置分组 · ${escapeHtml(item.nick)}</h3>`
            + '<p>勾选后立即保存，只保存在本机浏览器。同一位主播可以同时属于多个分组。</p>'
            + (rows ? `<ul class="hy-sheet-list">${rows}</ul>` : '<p class="hy-sheet-empty">还没有分组，先在下面新建一个。</p>')
            + sheetCreateForm('create-join', '新建并加入')
            + `<p class="hy-sheet-error" role="alert" data-hy-sheet-error>${escapeHtml(options.error || '')}</p>`
            + '<div class="hy-sheet-actions"><button class="hy-primary" type="button" data-hy-action="sheet-close">完成</button></div></div>';
    }

    function manageSheetMarkup(groupState, options = {}) {
        const groups = Array.isArray(groupState?.groups) ? groupState.groups : [];
        const rows = groups.map(group => {
            const armed = options.armedId === group.id;
            const name = escapeHtml(group.name);
            return `<li class="hy-sheet-row"><input class="hy-sheet-input" type="text" value="${name}" maxlength="${Core.GROUP_NAME_MAX}" data-hy-group-name="${escapeHtml(group.id)}" aria-label="分组名称 ${name}（修改后按回车或离开输入框保存）" autocomplete="off" spellcheck="false">`
                + `<span class="hy-sheet-count">${groupCount(group, options.present)} 位</span>`
                + `<button class="hy-secondary${armed ? ' is-armed' : ''}" type="button" data-hy-action="group-delete" data-hy-group="${escapeHtml(group.id)}" aria-label="${armed ? '确认删除' : '删除'}分组 ${name}">${armed ? '确认删除' : '删除'}</button></li>`;
        }).join('');
        return '<div class="hy-sheet" role="dialog" aria-modal="true" aria-labelledby="hy-sheet-title" data-hy-sheet="manage">'
            + '<h3 id="hy-sheet-title">管理分组</h3>'
            + `<p>最多 ${Core.GROUP_LIMIT} 个分组，名称最多 ${Core.GROUP_NAME_MAX} 个字。删除分组不会取消关注，也不会影响虎牙上的任何数据。</p>`
            + (rows ? `<ul class="hy-sheet-list">${rows}</ul>` : '<p class="hy-sheet-empty">还没有分组。</p>')
            + sheetCreateForm('create', '新建分组')
            + `<p class="hy-sheet-error" role="alert" data-hy-sheet-error>${escapeHtml(options.error || '')}</p>`
            + '<div class="hy-sheet-actions"><button class="hy-primary" type="button" data-hy-action="sheet-close">完成</button></div></div>';
    }

    function recommendMarkup(category, entry, options = {}) {
        const items = entry?.items || [];
        const updated = relativeTime(entry?.fetchedAt, options.now);
        const hasMore = Boolean(entry) && entry.page < Math.min(entry.totalPages || 1, Core.RECOMMEND_MAX_PAGES);
        const refreshing = options.refreshing
            ? '<div class="hy-banner" role="status"><span class="hy-spinner" aria-hidden="true"></span>正在更新推荐，先显示上次的内容。</div>'
            : '';
        const warning = options.notice ? `<div class="hy-banner is-warning" role="status"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>${escapeHtml(options.notice)}</div>` : '';
        const toolbar = `<div class="hy-toolbar"><div class="hy-toolbar-main"><button type="button" class="hy-secondary" data-hy-action="refresh-recommend"${options.busy ? ' disabled' : ''}><i class="fas fa-sync-alt${options.busy ? ' is-spinning' : ''}" aria-hidden="true"></i> 刷新</button><span class="hy-toolbar-info">${escapeHtml(category.label)} · ${items.length} 个直播间${updated ? ` · 更新于${escapeHtml(updated)}` : ''}</span></div><div class="hy-toolbar-side"><a href="${Core.ORIGIN}/l" target="_blank" rel="noopener noreferrer">虎牙全部直播 <i class="fas fa-external-link-alt" aria-hidden="true"></i></a></div></div>`;
        const footer = `<div class="hy-footer" role="status">${hasMore ? `<button type="button" class="hy-secondary" data-hy-action="recommend-more"${options.moreBusy ? ' disabled' : ''}>${options.moreBusy ? '正在加载…' : '加载更多'}</button>` : (items.length ? '<span>已经到底了</span>' : '')}${options.moreError ? `<p>${escapeHtml(options.moreError)}</p>` : ''}</div>`;
        if (!items.length) {
            return `${toolbar}${warning}${stateMarkup({ icon: 'fa-inbox', title: '这个分类暂时没有直播', text: '可以稍后刷新，或切换其他分类。', actions: '<button class="hy-primary" type="button" data-hy-action="refresh-recommend">刷新</button>' })}`;
        }
        return `${toolbar}${options.resume || ''}${refreshing}${warning}${gridMarkup(items, { popup: options.popup, now: options.now })}${footer}`;
    }

    function railMarkup(items, current) {
        const candidates = items.filter(item => item.id !== current.id && isEmbeddable(item)).slice(0, RAIL_LIMIT);
        if (!candidates.length) return '';
        return `<section class="hy-rail" aria-label="继续浏览"><header><strong>继续浏览</strong><small>直接切换直播间</small></header><div class="hy-rail-track">${candidates.map(item => {
            const cover = Core.safeImage(item.cover);
            return `<button class="hy-rail-card" type="button" data-hy-play="${escapeHtml(item.id)}" aria-label="切换到 ${escapeHtml(item.nick)}：${escapeHtml(item.title)}"><span class="hy-rail-thumb">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<i class="hy-tiger-icon" aria-hidden="true"></i>'}${item.viewersLabel ? `<em>${escapeHtml(item.viewersLabel)}</em>` : ''}</span><span class="hy-rail-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.nick)}</small></span></button>`;
        }).join('')}</div></section>`;
    }

    // 弹窗观看后原位置显示的接力提示：嵌入页已移除，避免两路声音。
    function handoffMarkup(item, fromLabel = '列表') {
        return `<div class="hy-handoff" role="status"><i class="hy-tiger-icon" aria-hidden="true"></i><h3>已在独立窗口打开</h3><p>${escapeHtml(item.nick)} 的直播间正在虎牙官方页面里播放。这里的嵌入播放已经停止，避免两路声音。</p><div class="hy-state-actions"><button class="hy-primary" type="button" data-hy-action="resume-embed">回到这里观看</button><button class="hy-secondary" type="button" data-hy-action="back">返回${escapeHtml(fromLabel)}</button></div></div>`;
    }

    // 模式状态既写在标记里（首次渲染），也由控制器在切换时直接改 DOM：切换模式不能重绘舞台，否则 iframe 会重新加载。
    function playerMarkup(item, context = {}) {
        const src = Core.embedUrl(item.embedHost);
        const url = safeLink(item);
        const title = item.title || `${item.nick}的直播间`;
        const status = STATUS_LABELS[item.status] ? item.status : 'live';
        const meta = [item.nick, item.game, status === 'live' && item.viewersLabel ? `${item.viewersLabel} 人气` : STATUS_LABELS[status]].filter(Boolean).map(escapeHtml).join(' · ');
        const wide = context.wide !== false;
        const immersive = context.immersive === true;
        const fromLabel = escapeHtml(context.fromLabel || '列表');
        const immersiveTitle = immersive ? IMMERSIVE_TITLE_ON : IMMERSIVE_TITLE_OFF;
        const actions = [
            `<button type="button" class="hy-ctx-button${wide ? ' is-on' : ''}" data-hy-action="toggle-wide" aria-pressed="${wide}" title="宽屏：隐藏侧栏，放大播放器" aria-label="宽屏模式"><i class="fas fa-columns" aria-hidden="true"></i><span>宽屏</span></button>`,
            `<button type="button" class="hy-ctx-button${immersive ? ' is-on' : ''}" data-hy-action="toggle-immersive" aria-pressed="${immersive}" title="${immersiveTitle}" aria-label="网页全屏"><i class="fas ${immersive ? 'fa-compress' : 'fa-expand'}" aria-hidden="true"></i><span>网页全屏</span></button>`,
            `<button type="button" class="hy-ctx-button" data-hy-action="pop-out"${url ? '' : ' disabled'} title="在独立小窗口打开虎牙官方页面观看（不受站外试看限制）" aria-label="弹窗观看"><i class="far fa-window-restore" aria-hidden="true"></i><span>弹窗观看</span></button>`,
            url ? `<a class="hy-ctx-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="在虎牙打开" aria-label="在虎牙打开"><i class="fas fa-external-link-alt" aria-hidden="true"></i><span>在虎牙打开</span></a>` : '',
            `<button type="button" class="hy-ctx-button" data-hy-action="copy-link"${url ? '' : ' disabled'} title="复制直播间链接" aria-label="复制直播间链接"><i class="far fa-copy" aria-hidden="true"></i></button>`,
        ].join('');
        return `<div class="hy-player-layout"><div class="hy-player-context"><button type="button" class="hy-ctx-back" data-hy-action="back" aria-label="返回${fromLabel}"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>返回${fromLabel}</span></button>`
            + `<div class="hy-ctx-title"><strong data-hy-current-title title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small>${meta}</small></div><div class="hy-ctx-actions">${actions}</div></div>`
            + `<div class="hy-frame-wrap"><iframe class="hy-player-frame" src="${escapeHtml(src)}" title="${escapeHtml(item.nick)}的虎牙直播" sandbox="${PLAYER_SANDBOX}" allow="${PLAYER_ALLOW}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="hy-frame-loading" role="status"><span aria-hidden="true"></span><p>正在连接虎牙官方播放器…通常需要 10–20 秒</p></div>${context.toast ? `<div class="hy-toast" role="status" data-hy-toast>${escapeHtml(context.toast)}</div>` : ''}</div>`
            + `<p class="hy-trial-note" role="note"><i class="fas fa-circle-info" aria-hidden="true"></i><span>${escapeHtml(TRIAL_NOTE)}</span></p>`
            + `${railMarkup(context.rail || [], item)}</div>`;
    }

    // 弹窗尺寸：16:9 画面加窗口边框，受当前屏幕可用区域限制，避免超出屏幕。
    function popupSize(screenLike = {}) {
        const availWidth = Number(screenLike.availWidth) > 0 ? Number(screenLike.availWidth) : 1440;
        const availHeight = Number(screenLike.availHeight) > 0 ? Number(screenLike.availHeight) : 900;
        return {
            width: Math.round(Math.max(640, Math.min(POPUP_MAX_WIDTH, availWidth - 80))),
            height: Math.round(Math.max(420, Math.min(POPUP_MAX_HEIGHT, availHeight - 80))),
        };
    }

    // 优先用扩展窗口 API（能得到成功/失败结果、窗口 id 和里面唯一的标签页 id）；本地预览没有它时退回普通弹窗，此时 noopener 使 window.open 恒返回 null，只能视为已发起（没有窗口 id）。
    function createPopup(url, size) {
        return new Promise(resolve => {
            if (globalThis.chrome?.windows?.create) {
                try {
                    chrome.windows.create({ url, type: 'popup', width: size.width, height: size.height, focused: true }, created => {
                        const failed = Boolean(chrome.runtime?.lastError) || !created;
                        void chrome.runtime?.lastError;
                        const tab = !failed && Array.isArray(created.tabs) && created.tabs.length === 1 ? created.tabs[0] : null;
                        resolve({
                            ok: !failed,
                            windowId: !failed && Number.isInteger(created.id) ? created.id : null,
                            tabId: tab && Number.isInteger(tab.id) ? tab.id : null,
                        });
                    });
                } catch {
                    resolve({ ok: false, windowId: null, tabId: null });
                }
                return;
            }
            window.open(url, '_blank', `popup=yes,width=${size.width},height=${size.height},noopener,noreferrer`);
            resolve({ ok: true, windowId: null, tabId: null });
        });
    }

    function openPopupWindow(url, size) {
        return createPopup(url, size).then(result => result.ok);
    }

    // 调用扩展窗口/标签 API 并把回调转成 Promise；任何 lastError 或异常都按失败（null）处理。
    function chromeCall(namespace, method, ...args) {
        return new Promise(resolve => {
            try {
                const target = globalThis.chrome?.[namespace];
                if (typeof target?.[method] !== 'function') { resolve(null); return; }
                target[method](...args, result => {
                    const failed = Boolean(globalThis.chrome?.runtime?.lastError);
                    void globalThis.chrome?.runtime?.lastError;
                    resolve(failed ? null : (result ?? null));
                });
            } catch {
                resolve(null);
            }
        });
    }

    // 弹窗里的虎牙房间页提交后，一次性注入 HuyaCore.enterTheaterPage，替用户点虎牙自己的“剧场模式”按钮：
    // 播放器铺满窗口，与在官方页面里手动点击等效（用户可随时用该按钮或 Esc 退出，退出后不会再被拉回）。
    // 只面向本扩展刚创建或复用的弹窗标签页，且只注入已核对为 www.huya.com 的那一份文档（按 documentId 绑定，页面已经跳走就不会误注入别的页面）；
    // 不新增权限、不注册常驻内容脚本、不读取页面数据。任何一步失败都只是保持虎牙默认布局，不影响弹窗打开本身。
    // 等待次数与时间均有上限：等房间页提交最多 THEATER_COMMIT_TIMEOUT_MS，最多注入 THEATER_MAX_INJECTIONS 次（页面自己跳转替换文档时重新注入），页内等待按钮就绪另有上限。
    function createTheaterAssist(timing = {}) {
        const limits = { commitMs: THEATER_COMMIT_TIMEOUT_MS, pollMs: THEATER_POLL_MS, maxInjections: THEATER_MAX_INJECTIONS, pageMs: Core.THEATER_PAGE_TIMEOUT_MS, ...timing };
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        // 同一个标签页只保留最近一次请求；用户连点换房间时，前一次的等待立即作废。
        const generations = new Map();
        const pending = new Set();

        const mainFrame = tabId => chromeCall('webNavigation', 'getFrame', { tabId, frameId: 0 });
        const isHuyaDocument = frame => {
            if (!frame || typeof frame.documentId !== 'string' || !frame.documentId || frame.errorOccurred === true) return false;
            if ((frame.documentLifecycle || 'active') !== 'active') return false;
            try { return new URL(frame.url).origin === Core.ORIGIN; } catch { return false; }
        };

        async function run(tabId, previousDocumentId, generation) {
            const deadline = Date.now() + limits.commitMs;
            // 导航之前的旧文档、以及已经注入过的文档都不再注入。
            const tried = new Set([previousDocumentId]);
            let injections = 0;
            while (Date.now() < deadline && injections < limits.maxInjections) {
                if (generations.get(tabId) !== generation) return 'superseded';
                const frame = await mainFrame(tabId);
                if (!frame) {
                    if (!await chromeCall('tabs', 'get', tabId)) return 'closed';
                } else if (!tried.has(frame.documentId) && isHuyaDocument(frame)) {
                    tried.add(frame.documentId);
                    injections += 1;
                    const results = await chromeCall('scripting', 'executeScript', {
                        target: { tabId, documentIds: [frame.documentId] },
                        world: 'ISOLATED',
                        injectImmediately: true,
                        func: Core.enterTheaterPage,
                        args: [{ timeoutMs: limits.pageMs }],
                    });
                    const state = results?.[0]?.result?.state;
                    if (typeof state === 'string') return state;
                    // 注入失败（多半是页面自己跳转替换了文档）：回到循环，等新的文档。
                }
                await pause(limits.pollMs);
            }
            return 'timeout';
        }

        return {
            // 导航之前标签页里正在显示的文档标识：同一地址再次打开时地址不变，只能靠它区分旧页面和新页面。
            async currentDocument(tabId) {
                const frame = await mainFrame(tabId);
                return frame && typeof frame.documentId === 'string' && frame.documentId ? frame.documentId : null;
            },
            enter(tabId, previousDocumentId = null) {
                const generation = (generations.get(tabId) || 0) + 1;
                generations.set(tabId, generation);
                const task = run(tabId, previousDocumentId, generation)
                    .catch(() => 'failed')
                    .finally(() => {
                        pending.delete(task);
                        if (generations.get(tabId) === generation) generations.delete(tabId);
                    });
                pending.add(task);
                return task;
            },
            settle: () => Promise.all([...pending]),
        };
    }

    // 记住本次打开的“弹窗观看”窗口：再点别的直播间时，在同一个窗口里换房间并聚焦，而不是每点一次开一个窗口、叠出多路声音。
    // 窗口已被用户关闭、被改成别的类型或无法导航时，才新建窗口。窗口 id 只存在内存里，重新打开新标签页后不再复用。
    // 新建或换房间之后都交给 theater 进入剧场模式（不等待结果，open 的返回值不变）。
    function createPopupWatcher(options = {}) {
        let current = null;
        const theater = options.theater || createTheaterAssist();
        return {
            async open(url, size) {
                if (current !== null) {
                    const known = current;
                    const popup = await chromeCall('windows', 'get', known, { populate: true });
                    const tab = popup && popup.type === 'popup' && Array.isArray(popup.tabs) && popup.tabs.length === 1 ? popup.tabs[0] : null;
                    if (tab && Number.isInteger(tab.id)) {
                        const previous = await theater.currentDocument(tab.id);
                        const updated = await chromeCall('tabs', 'update', tab.id, { url, active: true });
                        if (updated) {
                            void theater.enter(tab.id, previous);
                            await chromeCall('windows', 'update', known, { focused: true });
                            return { ok: true, reused: true };
                        }
                    }
                    if (current === known) current = null;
                }
                const created = await createPopup(url, size);
                current = created.ok ? created.windowId : null;
                if (created.ok && created.tabId !== null) void theater.enter(created.tabId, null);
                return { ok: created.ok, reused: false };
            },
            // 等进行中的剧场模式请求结束（测试与排查用）。
            settle: () => theater.settle(),
        };
    }

    function storageGet(defaults) {
        return new Promise(resolve => {
            if (!globalThis.chrome?.storage?.local) { resolve(defaults); return; }
            chrome.storage.local.get(defaults, result => resolve(result || defaults));
        });
    }

    function storageSet(values) {
        return new Promise(resolve => {
            if (!globalThis.chrome?.storage?.local) { resolve(); return; }
            try { chrome.storage.local.set(values, () => { void chrome.runtime?.lastError; resolve(); }); } catch { resolve(); }
        });
    }

    function sendMessage(message, timeoutMs = 15_000) {
        return new Promise(resolve => {
            let settled = false;
            const finish = response => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                const error = globalThis.chrome?.runtime?.lastError;
                resolve(error ? { ok: false, error: { code: 'runtime-error' } } : (response || { ok: false, error: { code: 'background-unavailable' } }));
            };
            const timeoutId = setTimeout(() => finish({ ok: false, error: { code: 'request-timeout' } }), timeoutMs);
            try {
                if (!globalThis.chrome?.runtime?.sendMessage) { finish({ ok: false, error: { code: 'background-unavailable' } }); return; }
                const possiblePromise = chrome.runtime.sendMessage(message, finish);
                if (possiblePromise?.then) possiblePromise.then(finish).catch(() => finish({ ok: false, error: { code: 'runtime-error' } }));
            } catch {
                finish({ ok: false, error: { code: 'runtime-error' } });
            }
        });
    }

    async function fetchLiveList(gid, page, signal, fetchImpl = globalThis.fetch.bind(globalThis)) {
        const url = Core.buildLiveListUrl({ gid, page });
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
            const timeout = AbortSignal.timeout(LIST_FETCH_TIMEOUT_MS);
            const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
            try {
                // 公开接口：不带 Cookie，也不发送扩展 Referer。
                const response = await fetchImpl(url, { signal: combined, credentials: 'omit', referrerPolicy: 'no-referrer' });
                if (!response.ok) throw Core.fail('huya-http');
                const body = await response.text();
                if (body.length > 3_000_000) throw Core.fail('huya-format-changed');
                try { return JSON.parse(body); } catch { throw Core.fail('huya-format-changed'); }
            } catch (error) {
                if (signal?.aborted) throw error;
                lastError = error;
                if (error?.code === 'huya-format-changed') break;
                if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 700));
            }
        }
        const name = lastError?.name;
        if (String(lastError?.code || '').startsWith('huya-')) throw lastError;
        throw Core.fail(name === 'TimeoutError' || name === 'AbortError' ? 'huya-timeout' : 'huya-network');
    }

    class HuyaController {
        constructor() {
            this.initialized = false;
            this.isOpen = false;
            this.panel = null;
            this.stage = null;
            this.settings = {};
            this.view = 'follow';
            this.categoryId = 'hot';
            this.requestId = 0;
            this.follow = { data: null, notice: '', busy: false };
            this.recommend = new Map();
            this.recommendState = { busy: false, moreBusy: false, notice: '', moreError: '' };
            this.player = null;
            this.playerMode = { wide: true, immersive: false };
            this.offlineOpen = undefined;
            this.followQuery = '';
            this.followSort = 'default';
            this.searchTimer = 0;
            this.clearArmedUntil = 0;
            this.abortController = null;
            this.returnFocus = null;
            this.backgroundInertSiblings = [];
            this.frameNoticeTimer = 0;
            this.fetchLiveList = fetchLiveList;
            // 本机数据：最近观看与关注分组。读写都经 storageQueue 串行，每次先读存储里的最新值再改，避免多个新标签页互相覆盖。
            this.recent = [];
            this.groups = { groups: [] };
            this.followGroupId = '';
            this.recentClearArmedUntil = 0;
            this.groupDeleteArmed = null;
            this.sheet = null;
            this.storageQueue = Promise.resolve();
            this.sessionWatched = false;
            this.openMode = Core.resolveOpenMode(null);
            this.openModeChosen = false;
            this.popupBusy = false;
            this.popupWatcher = createPopupWatcher();
            this.toastTimer = 0;
            this.deleteArmTimer = 0;
        }

        async init() {
            if (this.initialized) return;
            this._injectPanel();
            this._bindEvents();
            const stored = await storageGet({ [Core.SETTINGS_KEY]: {} });
            const settings = stored[Core.SETTINGS_KEY];
            this.settings = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
            this.view = VIEWS.has(this.settings.view) ? this.settings.view : 'follow';
            this.categoryId = Core.CATEGORIES.some(category => category.id === this.settings.category) ? this.settings.category : 'hot';
            this.followSort = this.settings.followSort === 'viewers' ? 'viewers' : 'default';
            this.playerMode.wide = this.settings.playerWide !== false;
            // 没有明确选择过时默认弹窗：内嵌播放有试看限制，连续观看只能走官方页面。
            this.openMode = Core.resolveOpenMode(this.settings);
            this.openModeChosen = Core.isOpenModeChosen(this.settings);
            this.panel.classList.toggle('is-wide', this.playerMode.wide);
            this._syncNav();
            this._syncOpenModeToggle();
            this.initialized = true;
        }

        toggle() {
            if (this.isOpen) this.close();
            else this.open();
        }

        open() {
            if (!this.panel || this.isOpen) return;
            this.returnFocus = document.activeElement;
            this.isOpen = true;
            this.panel.hidden = false;
            this.panel.removeAttribute('inert');
            this.panel.setAttribute('aria-hidden', 'false');
            document.body.classList.add('huya-workbench-open');
            // 从应用启动台打开时，启动台会在当前调用栈末尾清理它设置的 inert；下一帧重新声明模态边界。
            requestAnimationFrame(() => {
                if (!this.isOpen) return;
                this._setBackgroundInert(true);
                this.panel.querySelector('.hy-close')?.focus();
            });
            void this._showView(this.view);
        }

        close() {
            if (!this.panel || !this.isOpen) return;
            this.requestId += 1;
            this._abortListFetch();
            this._releaseFollow();
            this.isOpen = false;
            this.panel.hidden = true;
            this.panel.setAttribute('inert', '');
            this.panel.setAttribute('aria-hidden', 'true');
            this._setBackgroundInert(false);
            document.body.classList.remove('huya-workbench-open');
            this._closeSheet({ restoreFocus: false });
            this._removeFrame();
            this._clearPlayer();
            clearTimeout(this.searchTimer);
            // 搜索词、分组筛选和“本次已观看”只在本次打开期间有效：下次打开应该看到完整列表，而不是上次遗留的过滤结果；继续观看提示则重新判断。
            this.followQuery = '';
            this.followGroupId = '';
            this.sessionWatched = false;
            this.recentClearArmedUntil = 0;
            this.recommendState.busy = false;
            this.recommendState.moreBusy = false;
            const originalFocusIsUsable = this.returnFocus?.isConnected
                && !this.returnFocus.closest?.('[inert]')
                && this.returnFocus.getClientRects?.().length;
            const fallback = document.getElementById('dock-launchpad-btn') || document.getElementById('huya-dock-btn');
            (originalFocusIsUsable ? this.returnFocus : fallback)?.focus?.({ preventScroll: true });
            this.returnFocus = null;
        }

        _setBackgroundInert(active) {
            if (active) {
                if (this.backgroundInertSiblings.length) return;
                this.backgroundInertSiblings = [...document.body.children].filter(child => child !== this.panel && !child.inert);
                this.backgroundInertSiblings.forEach(child => { child.inert = true; });
                return;
            }
            this.backgroundInertSiblings.forEach(child => { child.inert = false; });
            this.backgroundInertSiblings = [];
        }

        _injectPanel() {
            const element = document.createElement('section');
            element.id = 'huya-workbench';
            element.className = 'hy-panel';
            element.hidden = true;
            element.setAttribute('inert', '');
            element.setAttribute('aria-hidden', 'true');
            element.setAttribute('role', 'dialog');
            element.setAttribute('aria-modal', 'true');
            element.setAttribute('aria-labelledby', 'hy-workbench-title');
            const categories = Core.CATEGORIES.map(category => `<button type="button" data-huya-view="recommend" data-hy-category="${escapeHtml(category.id)}"><i class="${escapeHtml(category.icon)}" aria-hidden="true"></i><span>${escapeHtml(category.label)}</span></button>`).join('');
            element.innerHTML = `
                <header class="hy-topbar">
                    <div class="hy-brand"><span class="hy-logo" aria-hidden="true"><i class="hy-tiger-icon"></i></span><div><strong id="hy-workbench-title">虎牙直播</strong><small>关注主播 · 热门推荐 · 官方播放器</small></div></div>
                    <div class="hy-account"><button class="hy-mode-toggle" type="button" data-hy-action="toggle-open-mode" aria-pressed="true" aria-label="弹窗优先"><i class="far fa-window-restore" aria-hidden="true"></i><span>弹窗优先</span></button><a href="${Core.ORIGIN}/" target="_blank" rel="noopener noreferrer">虎牙官网 <i class="fas fa-external-link-alt" aria-hidden="true"></i></a><button class="hy-close" type="button" aria-label="关闭虎牙工作台"><i class="fas fa-times" aria-hidden="true"></i></button></div>
                </header>
                <div class="hy-body">
                    <nav class="hy-nav" aria-label="虎牙工作台导航">
                        <button type="button" data-huya-view="follow"><i class="fas fa-heart" aria-hidden="true"></i><span>我的关注</span><em data-hy-count="live" hidden>0</em></button>
                        <button type="button" data-huya-view="recent"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i><span>最近观看</span></button>
                        <div class="hy-nav-label">推荐</div>
                        ${categories}
                    </nav>
                    <main class="hy-content">
                        <div class="hy-page-heading"><div><span class="hy-eyebrow">HUYA · LIVE</span><h2 class="hy-view-title">我的关注</h2></div><div class="hy-status" role="status" aria-live="polite"></div></div>
                        <div class="hy-stage"></div>
                    </main>
                </div>`;
            document.body.appendChild(element);
            this.panel = element;
            this.stage = element.querySelector('.hy-stage');
        }

        _bindEvents() {
            this.panel.querySelector('.hy-close').addEventListener('click', () => this.close());
            this.panel.addEventListener('click', event => this._handleClick(event));
            this.panel.addEventListener('keydown', event => this._handleKeydown(event));
            // 封面或头像加载失败时回退为统一占位，不用内联 onerror（扩展 CSP 不允许）。
            this.panel.addEventListener('error', event => {
                const image = event.target;
                if (image?.tagName !== 'IMG') return;
                image.removeAttribute('src');
                image.classList.add('is-broken');
            }, true);
            this.panel.addEventListener('toggle', event => {
                if (event.target?.matches?.('[data-hy-offline]')) this.offlineOpen = event.target.open;
            }, true);
            // 搜索：输入法组合期间不过滤，组合结束后再处理；只重绘分组块，输入框不动。
            this.panel.addEventListener('input', event => {
                if (event.isComposing || !event.target?.matches?.('[data-hy-search]')) return;
                this._onSearchInput(event.target.value);
            });
            this.panel.addEventListener('compositionend', event => {
                if (event.target?.matches?.('[data-hy-search]')) this._onSearchInput(event.target.value);
            });
            // 分组面板：勾选与改名即时保存；新建走表单提交（回车也能提交）。
            this.panel.addEventListener('change', event => this._handleChange(event));
            this.panel.addEventListener('submit', event => this._handleSubmit(event));
            window.addEventListener('pagehide', () => this._releaseFollow());
        }

        _handleKeydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                // 分组面板是最上层的模态：Esc 先关它，不连带关闭工作台。
                if (this.sheet) {
                    this._closeSheet();
                    return;
                }
                if (this.playerMode.immersive) {
                    this._setImmersive(false);
                    this.panel.querySelector('[data-hy-action="toggle-immersive"]')?.focus?.({ preventScroll: true });
                    return;
                }
                const search = event.target?.matches?.('[data-hy-search]') ? event.target : null;
                if (search && search.value) {
                    this._setSearch('');
                    return;
                }
                this.close();
                return;
            }
            if (event.key !== 'Tab') return;
            const sheet = this.sheet ? this.panel.querySelector('.hy-sheet') : null;
            const scope = sheet || this.panel;
            const focusable = [...scope.querySelectorAll(sheet ? 'button:not([disabled]), input:not([disabled])' : 'button:not([disabled]), a[href], iframe, summary')].filter(element => !element.hidden && element.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }

        async _handleClick(event) {
            // 点在面板外的遮罩上（不是对话框内部）才关闭分组面板。
            if (event.target?.matches?.('[data-hy-sheet-backdrop]')) {
                this._closeSheet();
                return;
            }
            const viewButton = event.target.closest('[data-huya-view]');
            if (viewButton) {
                if (viewButton.dataset.hyCategory && Core.CATEGORIES.some(category => category.id === viewButton.dataset.hyCategory)) this.categoryId = viewButton.dataset.hyCategory;
                await this._showView(viewButton.dataset.huyaView, { fromNav: true });
                return;
            }
            // 卡片上的“在虎牙打开”是普通链接，照常在新标签页打开（不拦截）；这里只把这次打开记入最近观看。
            const externalLink = event.target.closest('a[data-hy-link]');
            if (externalLink) {
                const linked = this._findItem(externalLink.dataset.hyLink);
                if (linked && linked.status !== 'offline') this._recordRecent(linked);
                return;
            }
            const playButton = event.target.closest('[data-hy-play]');
            if (playButton) {
                const item = this._findItem(playButton.dataset.hyPlay);
                if (item) this._play(item);
                return;
            }
            const openButton = event.target.closest('[data-hy-open]');
            if (openButton) {
                const item = this._findItem(openButton.dataset.hyOpen);
                if (item) this._openExternal(item);
                return;
            }
            const actionButton = event.target.closest('[data-hy-action]');
            if (!actionButton || actionButton.disabled) return;
            const action = actionButton.dataset.hyAction;
            if (action === 'toggle-open-mode') this._setOpenMode(this.openMode === 'popup' ? 'embed' : 'popup');
            else if (action === 'group-filter') this._setGroupFilter(actionButton.dataset.hyGroup);
            else if (action === 'group-assign') this._openAssignSheet(actionButton.dataset.hyId, actionButton);
            else if (action === 'group-manage') this._openManageSheet(actionButton);
            else if (action === 'group-delete') await this._deleteGroup(actionButton.dataset.hyGroup, actionButton);
            else if (action === 'sheet-close') this._closeSheet();
            else if (action === 'recent-remove') await this._removeRecent(actionButton.dataset.hyId);
            else if (action === 'clear-recent') await this._clearRecent();
            else if (action === 'resume-dismiss') this._dismissResume();
            else if (action === 'refresh-follow') await this._showView('follow', { force: true });
            else if (action === 'refresh-recommend') await this._showView('recommend', { force: true });
            else if (action === 'retry') await this._showView(this.view, { force: true });
            else if (action === 'recommend-more') await this._loadMoreRecommend();
            else if (action === 'clear-follow') await this._clearFollow();
            else if (action === 'back') this._backToList();
            else if (action === 'copy-link') await this._copyLink();
            else if (action === 'toggle-wide') this._toggleWide();
            else if (action === 'toggle-immersive') this._setImmersive(!this.playerMode.immersive);
            else if (action === 'pop-out') await this._popOut();
            else if (action === 'resume-embed') { if (this.player) this._play(this.player.item); }
            else if (action === 'toggle-sort') this._toggleSort();
            else if (action === 'clear-search') this._setSearch('', { focus: true });
        }

        _persist() {
            this.settings = { ...this.settings, view: this.view, category: this.categoryId, followSort: this.followSort, playerWide: this.playerMode.wide, openMode: this.openMode, openModeChosen: this.openModeChosen };
            void storageSet({ [Core.SETTINGS_KEY]: this.settings });
        }

        _syncNav() {
            if (!this.panel) return;
            for (const button of this.panel.querySelectorAll('.hy-nav button')) {
                const target = button.dataset.huyaView;
                const active = target === 'follow' || target === 'recent'
                    ? this.view === target
                    : (this.view === 'recommend' && button.dataset.hyCategory === this.categoryId);
                button.classList.toggle('active', active);
                if (active) button.setAttribute('aria-current', 'page');
                else button.removeAttribute('aria-current');
            }
            const badge = this.panel.querySelector('[data-hy-count="live"]');
            const live = this.follow.data ? summarize(this.follow.data.items).live : 0;
            badge.textContent = String(live);
            badge.hidden = live === 0;
            badge.title = live ? `${live} 位关注的主播正在直播` : '';
        }

        _setTitle(text) {
            const title = this.panel?.querySelector('.hy-view-title');
            if (title) title.textContent = text;
        }

        _setStatus(message) {
            const status = this.panel?.querySelector('.hy-status');
            if (status) status.textContent = message || '';
        }

        _abortListFetch() {
            this.abortController?.abort();
            this.abortController = null;
        }

        _releaseFollow() {
            if (!this.follow.busy) return;
            this.follow.busy = false;
            void sendMessage({ action: 'huya_follow_release' }, 5_000);
        }

        _removeFrame() {
            clearTimeout(this.frameNoticeTimer);
            clearTimeout(this.toastTimer);
            this.panel?.querySelectorAll('.hy-player-frame').forEach(frame => frame.remove());
        }

        // 播放器打开时，晚到的列表、加载或错误结果只更新状态，不能覆盖正在播放的舞台。
        _render(markup, focusSelector = '') {
            if (this.player) return;
            this.stage.innerHTML = markup;
            if (focusSelector) this.stage.querySelector(focusSelector)?.focus?.({ preventScroll: true });
        }

        _renderLoading(label) {
            this._render(loadingMarkup(label));
        }

        async _showView(view, { force = false, fromNav = false } = {}) {
            if (!VIEWS.has(view) || !this.isOpen) return;
            const requestId = ++this.requestId;
            this._abortListFetch();
            this._releaseFollow();
            this._removeFrame();
            this._clearPlayer();
            this.recommendState = { busy: false, moreBusy: false, notice: '', moreError: '' };
            this.view = view;
            this._persist();
            this._syncNav();
            this._setStatus('');
            if (fromNav) this.stage.scrollTop = 0;
            // 本机的最近观看与分组可能被另一个新标签页改过：每次进入视图都先读存储里的最新值（本机读取，几毫秒）。
            await this._refreshLocalState();
            if (this._stale(requestId)) return;
            if (view === 'follow') await this._loadFollow(requestId, { force });
            else if (view === 'recent') this._loadRecent();
            else await this._loadRecommend(requestId, { force });
        }

        _stale(requestId) {
            return requestId !== this.requestId || !this.isOpen;
        }

        // ---- 我的关注：缓存优先，必要时经后台读取虎牙自己的页面 ----

        async _loadFollow(requestId, { force = false } = {}) {
            this._setTitle('我的关注');
            if (!force) {
                const cached = await sendMessage({ action: 'huya_follow', mode: 'cache' }, CACHE_MESSAGE_TIMEOUT_MS);
                if (this._stale(requestId)) return;
                if (!cached.ok) {
                    this._followFailed(cached.error?.code, false);
                    return;
                }
                if (cached.data) {
                    this.follow.data = cached.data;
                    this.follow.notice = '';
                    this._syncNav();
                    this._renderFollow({ refreshing: cached.data.stale });
                    if (!cached.data.stale) return;
                }
            }
            if (this.follow.data) this._renderFollow({ refreshing: true });
            else this._renderLoading('正在后台打开虎牙“我的关注”页面…首次读取约需 10–20 秒');
            this.follow.busy = true;
            const response = await sendMessage({ action: 'huya_follow', mode: 'refresh', force }, FOLLOW_MESSAGE_TIMEOUT_MS);
            if (this._stale(requestId)) return;
            this.follow.busy = false;
            if (!response.ok) {
                this._followFailed(response.error?.code, Boolean(this.follow.data));
                return;
            }
            const data = response.data;
            if (data.empty) {
                // 空结果不覆盖已有列表，只提示；没有旧列表时才显示空状态。
                if (this.follow.data?.items?.length) {
                    this.follow.notice = '虎牙这次没有返回关注列表（可能是临时失败），仍显示上次的内容。';
                    this._renderFollow({});
                } else {
                    this.follow.data = null;
                    this._syncNav();
                    this._render(emptyFollowMarkup());
                }
                return;
            }
            this.follow.data = data;
            this.follow.notice = '';
            this._syncNav();
            this._renderFollow({}, force ? '[data-hy-action="refresh-follow"]' : '');
            if (force) this._setStatus('已刷新关注列表');
        }

        _followFailed(code, hasData) {
            if (code === 'huya-login-required') {
                this.follow.data = null;
                this._syncNav();
                this._render(loginMarkup());
                return;
            }
            if (code === 'huya-cancelled') return;
            if (hasData && this.follow.data) {
                this.follow.notice = `${errorMessage(code)}（显示的是缓存内容）`;
                this._renderFollow({});
                return;
            }
            this._render(failureMarkup(code || 'huya-read-failed'));
        }

        _followOptions(extra = {}) {
            return {
                refreshing: extra.refreshing || false,
                busy: this.follow.busy || extra.refreshing,
                notice: this.follow.notice,
                offlineOpen: this.offlineOpen,
                clearArmed: Date.now() < this.clearArmedUntil,
                query: this.followQuery,
                sort: this.followSort,
                popup: this.openMode === 'popup',
                groups: this.groups,
                group: this._activeGroup(),
                membership: Core.membershipIndex(this.groups),
                resume: this._resumeMarkup(),
            };
        }

        _renderFollow(extra = {}, focusSelector = '') {
            if (this.view !== 'follow' || this.player || !this.follow.data) return;
            // 后台刷新完成会整块重绘：用户正在输入搜索词时，要把焦点和光标放回新的输入框。
            const active = document.activeElement;
            const keepSearch = !focusSelector && Boolean(active?.matches?.('[data-hy-search]'));
            const selection = keepSearch ? [active.selectionStart, active.selectionEnd] : null;
            this._render(followMarkup(this.follow.data, this._followOptions(extra)), focusSelector);
            if (keepSearch) {
                const input = this.stage.querySelector('[data-hy-search]');
                input?.focus?.({ preventScroll: true });
                try { input?.setSelectionRange(selection[0], selection[1]); } catch { /* 个别输入类型不支持选区 */ }
            }
        }

        // ---- 关注列表：本地搜索与人气排序（不发请求，只重排已读取的列表） ----

        _onSearchInput(value) {
            this.followQuery = String(value ?? '').slice(0, 40);
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this._renderFollowGroups(), SEARCH_DEBOUNCE_MS);
        }

        _setSearch(value, { focus = false } = {}) {
            clearTimeout(this.searchTimer);
            this.followQuery = value;
            const input = this.stage.querySelector('[data-hy-search]');
            if (input) input.value = value;
            this._renderFollowGroups();
            if (focus) input?.focus?.({ preventScroll: true });
        }

        // 只替换分组块与统计文字，不重绘工具栏。
        _renderFollowGroups() {
            if (this.view !== 'follow' || this.player || !this.follow.data) return;
            const groups = this.stage.querySelector('.hy-follow-groups');
            if (!groups) return;
            const options = this._followOptions();
            groups.innerHTML = followGroupsMarkup(this.follow.data.items, options);
            const info = this.stage.querySelector('.hy-toolbar-info');
            if (info) info.innerHTML = followInfoMarkup(this.follow.data, options);
        }

        _toggleSort() {
            this.followSort = this.followSort === 'viewers' ? 'default' : 'viewers';
            this._persist();
            this._renderFollow({}, '[data-hy-action="toggle-sort"]');
            this._setStatus(this.followSort === 'viewers' ? '已按人气排序' : '已恢复虎牙默认顺序');
        }

        async _clearFollow() {
            if (Date.now() >= this.clearArmedUntil) {
                this.clearArmedUntil = Date.now() + 5_000;
                this._renderFollow({}, '[data-hy-action="clear-follow"]');
                setTimeout(() => { if (this.isOpen && this.view === 'follow') this._renderFollow({}); }, 5_100);
                return;
            }
            this.clearArmedUntil = 0;
            const response = await sendMessage({ action: 'huya_follow_clear' }, 10_000);
            if (!this.isOpen) return;
            if (!response.ok) {
                this._setStatus(errorMessage(response.error?.code));
                return;
            }
            this.follow.data = null;
            this.follow.notice = '';
            this._syncNav();
            this._setStatus('已清除关注列表缓存');
            this._render(stateMarkup({
                icon: 'fa-broom',
                title: '关注列表缓存已清除',
                text: '下次读取会重新打开后台标签页，从虎牙获取最新列表。',
                actions: '<button class="hy-primary" type="button" data-hy-action="refresh-follow">现在读取</button>',
            }));
        }

        // ---- 热门推荐：虎牙公开列表接口，不带登录态 ----

        async _loadRecommend(requestId, { force = false } = {}) {
            const category = Core.categoryById(this.categoryId);
            this._setTitle(category.label);
            const cached = this.recommend.get(category.id);
            const fresh = cached && Date.now() - cached.fetchedAt <= RECOMMEND_TTL_MS;
            if (cached && fresh && !force) {
                this._renderRecommend();
                return;
            }
            if (cached && !force) this._renderRecommend({ refreshing: true });
            else this._renderLoading(`正在加载${category.label}…`);
            this.recommendState.busy = true;
            const controller = new AbortController();
            this.abortController = controller;
            try {
                const payload = await this.fetchLiveList(category.gid, 1, controller.signal);
                if (this._stale(requestId)) return;
                const parsed = Core.normalizeLiveList(payload);
                this.recommend.set(category.id, { items: parsed.items, page: parsed.page, totalPages: parsed.totalPages, fetchedAt: Date.now() });
                this.recommendState.busy = false;
                this.recommendState.notice = '';
                this._renderRecommend({}, force ? '[data-hy-action="refresh-recommend"]' : '');
                if (force) this._setStatus('已刷新推荐');
            } catch (error) {
                if (this._stale(requestId) || controller.signal.aborted) return;
                this.recommendState.busy = false;
                const code = String(error?.code || '').startsWith('huya-') ? error.code : 'huya-network';
                if (cached) {
                    this.recommendState.notice = `${errorMessage(code)}（显示的是缓存内容，更新于${relativeTime(cached.fetchedAt)}）`;
                    this._renderRecommend();
                } else {
                    this._render(failureMarkup(code, '热门推荐加载失败'));
                }
            }
        }

        async _loadMoreRecommend() {
            const category = Core.categoryById(this.categoryId);
            const entry = this.recommend.get(category.id);
            if (!entry || this.recommendState.moreBusy || this.recommendState.busy || this.view !== 'recommend') return;
            const requestId = this.requestId;
            this.recommendState.moreBusy = true;
            this.recommendState.moreError = '';
            this._renderRecommend();
            const controller = new AbortController();
            this.abortController = controller;
            try {
                const payload = await this.fetchLiveList(category.gid, entry.page + 1, controller.signal);
                if (this._stale(requestId)) return;
                const parsed = Core.normalizeLiveList(payload);
                this.recommend.set(category.id, {
                    items: Core.mergeUnique(entry.items, parsed.items),
                    page: parsed.page,
                    totalPages: parsed.totalPages,
                    fetchedAt: entry.fetchedAt,
                });
                this.recommendState.moreBusy = false;
                this._renderRecommend({}, '[data-hy-action="recommend-more"]');
            } catch (error) {
                if (this._stale(requestId) || controller.signal.aborted) return;
                this.recommendState.moreBusy = false;
                this.recommendState.moreError = errorMessage(String(error?.code || '').startsWith('huya-') ? error.code : 'huya-network');
                this._renderRecommend({}, '[data-hy-action="recommend-more"]');
            }
        }

        _renderRecommend(extra = {}, focusSelector = '') {
            if (this.view !== 'recommend' || this.player) return;
            const category = Core.categoryById(this.categoryId);
            const entry = this.recommend.get(category.id);
            if (!entry) return;
            this._render(recommendMarkup(category, entry, {
                refreshing: extra.refreshing || false,
                busy: this.recommendState.busy || extra.refreshing,
                moreBusy: this.recommendState.moreBusy,
                moreError: this.recommendState.moreError,
                notice: this.recommendState.notice,
                popup: this.openMode === 'popup',
                resume: this._resumeMarkup(),
            }), focusSelector);
        }

        // ---- 本机数据：最近观看与关注分组（chrome.storage.local，只在本机） ----

        _enqueueStorage(task) {
            // 任务内部的异常按失败（null）返回，队列本身不会因某个任务失败而中断。
            const run = async () => { try { return await task(); } catch { return null; } };
            const next = this.storageQueue.then(run);
            this.storageQueue = next;
            return next;
        }

        async _readRecent() {
            if (!globalThis.chrome?.storage?.local) return this.recent;
            const stored = await storageGet({ [Core.RECENT_KEY]: null });
            return Core.sanitizeRecent(stored[Core.RECENT_KEY], Date.now());
        }

        async _readGroups() {
            if (!globalThis.chrome?.storage?.local) return this.groups;
            const stored = await storageGet({ [Core.GROUPS_KEY]: null });
            return Core.sanitizeGroups(stored[Core.GROUPS_KEY]);
        }

        _refreshLocalState() {
            return this._enqueueStorage(async () => {
                this.recent = await this._readRecent();
                this.groups = await this._readGroups();
                if (this.followGroupId && !this.groups.groups.some(group => group.id === this.followGroupId)) this.followGroupId = '';
            });
        }

        _mutateRecent(update) {
            return this._enqueueStorage(async () => {
                const next = update(await this._readRecent());
                this.recent = next;
                await storageSet({ [Core.RECENT_KEY]: { version: 1, items: next } });
                return next;
            });
        }

        // update 收到存储里最新的分组状态，返回 HuyaCore 的 { ok, state } 或 { ok:false, code }；失败时不写存储，只用最新状态刷新内存。
        _mutateGroups(update) {
            return this._enqueueStorage(async () => {
                const base = await this._readGroups();
                const result = update(base);
                if (!result?.ok) {
                    this.groups = base;
                    return result || { ok: false, code: 'group-missing' };
                }
                const next = Core.sanitizeGroups(result.state);
                this.groups = next;
                await storageSet({ [Core.GROUPS_KEY]: { version: 1, groups: next.groups } });
                return { ...result, state: next };
            });
        }

        // ---- 最近观看 ----

        // 只采用足够新的直播数据补全最近观看的状态；更早的数据不能说明现在是否在播。
        _liveItems() {
            const now = Date.now();
            const fresh = timestamp => Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp <= LIVE_SNAPSHOT_MAX_AGE_MS;
            const items = [];
            if (this.follow.data && fresh(this.follow.data.fetchedAt)) items.push(...this.follow.data.items);
            for (const entry of this.recommend.values()) {
                if (fresh(entry.fetchedAt)) items.push(...entry.items);
            }
            return items;
        }

        _recentItems() {
            return Core.enrichRecent(this.recent, this._liveItems());
        }

        _recordRecent(item) {
            this.sessionWatched = true;
            const now = Date.now();
            void this._mutateRecent(list => Core.mergeRecent(list, item, now));
        }

        _loadRecent() {
            this._setTitle('最近观看');
            this._renderRecent();
        }

        _renderRecent(focusSelector = '') {
            if (this.view !== 'recent' || this.player) return;
            this._render(recentMarkup(this._recentItems(), {
                popup: this.openMode === 'popup',
                clearArmed: Date.now() < this.recentClearArmedUntil,
                now: Date.now(),
            }), focusSelector);
        }

        async _removeRecent(id) {
            if (!Core.isItemId(id)) return;
            const before = this._recentItems();
            const index = before.findIndex(item => item.id === id);
            await this._mutateRecent(list => Core.removeRecent(list, id));
            if (!this.isOpen || this.view !== 'recent') return;
            // 焦点交给原位置的下一张卡片，没有下一张就交给上一张。
            const rest = this._recentItems();
            const nextId = rest[Math.min(Math.max(index, 0), rest.length - 1)]?.id;
            this._renderRecent(nextId ? `[data-hy-play="${CSS.escape(nextId)}"], [data-hy-open="${CSS.escape(nextId)}"]` : '.hy-state .hy-primary');
            this._setStatus(index >= 0 ? `已从最近观看移除 ${before[index].nick}` : '');
        }

        async _clearRecent() {
            if (Date.now() >= this.recentClearArmedUntil) {
                this.recentClearArmedUntil = Date.now() + CONFIRM_WINDOW_MS;
                this._renderRecent('[data-hy-action="clear-recent"]');
                setTimeout(() => {
                    // 只就地还原按钮，不重绘整页：重绘会让按钮上的键盘焦点丢失。
                    const button = this.isOpen && this.view === 'recent' ? this.stage.querySelector('[data-hy-action="clear-recent"]') : null;
                    if (button && Date.now() >= this.recentClearArmedUntil) {
                        button.classList.remove('is-armed');
                        button.textContent = '清除记录';
                    }
                }, CONFIRM_WINDOW_MS + 100);
                return;
            }
            this.recentClearArmedUntil = 0;
            await this._mutateRecent(() => []);
            if (!this.isOpen || this.view !== 'recent') return;
            this._renderRecent('.hy-state .hy-primary');
            this._setStatus('已清除最近观看记录');
        }

        // ---- 继续观看提示 ----

        _resumeEntry() {
            const latest = this.recent[0];
            // 本次打开期间已经看过东西，就不再提示“继续观看”（返回列表时不应再催用户回到刚看完的房间）。
            if (this.sessionWatched || !latest || Date.now() - latest.watchedAt > RESUME_MAX_AGE_MS) return null;
            return this.settings.resumeDismissed === resumeKey(latest) ? null : latest;
        }

        _resumeMarkup() {
            const entry = this._resumeEntry();
            if (!entry) return '';
            // 与列表使用同一份数据：列表里已有这位主播时，按钮的行为必须和卡片一致。
            const item = this._itemsForCurrentView().find(candidate => candidate.id === entry.id)
                || Core.enrichRecent([entry], this._liveItems())[0];
            if (!item || item.status === 'offline') return '';
            return resumeMarkup({ ...item, watchedAt: entry.watchedAt }, { popup: this.openMode === 'popup' });
        }

        _dismissResume() {
            const entry = this.recent[0];
            if (entry) {
                this.settings = { ...this.settings, resumeDismissed: resumeKey(entry) };
                void storageSet({ [Core.SETTINGS_KEY]: this.settings });
            }
            this.stage.querySelectorAll('.hy-resume').forEach(element => element.remove());
            this.stage.querySelector('.hy-card-media, .hy-toolbar button')?.focus?.({ preventScroll: true });
            this._setStatus('已隐藏继续观看提示');
        }

        // ---- 打开方式：弹窗观看（默认）或内嵌播放 ----

        _setOpenMode(mode) {
            this.openMode = mode === 'popup' ? 'popup' : 'embed';
            // 用户点过开关就是明确选择：之后无论选哪一边都按保存的值，不再套用默认。
            this.openModeChosen = true;
            this._persist();
            this._syncOpenModeToggle();
            // 卡片上的按钮名称与图标随模式变化；播放器里不重绘，iframe 不会被重新加载。
            if (!this.player) this._renderCurrentList();
            this._setStatus(this.openMode === 'popup' ? '已开启弹窗优先：点击直播间会在独立窗口观看' : '已关闭弹窗优先：点击直播间会在这里内嵌播放（有试看限制）');
        }

        _syncOpenModeToggle() {
            const button = this.panel?.querySelector('[data-hy-action="toggle-open-mode"]');
            if (!button) return;
            const on = this.openMode === 'popup';
            button.setAttribute('aria-pressed', String(on));
            button.title = on ? OPEN_MODE_TITLE_ON : OPEN_MODE_TITLE_OFF;
        }

        _renderCurrentList() {
            if (this.view === 'follow') this._renderFollow({ refreshing: this.follow.busy });
            else if (this.view === 'recent') this._renderRecent();
            else this._renderRecommend({ refreshing: this.recommendState.busy });
        }

        // ---- 关注分组 ----

        _activeGroup() {
            if (!this.followGroupId) return null;
            const group = this.groups.groups.find(entry => entry.id === this.followGroupId) || null;
            if (!group) this.followGroupId = '';
            return group;
        }

        _setGroupFilter(id) {
            const value = String(id ?? '');
            const group = GROUP_ID_PATTERN.test(value) ? this.groups.groups.find(entry => entry.id === value) : null;
            this.followGroupId = group ? group.id : '';
            this._renderFollow({ refreshing: this.follow.busy }, `[data-hy-action="group-filter"][data-hy-group="${CSS.escape(this.followGroupId)}"]`);
            this._setStatus(group ? `已显示分组「${group.name}」` : '已显示全部关注');
        }

        _afterGroupsChanged() {
            if (this.followGroupId && !this.groups.groups.some(group => group.id === this.followGroupId)) this.followGroupId = '';
            this._renderFollow({ refreshing: this.follow.busy });
        }

        _setPanelInert(active) {
            for (const element of this.panel.querySelectorAll(':scope > .hy-topbar, :scope > .hy-body')) element.inert = active;
        }

        _openAssignSheet(id, trigger) {
            if (this.sheet || !Core.isItemId(id)) return;
            if (!this.follow.data?.items?.some(entry => entry.id === id)) return;
            this.sheet = { kind: 'assign', itemId: id, trigger };
            this._renderSheet({ focus: '[data-hy-group-toggle], [data-hy-group-new]' });
        }

        _openManageSheet(trigger) {
            if (this.sheet) return;
            this.sheet = { kind: 'manage', trigger };
            this._renderSheet({ focus: '[data-hy-group-name], [data-hy-group-new]' });
        }

        _presentIds() {
            return new Set((this.follow.data?.items || []).map(item => item.id));
        }

        _renderSheet({ focus = '', error = '' } = {}) {
            const sheet = this.sheet;
            if (!sheet || !this.panel) return;
            let markup;
            if (sheet.kind === 'assign') {
                const item = this.follow.data?.items?.find(entry => entry.id === sheet.itemId);
                if (!item) {
                    this._closeSheet();
                    return;
                }
                markup = assignSheetMarkup(item, this.groups, { error, present: this._presentIds() });
            } else {
                markup = manageSheetMarkup(this.groups, { error, present: this._presentIds() });
            }
            // 重绘会把所有“确认删除”按钮还原成“删除”，待确认状态也必须同时清掉，否则下一次点击会在没有显示确认的情况下直接删除。
            this.groupDeleteArmed = null;
            clearTimeout(this.deleteArmTimer);
            let backdrop = this.panel.querySelector('[data-hy-sheet-backdrop]');
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.className = 'hy-sheet-backdrop';
                backdrop.setAttribute('data-hy-sheet-backdrop', '');
                this.panel.appendChild(backdrop);
                this._setPanelInert(true);
            }
            backdrop.innerHTML = markup;
            if (focus) backdrop.querySelector(focus)?.focus?.({ preventScroll: true });
        }

        _closeSheet({ restoreFocus = true } = {}) {
            const sheet = this.sheet;
            if (!sheet) return;
            this.sheet = null;
            this.groupDeleteArmed = null;
            clearTimeout(this.deleteArmTimer);
            this.panel?.querySelector('[data-hy-sheet-backdrop]')?.remove();
            if (this.panel) this._setPanelInert(false);
            if (!restoreFocus || !this.isOpen) return;
            // 列表在面板打开期间可能重绘过，原来的触发按钮已不在文档里：按条目重新找。
            const target = (sheet.kind === 'assign' ? this.stage.querySelector(`[data-hy-action="group-assign"][data-hy-id="${CSS.escape(sheet.itemId)}"]`) : null)
                || (sheet.kind === 'manage' ? this.stage.querySelector('[data-hy-action="group-manage"]') : null)
                || (sheet.trigger?.isConnected ? sheet.trigger : null)
                || this.stage.querySelector('.hy-chip');
            target?.focus?.({ preventScroll: true });
        }

        _setSheetError(message) {
            const element = this.panel?.querySelector('[data-hy-sheet-error]');
            if (element) element.textContent = message || '';
        }

        _handleChange(event) {
            const target = event.target;
            if (!target?.matches) return;
            if (target.matches('[data-hy-group-toggle]')) void this._toggleGroupMember(target.dataset.hyGroupToggle, target.checked, target);
            else if (target.matches('[data-hy-group-name]')) void this._renameGroup(target.dataset.hyGroupName, target.value, target);
        }

        _handleSubmit(event) {
            const form = event.target?.closest?.('[data-hy-sheet-form]');
            if (!form) return;
            event.preventDefault();
            void this._createGroupFromSheet(form);
        }

        async _toggleGroupMember(groupId, checked, input) {
            const sheet = this.sheet;
            if (!sheet || sheet.kind !== 'assign' || !GROUP_ID_PATTERN.test(groupId || '')) return;
            const result = await this._mutateGroups(state => Core.setGroupMember(state, groupId, sheet.itemId, checked));
            if (!result?.ok) {
                // 失败时按最新状态重绘面板，勾选框回到真实状态。
                this._renderSheet({ error: groupErrorMessage(result?.code), focus: `[data-hy-group-toggle="${CSS.escape(groupId)}"], [data-hy-group-new]` });
                return;
            }
            this._setSheetError('');
            const count = input?.isConnected ? input.closest('.hy-sheet-row')?.querySelector('.hy-sheet-count') : null;
            if (count) count.textContent = `${groupCount(result.group, this._presentIds())} 位`;
            this._afterGroupsChanged();
        }

        async _renameGroup(groupId, value, input) {
            if (!this.sheet || this.sheet.kind !== 'manage' || !GROUP_ID_PATTERN.test(groupId || '')) return;
            const result = await this._mutateGroups(state => Core.renameGroup(state, groupId, value));
            if (!result?.ok) {
                this._setSheetError(groupErrorMessage(result?.code));
                const current = this.groups.groups.find(group => group.id === groupId);
                if (input?.isConnected && current) input.value = current.name;
                return;
            }
            this._setSheetError('');
            if (input?.isConnected) input.value = result.group.name;
            this._afterGroupsChanged();
        }

        async _createGroupFromSheet(form) {
            const sheet = this.sheet;
            if (!sheet) return;
            const input = form.querySelector('[data-hy-group-new]');
            const name = input?.value ?? '';
            const result = await this._mutateGroups(state => {
                const created = Core.addGroup(state, name);
                if (!created.ok || sheet.kind !== 'assign') return created;
                const joined = Core.setGroupMember(created.state, created.group.id, sheet.itemId, true);
                return joined.ok ? { ...joined, group: created.group } : joined;
            });
            if (!result?.ok) {
                this._setSheetError(groupErrorMessage(result?.code));
                input?.focus?.({ preventScroll: true });
                return;
            }
            this._afterGroupsChanged();
            this._renderSheet({ focus: sheet.kind === 'assign' ? `[data-hy-group-toggle="${CSS.escape(result.group.id)}"]` : '[data-hy-group-new]' });
        }

        // 删除分组需要二次点击：第一次只把按钮变成“确认删除”（就地修改，不重绘面板，避免打断别处正在进行的改名），5 秒内再点才删除。
        async _deleteGroup(groupId, button) {
            if (!this.sheet || this.sheet.kind !== 'manage' || !GROUP_ID_PATTERN.test(groupId || '')) return;
            const armed = this.groupDeleteArmed;
            if (!armed || armed.id !== groupId || Date.now() > armed.until) {
                this.groupDeleteArmed = { id: groupId, until: Date.now() + CONFIRM_WINDOW_MS };
                this._markDeleteArmed(groupId);
                clearTimeout(this.deleteArmTimer);
                this.deleteArmTimer = setTimeout(() => {
                    if (this.groupDeleteArmed?.id === groupId) {
                        this.groupDeleteArmed = null;
                        this._markDeleteArmed('');
                    }
                }, CONFIRM_WINDOW_MS + 100);
                return;
            }
            this.groupDeleteArmed = null;
            clearTimeout(this.deleteArmTimer);
            const result = await this._mutateGroups(state => Core.deleteGroup(state, groupId));
            if (!result?.ok) {
                this._renderSheet({ error: groupErrorMessage(result?.code), focus: '[data-hy-group-name], [data-hy-group-new]' });
                return;
            }
            this._afterGroupsChanged();
            this._renderSheet({ focus: '[data-hy-group-name], [data-hy-group-new]' });
        }

        _markDeleteArmed(armedId) {
            for (const button of this.panel?.querySelectorAll('[data-hy-action="group-delete"]') || []) {
                const armed = armedId !== '' && button.dataset.hyGroup === armedId;
                button.classList.toggle('is-armed', armed);
                button.textContent = armed ? '确认删除' : '删除';
                const label = button.getAttribute('aria-label') || '';
                button.setAttribute('aria-label', armed ? label.replace(/^删除/, '确认删除') : label.replace(/^确认删除/, '删除'));
            }
        }

        // ---- 播放：官方嵌入页，只在本页面内 iframe，无法嵌入时在虎牙打开 ----

        _itemsForCurrentView() {
            if (this.view === 'follow') return this.follow.data?.items || [];
            if (this.view === 'recent') return this._recentItems();
            return this.recommend.get(this.categoryId)?.items || [];
        }

        _findItem(id) {
            return this._itemsForCurrentView().find(item => item.id === id)
                || (this.player?.item?.id === id ? this.player.item : null)
                || this.player?.rail?.find(item => item.id === id)
                || this._recentItems().find(item => item.id === id)
                || null;
        }

        // 点击一个直播间：不能内嵌的去虎牙打开；其余按“弹窗优先”设置决定是独立窗口还是工作台内嵌播放。
        // 已经在播放器里（继续浏览、回到这里观看）时一律内嵌，不再弹窗。
        _play(item) {
            if (!isEmbeddable(item)) {
                this._openExternal(item);
                return;
            }
            if (this.openMode === 'popup' && !this.player) {
                void this._playInPopup(item);
                return;
            }
            this._playEmbedded(item);
        }

        _openExternal(item) {
            const url = item ? safeLink(item) : '';
            if (!url) return;
            window.open(url, '_blank', 'noopener,noreferrer');
            // 未开播的房间只是点开看看，不算观看；其余（含只能在虎牙观看的加密房间）计入最近观看。
            if (item.status !== 'offline') this._recordRecent(item);
        }

        async _playInPopup(item) {
            const url = safeLink(item);
            if (!url) {
                this._playEmbedded(item);
                return;
            }
            if (this.popupBusy) return;
            this.popupBusy = true;
            let result;
            try {
                result = await this.popupWatcher.open(url, popupSize(globalThis.screen));
            } finally {
                this.popupBusy = false;
            }
            if (result.ok) {
                this._recordRecent(item);
                if (this.isOpen) {
                    // 默认开启时顺带说明去哪里关闭，免得用户以为是故障。
                    const hint = this.openModeChosen ? '' : '（弹窗优先默认开启，可在右上角关闭）';
                    this._setStatus(result.reused ? `已在已有的独立窗口切换到 ${item.nick}${hint}` : `已在独立窗口打开 ${item.nick}${hint}`);
                }
                return;
            }
            // 弹窗被拦截或无法创建：退回内嵌播放，并在画面上说明，不让点击落空。
            if (this.isOpen && !this.player) this._playEmbedded(item, { toast: '弹窗被浏览器拦截或无法打开，已改为在这里内嵌播放。' });
        }

        _playEmbedded(item, { toast = '' } = {}) {
            const content = this.panel.querySelector('.hy-content');
            // 第一次从列表进入时记下滚动位置；在播放器里经“继续浏览”换房间时沿用最初的位置。
            const origin = this.player?.origin || { view: this.view, categoryId: this.categoryId, scrollTop: content ? content.scrollTop : 0 };
            const rail = this.player?.rail || this._itemsForCurrentView();
            this._removeFrame();
            // 进行中的关注读取或推荐请求继续完成并更新状态，返回列表时再显示；这里只替换舞台。
            this.player = { item, origin, rail, poppedOut: false };
            this.panel.classList.add('is-player');
            this._setTitle('播放器');
            this._setStatus('');
            this._recordRecent(item);
            const fromLabel = originLabel(origin);
            this.stage.innerHTML = playerMarkup(item, { fromLabel, rail, wide: this.playerMode.wide, immersive: this.playerMode.immersive, toast });
            if (toast) this.toastTimer = setTimeout(() => this.stage.querySelector('[data-hy-toast]')?.remove(), 9_000);
            // 内容容器沿用了列表的滚动位置；不归零的话，播放器顶部和“返回”按钮会被卷到可视区上方。
            if (content) content.scrollTop = 0;
            this.stage.querySelector('.hy-ctx-back')?.focus?.({ preventScroll: true });
            const frame = this.stage.querySelector('.hy-player-frame');
            const overlay = this.stage.querySelector('.hy-frame-loading');
            const reveal = () => { if (overlay) overlay.hidden = true; };
            frame?.addEventListener('load', reveal, { once: true });
            // 官方播放器首次连接可能很慢；超过期限后让出遮罩，由播放器自己的界面承担后续提示。
            this.frameNoticeTimer = setTimeout(reveal, FRAME_NOTICE_TIMEOUT_MS);
        }

        _backToList() {
            const player = this.player;
            if (!player) return;
            this._removeFrame();
            this._clearPlayer();
            const { origin } = player;
            const focusCard = `[data-hy-play="${CSS.escape(player.item.id)}"], [data-hy-open="${CSS.escape(player.item.id)}"]`;
            const restoreScroll = () => {
                const content = this.panel.querySelector('.hy-content');
                if (content) content.scrollTop = origin.scrollTop || 0;
            };
            if (origin.view === 'follow') {
                this._setTitle('我的关注');
                this.view = 'follow';
                this._syncNav();
                if (this.follow.data) { this._renderFollow({ refreshing: this.follow.busy }, focusCard); restoreScroll(); }
                else void this._showView('follow');
            } else if (origin.view === 'recent') {
                this.view = 'recent';
                this._syncNav();
                this._loadRecent();
                this.stage.querySelector(focusCard)?.focus?.({ preventScroll: true });
                restoreScroll();
            } else {
                this.categoryId = origin.categoryId;
                this.view = 'recommend';
                this._syncNav();
                if (this.recommend.get(this.categoryId)) {
                    this._setTitle(Core.categoryById(this.categoryId).label);
                    this._renderRecommend({}, focusCard);
                    restoreScroll();
                } else void this._showView('recommend');
            }
        }

        // ---- 播放器模式：宽屏（隐藏侧栏）、网页全屏、弹窗观看 ----
        // 这些都只改 class / 属性，不重绘舞台，iframe 不会被重新加载。

        _clearPlayer() {
            this.player = null;
            this.panel?.classList.remove('is-player');
            this._setImmersive(false);
        }

        _toggleWide() {
            this.playerMode.wide = !this.playerMode.wide;
            this.panel.classList.toggle('is-wide', this.playerMode.wide);
            this._persist();
            this._syncPlayerControls();
        }

        _setImmersive(on) {
            this.playerMode.immersive = Boolean(on);
            this.panel?.classList.toggle('is-immersive', this.playerMode.immersive);
            this._syncPlayerControls();
        }

        _syncPlayerControls() {
            const wide = this.panel?.querySelector('[data-hy-action="toggle-wide"]');
            if (wide) {
                wide.setAttribute('aria-pressed', String(this.playerMode.wide));
                wide.classList.toggle('is-on', this.playerMode.wide);
            }
            const immersive = this.panel?.querySelector('[data-hy-action="toggle-immersive"]');
            if (immersive) {
                // 开关按钮的名称保持不变，开/关状态只由 aria-pressed 表达（名称和状态同时变化会让读屏用户听到“退出…已按下”）；提示文字随状态变化。
                immersive.setAttribute('aria-pressed', String(this.playerMode.immersive));
                immersive.classList.toggle('is-on', this.playerMode.immersive);
                immersive.title = this.playerMode.immersive ? IMMERSIVE_TITLE_ON : IMMERSIVE_TITLE_OFF;
                const icon = immersive.querySelector('i');
                if (icon) icon.className = this.playerMode.immersive ? 'fas fa-compress' : 'fas fa-expand';
            }
        }

        async _popOut() {
            const player = this.player;
            const url = player ? safeLink(player.item) : '';
            if (!url || player.poppedOut || this.popupBusy) return;
            this.popupBusy = true;
            let result;
            try {
                result = await this.popupWatcher.open(url, popupSize(globalThis.screen));
            } finally {
                this.popupBusy = false;
            }
            // 等待窗口创建期间用户可能已经返回列表、换了房间或关闭工作台。
            if (this.player !== player || !this.isOpen) return;
            if (!result.ok) {
                this._setStatus('弹窗被浏览器拦截或无法打开，请改用“在虎牙打开”');
                return;
            }
            player.poppedOut = true;
            this._recordRecent(player.item);
            this._removeFrame();
            this._setImmersive(false);
            const wrap = this.stage.querySelector('.hy-frame-wrap');
            if (wrap) {
                const fromLabel = originLabel(player.origin);
                wrap.innerHTML = handoffMarkup(player.item, fromLabel);
                wrap.querySelector('[data-hy-action="resume-embed"]')?.focus?.({ preventScroll: true });
            }
            this._setStatus('已在独立窗口打开');
        }

        async _copyLink() {
            const url = this.player ? safeLink(this.player.item) : '';
            if (!url) return;
            try {
                await navigator.clipboard.writeText(url);
                this._setStatus('直播间链接已复制');
            } catch {
                this._setStatus('复制失败，请使用“在虎牙打开”后从地址栏复制');
            }
        }
    }

    window.HuyaWorkbench = Object.freeze({
        escapeHtml, relativeTime, errorMessage, summarize, isEmbeddable, cardMarkup, followMarkup, recommendMarkup,
        playerMarkup, handoffMarkup, followGroupsMarkup, followInfoMarkup, loginMarkup, failureMarkup, emptyFollowMarkup, railMarkup, fetchLiveList,
        recentMarkup, resumeMarkup, groupChipsMarkup, assignSheetMarkup, manageSheetMarkup, groupErrorMessage, createPopupWatcher, createTheaterAssist,
        popupSize, openPopupWindow, PLAYER_SANDBOX, PLAYER_ALLOW, TRIAL_NOTE,
    });
    window.huyaController = new HuyaController();
})();
