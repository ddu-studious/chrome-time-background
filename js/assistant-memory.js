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
  function command(text) {
    const value = String(text || '').trim();
    if (/^(?:查看|看看|显示)(?:我的|音乐)?记忆[。！!？?]?$/.test(value)) return { operation: 'list' };
    if (!/^(?:请)?(?:记住|记一下|以后|今后)/.test(value) || /今天|这次|暂时|如果/.test(value)) return null;
    if (!/歌手|热门歌/.test(value)) return null;
    if (/先展示|先显示|只搜索|不要自动播放|不自动播放/.test(value)) return { operation: 'preference', key: 'artistDefaultAction', value: 'browse' };
    if (/直接播放|自动播放|就是.*(?:播放|听)|默认.*播放/.test(value)) return { operation: 'preference', key: 'artistDefaultAction', value: 'play' };
    if (/保留.*队列|追加.*队列/.test(value)) return { operation: 'preference', key: 'artistQueueMode', value: 'append' };
    if (/替换.*队列/.test(value)) return { operation: 'preference', key: 'artistQueueMode', value: 'replace' };
    return null;
  }
  function effective(snapshot) {
    const result = Object.fromEntries(Object.entries(preferences).map(([key, spec]) => [key, spec.default]));
    if (snapshot?.enabled !== false) for (const row of snapshot?.preferences || []) {
      if (Object.hasOwn(preferences, row.key) && preferences[row.key].values.includes(row.value)) result[row.key] = row.value;
    }
    return result;
  }
  function candidate(choices, query, snapshot) {
    const artists = choices.filter(c => !c.secondary && c.kind === 'artist');
    const saved = snapshot?.enabled !== false && snapshot?.artists?.find(row => row.key === normalize(query));
    if (saved) {
      const matches = artists.filter(c => c.data.id === saved.artistId && normalize(c.title) === normalize(saved.name));
      // A remembered ID must be present in fresh results. Never fall back to a namesake.
      return matches.length === 1 ? { choice: matches[0], reason: '已记住的歌手选择' } : null;
    }
    const exact = artists.filter(c => normalize(c.title) === normalize(query));
    return exact.length === 1 ? { choice: exact[0], reason: '歌手名称唯一精确匹配' } : null;
  }
  return { preferences, normalize, command, effective, candidate };
});
