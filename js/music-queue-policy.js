(function (root) {
  'use strict';
  const modes = ['sequence', 'loop', 'single', 'shuffle'];
  function nextIndex(queue, direction = 1, { ended = false, random = Math.random } = {}) {
    const count = queue.songs.length, index = queue.index;
    if (!count) return -1;
    const mode = modes.includes(queue.playMode) ? queue.playMode : 'sequence';
    if (mode === 'single' && ended && index >= 0) return index;
    if (mode === 'shuffle') {
      const key = queue.songs.map(s => String(s.songId)).join(',');
      if (queue.shuffleKey !== key || !Array.isArray(queue.shuffleOrder) || queue.shuffleOrder[queue.shufflePosition] !== index) {
        const order = Array.from({ length: count }, (_, i) => i).filter(i => i !== index);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        queue.shuffleKey = key; queue.shuffleOrder = index >= 0 ? [index, ...order] : order; queue.shufflePosition = index >= 0 ? 0 : -1;
      }
      queue.shufflePosition = (queue.shufflePosition + direction + count) % count;
      return queue.shuffleOrder[queue.shufflePosition];
    }
    const next = index + direction;
    if (mode === 'loop') return (next + count) % count;
    return next >= 0 && next < count ? next : -1;
  }
  const api = { modes, nextIndex };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MusicQueuePolicy = api;
})(globalThis);
