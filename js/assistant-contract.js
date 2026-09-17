(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantContract = api;
})(globalThis, function () {
  'use strict';
  const Match = typeof module === 'object' && module.exports ? require('./assistant-match.js') : globalThis.AssistantMatch;
  const Memory = typeof module === 'object' && module.exports ? require('./assistant-memory.js') : globalThis.AssistantMemory;
  const Music = typeof module === 'object' && module.exports ? require('./music-intent.js') : globalThis.MusicIntent;
  const apps = [
    { id: 'music', name: '音乐', aliases: ['音乐', '网易云', '网易云音乐', 'music'], description: '点歌、播放控制与定时停止' },
    { id: 'alarm', name: '闹钟', aliases: ['闹钟', '提醒', 'alarm'], description: '创建提醒、查看已有闹钟' },
    { id: 'bilibili', name: '哔哩哔哩', aliases: ['哔哩哔哩', 'B站', 'b站', 'bili', 'bilibili'], description: '搜索视频、找回观看记录' },
    { id: 'youtube', name: 'YouTube', aliases: ['YouTube', 'youtube', '油管', 'yt'], description: '搜索视频、查询本地观看记录' }
  ];
  const skills = [
    { id: 'music-search', name: '搜索音乐', apps: ['music'], description: '综合搜索歌曲、歌手与歌单' },
    { id: 'music-artist', name: '歌手', apps: ['music'], description: '查找歌手并浏览热门歌曲' },
    { id: 'music-album', name: '专辑', apps: ['music'], description: '搜索专辑，浏览曲目或整张加入队列' },
    { id: 'music-playlist', name: '歌单', apps: ['music'], description: '查找歌单并浏览曲目' },
    { id: 'music-song', name: '歌曲', apps: ['music'], description: '查找歌曲、播放或加入队列' },
    { id: 'play', name: '播放', apps: ['music'], description: '搜索真实歌曲，选择后播放' },
    { id: 'pause', name: '暂停', apps: ['music'], description: '暂停当前音乐' },
    { id: 'resume', name: '继续播放', apps: ['music'], description: '恢复当前音乐' },
    { id: 'next', name: '下一首', apps: ['music'], description: '播放队列中的下一首' },
    { id: 'sleep', name: '定时停止', apps: ['music'], description: '设置或取消音乐定时' },
    { id: 'remind', name: '创建提醒', apps: ['alarm'], description: '理解时间，确认后创建闹钟' },
    { id: 'alarms', name: '查看提醒', apps: ['alarm'], description: '查看已设置的闹钟' },
    { id: 'search', name: '找视频', apps: ['bilibili', 'youtube'], description: '检索视频并展示候选' },
    { id: 'history', name: '继续看', apps: ['bilibili', 'youtube'], description: '找回记录，在原站打开并携带进度' }
  ];
  const toolGroups = {
    'app.connection': { apps: apps.map(a => a.id), title: '查询账号连接或通知权限状态', tools: ['app.status'] },
    'music.playback': { app: 'music', title: '读取播放状态、设置随机/循环模式、播放已有队列', tools: ['music.state', 'music.playback.setMode', 'music.queue.play', 'music.playback.control'] },
    'music.library': { app: 'music', title: '音乐搜索继续下一页，保留关键词及对象类型', tools: ['music.search.next'] },
    'music.edit': { app: 'music', title: '音乐定位进度、移除歌曲与清空本地队列', tools: ['music.playback.seek', 'music.queue.remove', 'music.queue.clear'] },
    'alarm.manage': { app: 'alarm', title: '查看、修改、开关或删除已有提醒', tools: ['alarm.get', 'alarm.update.prepare', 'alarm.toggle', 'alarm.delete.prepare'] },
    'video.inspect': { apps: ['bilibili', 'youtube'], title: '视频详情、观看进度、打开已选视频及翻页', tools: ['video.details', 'video.progress.get', 'video.open', 'video.search.next'] },
    'music.queue': { app: 'music', title: '查看队列、读取歌单/专辑曲目、追加或替换队列', tools: ['music.queue.list', 'music.collection.get', 'music.queue.apply'] }
  };
  const tools = {
    'memory.manage': { app: 'music', title: '查看或保存明确的音乐偏好', fields: ['text'] },
    'app.status': { apps: apps.map(a => a.id), title: '只读查询连接状态，不发起授权', fields: ['platform'], enums: { platform: apps.map(a => a.id) }, readOnly: true },
    'tools.load': { title: '准备后续操作', fields: ['group'], enums: { group: Object.keys(toolGroups) }, readOnly: true },
    'music.state': { app: 'music', title: '读取真实播放状态与队列数量', fields: [], readOnly: true },
    'music.queue.list': { app: 'music', title: '分页读取当前队列', fields: ['offset', 'limit'], optional: ['offset', 'limit'], readOnly: true },
    'music.playback.setMode': { app: 'music', title: '仅设置播放模式，不开始播放', fields: ['mode', 'expectedRevision'], enums: { mode: ['sequence', 'loop', 'single', 'shuffle'] } },
    'music.queue.play': { app: 'music', title: '真正开始播放队列；可同时指定播放模式', fields: ['expectedRevision', 'ref', 'mode'], optional: ['ref', 'mode'], enums: { mode: ['sequence', 'loop', 'single', 'shuffle'] } },
    'music.collection.get': { app: 'music', title: '读取真实集合引用的曲目，最多300首', fields: ['ref'], readOnly: true },
    'music.queue.apply': { app: 'music', title: '把已选曲目应用到本地队列', fields: ['ref', 'mode', 'startPlayback', 'expectedRevision'], enums: { mode: ['append', 'replace'] } },
    'music.search.next': { app: 'music', title: '使用上次搜索的nextRef读取下一页', fields: ['ref'], readOnly: true },
    'music.playback.control': { app: 'music', title: '暂停、继续、上下首或设置音量', fields: ['action', 'value', 'expectedRevision'], optional: ['value'], enums: { action: ['pause', 'resume', 'next', 'previous', 'volume'] } },
    'music.playback.seek': { app: 'music', title: '定位音乐进度，秒数必须在曲目时长内', fields: ['seconds', 'expectedRevision'] },
    'music.queue.remove': { app: 'music', title: '移除队列中的指定歌曲，当前曲目先显示确认卡', fields: ['ref', 'expectedRevision'] },
    'music.queue.clear': { app: 'music', title: '准备清空本地队列并停止播放，确认后执行', fields: ['expectedRevision'] },
    'alarm.get': { app: 'alarm', title: '读取已有提醒详情', fields: ['ref'], readOnly: true },
    'alarm.update.prepare': { app: 'alarm', title: '修改已有提醒的名称、日期或时间，确认后保存', fields: ['ref', 'label', 'date', 'time', 'dayOffset'], optional: ['label', 'date', 'time', 'dayOffset'] },
    'alarm.toggle': { app: 'alarm', title: '开启或关闭已有提醒', fields: ['ref', 'enabled'] },
    'alarm.delete.prepare': { app: 'alarm', title: '准备删除已有提醒，确认后执行', fields: ['ref'] },
    'video.details': { apps: ['bilibili', 'youtube'], title: '读取真实视频标题、作者、时长及发布时间', fields: ['platform', 'ref'], readOnly: true },
    'video.progress.get': { apps: ['bilibili', 'youtube'], title: '读取已选视频的已知观看进度及来源', fields: ['platform', 'ref'], readOnly: true },
    'video.open': { apps: ['bilibili', 'youtube'], title: '打开用户已选视频并携带已知进度', fields: ['platform', 'ref'] },
    'video.search.next': { apps: ['bilibili', 'youtube'], title: '使用上一页的nextRef继续检索，保留原查询与筛选', fields: ['platform', 'ref'], readOnly: true },
    'music.search': { app: 'music', title: '搜索音乐对象', fields: ['kind', 'query'] },
    'music.intent': { app: 'music', title: '检索与控制音乐', fields: ['text'] },
    'music.sleep': { app: 'music', title: '设置音乐定时', fields: ['minutes'] },
    'alarm.prepare': { app: 'alarm', title: '准备提醒', fields: ['text'] },
    'alarm.list': { app: 'alarm', title: '按名称查找已有提醒并返回真实引用', fields: ['query', 'offset', 'limit'], optional: ['query', 'offset', 'limit'], readOnly: true },
    'video.search': { apps: ['bilibili', 'youtube'], title: '搜索视频，可按真实时长筛选，秒为单位', fields: ['platform', 'query', 'minSeconds', 'maxSeconds'], optional: ['minSeconds', 'maxSeconds'], readOnly: true },
    'video.history': { title: '查询观看记录', fields: ['platform', 'query', 'dayOffset', 'unfinishedOnly'], optional: ['dayOffset', 'unfinishedOnly'] }
  };
  function inputHint(app, skill) {
    const actionHints = {
      'music-search': '搜索歌手、专辑、歌单或歌曲，例如：张杰',
      'music-album': '输入专辑名称，例如：这，就是爱',
      'music-artist': '输入歌手名字，例如：张杰',
      'music-playlist': '输入歌单名称或关键词，例如：张杰精选',
      'music-song': '输入歌名或歌手，例如：张杰的逆战',
      sleep: '例如：30分钟后停止音乐，输入0取消定时',
      alarms: '按 Enter 查看已有提醒',
      remind: '例如：明天下午三点提醒我开会',
      history: '例如：继续昨天没看完的 MySQL 视频',
      search: '输入视频标题或主题关键词',
      pause: '按 Enter 暂停音乐', resume: '按 Enter 继续播放音乐', next: '按 Enter 播放下一首'
    };
    if (skills.some(item => item.id === skill && (!app || item.apps.includes(app))) && actionHints[skill]) return actionHints[skill];
    return ({ music: '搜索歌手、专辑、歌单或歌曲，例如：张杰', alarm: '例如：30分钟后提醒我休息',
      bilibili: '搜索 B 站视频，或继续上次没看完的视频', youtube: '搜索 YouTube 视频，或继续上次观看' })[app]
      || '输入 @ 选择应用，或说说你想做什么…';
  }
  const allows = (entry, app) => !app || entry.app === app || entry.apps?.includes(app);
  const clean = (s, max = 500) => { if (typeof s !== 'string' || s.length > max) throw new Error('输入内容无效或过长'); return s.trim(); };
  function aiSelection(value) {
    if (value == null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['model', 'reasoning'].includes(key))) throw new Error('AI 选择无效');
    const result = {};
    if (value.model != null) {
      if (typeof value.model !== 'string' || value.model.includes('://') || !/^[a-zA-Z0-9_./:-]{1,160}$/.test(value.model)) throw new Error('模型标识无效');
      result.model = value.model;
    }
    if (value.reasoning != null) {
      if (!['off', 'low', 'medium', 'high', 'xhigh', 'on'].includes(value.reasoning)) throw new Error('思考强度无效');
      result.reasoning = value.reasoning;
    }
    return Object.keys(result).length ? result : null;
  }
  const uniqueMatch = (items, value, fields) => { const found = Match?.rank(items, value, fields) || []; return found.length === 1 ? found[0].id : undefined; };
  const appId = value => apps.find(a => a.id === value || a.aliases.some(x => x.toLowerCase() === String(value).toLowerCase()))?.id || uniqueMatch(apps, value, a => [a.name, ...a.aliases]);
  function input(value) {
    let text = clean(value?.text || ''), app = value?.app || null, skill = value?.skill || null;
    if (app && !apps.some(a => a.id === app)) throw new Error('请选择已接入的应用');
    // Only leading command tokens are syntax; URLs and email addresses inside prose stay intact.
    for (let i = 0; i < 2; i++) {
      const match = text.match(/^([@/])([^\s]+)(?:\s+|$)/);
      if (!match) break;
      if (match[1] === '@') { app = appId(match[2]); if (!app) throw new Error('未识别的应用，请从 @ 菜单选择'); }
      else { skill = skills.find(s => s.id === match[2] || s.name === match[2])?.id || uniqueMatch(skills.filter(s => !app || s.apps.includes(app)), match[2], s => [s.name, s.id]); if (!skill) throw new Error('未识别的动作，请从 / 菜单选择'); }
      text = text.slice(match[0].length).trim();
    }
    const selected = skills.find(s => s.id === skill);
    if (skill && !selected) throw new Error('动作无效');
    if (selected && !app && selected.apps.length === 1) app = selected.apps[0];
    if (selected && app && !selected.apps.includes(app)) throw new Error('这个动作不适用于已选应用');
    if (!text && !['pause', 'resume', 'next', 'alarms', 'history'].includes(skill)) throw new Error('请描述要执行的需求');
    return { text, app, skill };
  }
  function validatePlan(raw, selectedApp = null) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['steps', 'question', 'continue', 'done'].includes(k))) throw new Error('助手计划格式无效');
    if (raw.continue != null && typeof raw.continue !== 'boolean') throw new Error('继续执行标记无效');
    if (raw.done != null) {
      if (typeof raw.done !== 'boolean' || raw.question != null) throw new Error('完成标记无效');
      // Some models redundantly attach done to an executable plan. Actions still
      // go through the same strict validation and must finish before completion.
      if (Array.isArray(raw.steps) && raw.steps.length) {
        const { done, ...planned } = raw;
        return validatePlan({ ...planned, continue: raw.continue ?? !done }, selectedApp);
      }
      if (!raw.done || (raw.steps != null && !Array.isArray(raw.steps)) || raw.continue === true) throw new Error('完成时不能同时执行动作');
      return { done: true, steps: [] };
    }
    if (raw.question != null) {
      if (raw.steps?.length || raw.continue) throw new Error('追问时不能同时执行动作');
      const question = clean(raw.question, 250); if (!question) throw new Error('追问内容为空'); return { question, steps: [] };
    }
    if (!Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 3) throw new Error('一次最多执行三个步骤');
    const steps = raw.steps.map(step => {
      if (!step || Object.keys(step).some(k => !['tool', 'args'].includes(k)) || !Object.hasOwn(tools, step.tool)) throw new Error('助手选择了未接入的工具');
      const tool = tools[step.tool], args = step.args;
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !tool.fields.includes(k)) || tool.fields.some(k => !tool.optional?.includes(k) && !Object.hasOwn(args, k))) throw new Error('工具参数无效');
      const result = {};
      for (const field of tool.fields) {
        if (!Object.hasOwn(args, field)) continue;
        if (tool.enums?.[field]) { if (!tool.enums[field].includes(args[field])) throw new Error('工具参数枚举无效'); result[field] = args[field]; continue; }
        if (field === 'offset' || field === 'limit') { if (!Number.isInteger(args[field]) || args[field] < (field === 'limit' ? 1 : 0) || args[field] > (field === 'limit' ? 20 : 300)) throw new Error('分页参数无效'); result[field] = args[field]; continue; }
        if (field === 'value') { if (!Number.isFinite(args.value) || args.value < 0 || args.value > 1) throw new Error('音量必须为0至1'); result.value = args.value; continue; }
        if (['seconds', 'minSeconds', 'maxSeconds'].includes(field)) { if (!Number.isFinite(args[field]) || args[field] < 0 || args[field] > 86400) throw new Error('秒数必须在0至86400之间'); result[field] = args[field]; continue; }
        if (field === 'date') { if (typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(args.date) || new Date(args.date + 'T12:00:00Z').toISOString().slice(0, 10) !== args.date) throw new Error('日期无效'); result.date = args.date; continue; }
        if (field === 'time') { if (typeof args.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time)) throw new Error('时间必须为24小时HH:mm'); result.time = args.time; continue; }
        if (field === 'label') { result.label = clean(args.label, 80); if (!result.label) throw new Error('提醒名称不能为空'); continue; }
        if (field === 'enabled' || field === 'startPlayback') { if (typeof args[field] !== 'boolean') throw new Error('播放标记无效'); result[field] = args[field]; continue; }
        if (field === 'ref') { if (typeof args[field] !== 'string' || !/^r[0-9]{1,4}$/.test(args[field])) throw new Error('资源引用无效'); result[field] = args[field]; continue; }
        if (field === 'kind') { if (!['auto', 'song', 'artist', 'album', 'playlist'].includes(args.kind)) throw new Error('音乐对象类型无效'); result.kind = args.kind; continue; }
        if (field === 'dayOffset') { if (!Number.isInteger(args[field]) || args[field] < 0 || args[field] > 30) throw new Error('仅支持最近30天的日期条件'); result[field] = args[field]; continue; }
        if (field === 'unfinishedOnly') { if (typeof args[field] !== 'boolean') throw new Error('观看状态条件无效'); result[field] = args[field]; continue; }
        if (field === 'minutes') { if (!Number.isInteger(args.minutes) || args.minutes < 0 || args.minutes > 240) throw new Error('定时应为 0 至 240 分钟'); result.minutes = args.minutes; }
        else if (field === 'platform') { if (!['bilibili', 'youtube'].includes(args.platform)) throw new Error('视频平台无效'); result.platform = args.platform; }
        else { result[field] = clean(args[field], field === 'query' ? 120 : 500); if (!result[field] && !['video.history', 'alarm.list'].includes(step.tool)) throw new Error('工具输入不能为空'); }
      }
      if (step.tool === 'music.playback.control' && ((result.action === 'volume') !== (result.value != null))) throw new Error('仅音量操作必须提供value');
      if (step.tool === 'alarm.update.prepare' && (Object.keys(result).length < 2 || (result.date && result.dayOffset != null))) throw new Error('请提供一个明确的修改，日期与相对日期不能同时指定');
      if (result.minSeconds != null && result.maxSeconds != null && result.minSeconds > result.maxSeconds) throw new Error('时长范围无效');
      if (selectedApp && !(step.tool === 'tools.load' ? allows(toolGroups[result.group], selectedApp) : (tool.app || result.platform) === selectedApp)) throw new Error('计划超出了已选择应用的范围');
      return { tool: step.tool, args: result };
    });
    if (steps.some(s => s.tool === 'tools.load') && (steps.length !== 1 || raw.continue !== true)) throw new Error('加载工具后必须重新规划');
    if (raw.continue && steps.length !== 1) throw new Error('逐步决策每轮只执行一个工具');
    return { steps, ...(raw.continue ? { continue: true } : {}) };
  }
  function localPlan(raw) {
    const value = input(raw), { app, skill, text } = value;
    if ((!app || app === 'music') && Memory?.command(text)) return validatePlan({ steps: [{ tool: 'memory.manage', args: { text } }] }, app);
    if ((!app || app === 'music') && Music?.artistRequest(text)) return validatePlan({ steps: [{ tool: 'music.intent', args: { text } }] }, app);
    if (/登录|连接|权限|授权|下一页|翻页|继续搜索/.test(text)) return null;
    const step = (tool, args) => validatePlan({ steps: [{ tool, args }] }, app);
    if ((app === 'alarm' || /提醒|闹钟/.test(text)) && /修改|改成|改到|改为|删除|取消|关闭|开启|启用|停用|重命名/.test(text)) return null;
    if ((!app || app === 'music') && /跳到|快进|进度|清空|移除|删除.*(?:歌|曲)/.test(text)) return null;
    // State-dependent requests must not be swallowed by the single-action music parser.
    if ((!app || app === 'music') && /如果|否则|没有.*(?:就|则)|有.*(?:就|则)|队列|播放列表|随机|循环|当前.*播放|正在.*播放/.test(text)) return null;
    if (skill === 'music-album') return step('music.search', { kind: 'album', query: text });
    const musicSearch = { 'music-search': '搜索', 'music-artist': '搜索歌手', 'music-playlist': '搜索歌单', 'music-song': '搜索歌曲' };
    if (Object.hasOwn(musicSearch, skill)) return step('music.intent', { text: /^(?:播放|直接播放|听|我想听|搜索|查找|找|搜|查看|打开)/.test(text) ? text : musicSearch[skill] + text });
    const duration = value => value === '半小时' ? 30 : Number.parseInt(value, 10) * (value.includes('小时') ? 60 : 1);
    if (app === 'music') {
      const combined = text.match(/^(.+?)[，,；;]\s*(?:然后|并且)?\s*(半小时|\d+\s*分钟|\d+\s*小时)后(?:暂停|停止|关闭)(?:音乐|播放)?[。！!]?$/);
      if (combined) {
        const album = combined[1].match(/^(?:播放|搜索|打开)?专辑\s*[《“"]?(.+?)[》”"]?$/);
        const first = album ? { tool: 'music.search', args: { kind: 'album', query: album[1] } } : { tool: 'music.intent', args: { text: combined[1] } };
        return validatePlan({ steps: [first, { tool: 'music.sleep', args: { minutes: duration(combined[2]) } }] }, app);
      }
      if (skill === 'sleep') {
        const match = text.match(/^(半小时|\d+\s*分钟|\d+\s*小时|0)(?:后(?:暂停|停止|关闭)(?:音乐|播放)?)?$/);
        if (match) return step('music.sleep', { minutes: duration(match[1]) });
        return null;
      }
    }
    if (skill === 'alarms') return text ? null : step('alarm.list', {});
    if ((!app || app === 'alarm') && /^(?:查看|看看|列出)(?:已有|我的|全部)?(?:提醒|闹钟)(?:列表)?$/.test(text)) return step('alarm.list', {});
    if (['pause', 'resume', 'next'].includes(skill)) {
      // Extra prose can add constraints or negate an action; do not silently discard it.
      if (text) return null;
      return step('music.intent', { text: { pause: '暂停', resume: '继续播放', next: '下一首' }[skill] });
    }
    if (skill === 'history' && !text) return app ? step('video.history', { platform: app, query: '' }) : { question: '在哪个平台继续看？请选择 @哔哩哔哩 或 @YouTube。', steps: [] };
    if (skill === 'search' && text && app && !/[，,；;]|以内|分钟|时长|不要|推荐|适合/.test(text)) return step('video.search', { platform: app, query: text.replace(/^(?:找视频|搜索|搜|找)\s*/, '') });
    const album = text.match(/^(?:搜索|查找|找|搜|打开|播放)?专辑\s*[《“"]?(.+?)[》”"]?$/);
    if ((!app || app === 'music') && album && !/[；;]|然后|分钟后/.test(text)) return step('music.search', { kind: 'album', query: album[1] });
    if (app === 'alarm') return step(skill === 'alarms' ? 'alarm.list' : 'alarm.prepare', skill === 'alarms' ? {} : { text });
    if (!app && /提醒|闹钟/.test(text) && !/音乐|歌曲|视频|播放/.test(text)) return step('alarm.prepare', { text });
    if (app === 'music' && !/[，,；;]|然后|并且/.test(text)) return step('music.intent', { text: skill === 'play' && !/^(播放|听|搜|找)/.test(text) ? '播放' + text : text });
    return null;
  }
  function ordinal(text) {
    const match = String(text || '').trim().match(/^(直接)?\s*(播放|放|听|选择|打开|就)?\s*第?\s*(\d{1,3}|[一二两三四五六七八九十百]+)\s*(?:个|首|条)?\s*(?:播放|就行|吧)?[。！!]?$/);
    if (!match) return null;
    const digits = { 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
    const n = /^\d+$/.test(match[3]) ? Number(match[3]) : match[3] === '一百' ? 100 : match[3].includes('十') ? (digits[match[3].split('十')[0]] || 1) * 10 + (digits[match[3].split('十')[1]] || 0) : digits[match[3]];
    return { index: n || 0, play: /直接|播放|放|听/.test(match[0]) };
  }
  function routeRequest(raw, current) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('需求输入无效');
    if (raw.newConversation != null && typeof raw.newConversation !== 'boolean') throw new Error('新需求标记无效');
    if (raw.inheritedScope != null && typeof raw.inheritedScope !== 'boolean') throw new Error('应用来源标记无效');
    const parsed = input({ ...raw, ...(raw.inheritedScope ? { app:null, skill:null } : {}) }), aiSpecified = Object.hasOwn(raw, 'ai'), selectedAI = aiSelection(raw.ai);
    const text = parsed.text.replace(/^(?:(?:请|麻烦|帮我)\s*)+/, ''), scope = current?.scope;
    const reference = Boolean(ordinal(text)) || /这个|那个|这些|那些|这首|那首|这张|那张|刚才|刚刚|上次|上面|上一轮|他的|她的|它的|该歌手|第\s*[\d一二两三四五六七八九十]+/.test(text)
      || /^(?:继续|换一个|换一首|改成|改为|改到|换成|再来|重试|重新试|下一页|翻页|下一首|上一首|暂停|恢复播放|停止播放|取消定时)/.test(text)
      || (scope === 'music' && /(?:分钟|小时).*?(?:停止|暂停|关闭)(?:播放|音乐)?/.test(text))
      || (scope === 'music' && /^(?:直接)?(?:播放|放|听)(?:热门歌曲|热门歌)(?:吧|一下)?$/.test(text));
    const correction = /(?:输错|说错|打错|写错|不是这个|重新搜|重新搜索|改搜)/.test(text);
    const bareSearchTerm = /^[^，,。！？!?；;]{1,40}$/.test(text)
      && !/^(?:继续|换一个|换一首|再来|再看看|看看|更多|重试|重新试|下一页|翻页|下一首|上一首|暂停|恢复播放|停止播放|取消定时|返回)/.test(text)
      && !/(?:怎么样|好听吗|好听么|可以吗|行吗|是谁|是什么|为什么|为何|吗|么|呢|吧|呀)$/.test(text);
    let inferred = /(?:YouTube|油管)/i.test(text) ? 'youtube' : /B站|哔哩哔哩/i.test(text) ? 'bilibili'
      : /提醒我|提醒一下|闹钟|(?:创建|设置|新增|查看|看看|列出).{0,20}提醒/.test(text) ? 'alarm'
      : /音乐|歌手|歌曲|专辑|歌单|下一首|上一首|(?:分钟|小时).*?(?:停止|暂停)播放/.test(text) || /^(?:暂停|继续播放|恢复播放|停止播放)(?:音乐|一下|吧)?$/.test(text) ? 'music' : null;
    const independentSearch = (/^(?:搜索|查找|搜|找|播放|听|查看|看看|列出)\s*\S/.test(text) || Boolean(Music?.artistRequest(text)) || Boolean(Memory?.command(text))) && !reference;
    // A fresh named music query may keep the domain, but never the previous candidates or plan.
    if (!inferred && independentSearch && scope === 'music' && !raw.newConversation) inferred = 'music';
    const changedScope = Boolean(current && parsed.app && parsed.app !== scope);
    const standaloneSkill = ['music-search','music-artist','music-album','music-playlist','music-song','play','remind','alarms','search','history'].includes(parsed.skill);
    // Once real search results are visible, a new standalone term replaces the
    // search context. References and answers to a clarification still continue.
    const replaceSearch = !raw.newConversation && !changedScope && scope === 'music' && current?.musicView?.kind === 'search'
      && (correction || (!reference && bareSearchTerm));
    const fresh = raw.newConversation === true || !current || changedScope || Boolean(inferred && inferred !== scope) || (!reference && (standaloneSkill || independentSearch || /提醒我|提醒一下|(?:创建|设置|新增).{0,20}(?:提醒|闹钟)/.test(text)));
    const app = parsed.app || inferred || (!fresh ? scope : null) || null;
    const mode = replaceSearch ? 'replace' : fresh ? 'new' : 'continue';
    return { mode, input:{ ...parsed, app, ...(aiSpecified ? { ai:selectedAI } : {}) }, reason:raw.newConversation ? '快捷键新需求' : !current ? '首次需求' : changedScope ? '切换应用' : replaceSearch ? (correction ? '纠正上次搜索' : '替换搜索关键词') : fresh ? '独立需求' : reference ? '引用当前会话' : '保留上下文' };
  }
  return Object.freeze({ apps, skills, tools, toolGroups, allows, input, appId, inputHint, aiSelection, validatePlan, localPlan, ordinal, routeRequest });
});
