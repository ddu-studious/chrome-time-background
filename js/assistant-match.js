(function (root) {
  'use strict';
  const pinyin = typeof module === 'object' && module.exports ? require('../vendor/pinyin-match/pinyin-match.js') : root.PinyinMatch;
  function match(text, query) {
    text = String(text || ''); query = String(query || '').trim();
    if (!query) return { score: 1, range: null };
    const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    if (index >= 0) return { score: text.length === query.length ? 100 : index === 0 ? 85 : 70, range: [index, index + query.length - 1] };
    const range = pinyin?.match(text, query);
    return range ? { score: range[0] === 0 ? 60 : 45, range: Array.from(range) } : null;
  }
  function rank(items, query, fields = item => [item.name, ...(item.aliases || [])]) {
    return items.map((item, index) => ({ item, index, score: Math.max(0, ...fields(item).map(text => match(text, query)?.score || 0)) }))
      .filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(row => row.item);
  }
  const api = { match, rank };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantMatch = api;
})(globalThis);
