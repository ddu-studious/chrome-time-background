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
  const artistKey = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  function songsByArtist(songs, artist) {
    const key = artistKey(artist);
    if (!key || key.length > 80 || !Array.isArray(songs) || songs.length > 300) throw new Error('歌手或队列范围无效');
    const names = song => Array.isArray(song.artists) && song.artists.length
      ? song.artists.map(item => artistKey(typeof item === 'string' ? item : item?.name))
      : String(song.artist || '').split(/\s+\/\s+/).map(artistKey);
    if (songs.some(song => !song || !/^\d+$/.test(String(song.songId)) || !names(song).some(name => name && name !== '未知歌手'))) throw new Error('部分队列曲目缺少歌手信息，无法完整筛选；请先在播放器核对');
    return songs.filter(song => names(song).includes(key));
  }
  function removeSongs(songs, ids) {
    if (!Array.isArray(songs) || songs.length > 300 || !Array.isArray(ids) || !ids.length || ids.length > 300 ||
      ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id)) || new Set(ids).size !== ids.length ||
      new Set(songs.map(song => String(song.songId))).size !== songs.length || ids.some(id => !songs.some(song => String(song.songId) === id))) throw new Error('待移除曲目已变化或批量范围无效，请重新查询');
    const removed = new Set(ids);
    return songs.filter(song => !removed.has(String(song.songId)));
  }
  const api = { modes, nextIndex, songsByArtist, removeSongs };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MusicQueuePolicy = api;
})(globalThis);
