(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantMemory = api;
})(globalThis, function () {
  'use strict';
  const preferences = Object.freeze({
    artistDefaultAction: { label: '省略动词的歌手热门歌曲', values: ['play', 'browse'], default: 'play' },
    artistQueueMode: { label: '自然语言播放歌手热门歌曲', values: ['append', 'replace'], default: 'append' }
  });
  const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const historical = text => /上次|之前|以前|最近|昨天|前天|搜过|搜索过|听过|播放过|找过|经历/.test(text);
  const recallQuestion = text => historical(text) && /谁|哪些|什么|哪位|哪[个首些]|查看|看看|回顾|记得|记忆|经历/.test(text) && !/[，,；;].*(?:播放|打开|添加|创建|设置)|(?:然后|并且|再帮我).*(?:播放|打开|添加|创建|设置)|^(?:请)?(?:再|继续)?(?:播放|打开|添加|创建|设置)/.test(text);
  function command(text) {
    const value = String(text || '').trim();
    if (/^(?:查看|看看|显示)(?:我的|音乐)?记忆[。！!？?]?$/.test(value)) return { operation: 'list' };
    if (!/^(?:请)?(?:记住|记一下|以后|今后)/.test(value) || /今天|这次|暂时|如果/.test(value)) return null;
    const note = () => {
      const content = value.replace(/^(?:请)?(?:记住|记一下)\s*[：:]?\s*/, '').trim();
      return /^(?:请)?(?:记住|记一下)/.test(value) && content && content.length <= 300 ? { operation: 'note', value: content } : null;
    };
    if (!/歌手|热门歌/.test(value)) return note();
    if (/先展示|先显示|只搜索|不要自动播放|不自动播放/.test(value)) return { operation: 'preference', key: 'artistDefaultAction', value: 'browse' };
    if (/直接播放|自动播放|就是.*(?:播放|听)|默认.*播放/.test(value)) return { operation: 'preference', key: 'artistDefaultAction', value: 'play' };
    if (/保留.*队列|追加.*队列/.test(value)) return { operation: 'preference', key: 'artistQueueMode', value: 'append' };
    if (/替换.*队列/.test(value)) return { operation: 'preference', key: 'artistQueueMode', value: 'replace' };
    return note();
  }
  function effective(snapshot) {
    const result = Object.fromEntries(Object.entries(preferences).map(([key, spec]) => [key, spec.default]));
    if (snapshot?.enabled !== false) for (const row of snapshot?.preferences || []) {
      if (Object.hasOwn(preferences, row.key) && preferences[row.key].values.includes(row.value)) result[row.key] = row.value;
    }
    return result;
  }
  function candidate(choices, query, snapshot, { rememberedOnly = false } = {}) {
    const artists = choices.filter(c => !c.secondary && c.kind === 'artist');
    const saved = snapshot?.enabled !== false && snapshot?.artists?.find(row => row.key === normalize(query));
    if (saved) {
      const matches = artists.filter(c => c.data.id === saved.artistId && normalize(c.title) === normalize(saved.name));
      // A remembered ID must be present in fresh results. Never fall back to a namesake.
      return matches.length === 1 ? { choice: matches[0], reason: '已记住的歌手选择' } : null;
    }
    if (rememberedOnly) return null;
    const exact = artists.filter(c => normalize(c.title) === normalize(query));
    return exact.length === 1 ? { choice: exact[0], reason: '歌手名称唯一精确匹配' } : null;
  }
  const scopeFor = (text, app = null) => app || (/B站|哔哩/.test(text) ? 'bilibili' : /YouTube|油管/i.test(text) ? 'youtube' : /提醒|闹钟/.test(text) ? 'alarm' : /歌手|音乐|歌曲|爵士|摇滚|民谣|队列|播放|听过/.test(text) ? 'music' : null);
  // Retrieval is a bounded lexical projection of saved facts, never authority.
  function recall(snapshot, text, { app = null, now = Date.now(), limit = 5 } = {}) {
    if (!snapshot?.enabled) return [];
    const scope = scopeFor(text, app);
    const generic = new Set(['我', '我的', '人', '继续', '找到', '的', '了', '过', '是', '在', '把', '请', '帮', '帮我', '什么', '谁', '哪些', '哪位', '哪个', '上次', '之前', '以前', '最近', '昨天', '前天', '搜索', '搜索过', '搜过', '找过', '听过', '播放过', '搜', '查找', '播放', '听', '找', '查看', '看看', '记忆', '经历', '歌手', '歌曲', '音乐', '视频', '热门', '一下', '那个', '那个人']);
    const words = [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(normalize(text))].filter(s => s.isWordLike && !generic.has(s.segment)).map(s => s.segment);
    const date = new Date(now); date.setHours(0, 0, 0, 0);
    const day = /前天/.test(text) ? 2 : /昨天/.test(text) ? 1 : null;
    const start = new Date(date); if (day != null) start.setDate(start.getDate() - day);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const rows = [...(snapshot.notes || []).map(r => ({ ...r, kind: 'note' })), ...(snapshot.experiences || []).map(r => ({ ...r, kind: 'experience' }))];
    const seen = new Set();
    return rows.filter(r => !(recallQuestion(text) && r.kind === 'note')).filter(r => !scope || r.app === scope || (r.kind === 'note' && r.app === 'all')).map(row => {
      if (row.kind === 'experience' && day != null && !(row.at >= start.getTime() && row.at < end.getTime())) return null;
      const haystack = normalize(`${row.query || ''} ${row.title || ''} ${row.value || ''} ${row.message || ''}`);
      const matches = words.filter(w => haystack.includes(w)).length;
      if (words.length && !matches && row.kind !== 'note') return null;
      if (!historical(text) && !matches && row.kind !== 'note') return null;
      if (row.kind === 'experience' && /搜|找/.test(text) && !row.searched && !['searched', 'selected'].includes(row.action)) return null;
      if (row.kind === 'experience' && recallQuestion(text) && /听|播放/.test(text) && !/搜|找/.test(text) && row.action !== 'played') return null;
      return { row, score: matches + (row.kind === 'note' ? 0.5 : 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score || (b.row.at || b.row.updatedAt) - (a.row.at || a.row.updatedAt)).filter(({ row }) => {
      const key = row.kind === 'note' ? row.key : `${row.app}:${row.action}:${normalize(row.title || row.query)}`;
      if (seen.has(key)) return false; seen.add(key); return true;
    }).slice(0, Math.min(8, limit)).map(({ row }) => row);
  }
  return { preferences, normalize, command, effective, candidate, historical, recallQuestion, recall, scopeFor };
});
