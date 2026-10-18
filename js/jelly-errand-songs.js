(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JellyErrandSongs = api;
})(globalThis, function () {
  'use strict';

  // 水母差事的歌曲来源（只读）：已登录用每日推荐，没登录或失败退回热歌榜，都没有就返回空数组。
  //  · 本模块不联网、不读 Cookie、不碰扩展接口：调用方注入 api（后台的 neteaseApiCall）、loggedIn（有没有网易云登录 Cookie）与
  //    normalize（后台的 normalizeSilentMusicSong），所以返回的歌曲与右键“每日推荐”快捷播放是同一种形状，可以直接交给 playAssistantMusic。
  //  · 热歌榜与音乐页“发现”页是同一个来源（歌单 3778678）。推荐只依据接口返回，不声称“按你的口味”。
  //    歌曲数组认三种位置：playlist.tracks、result.playlist.tracks（音乐页“发现”回退只认这两种）与 result.tracks——后者是
  //    2026-10-17 对该接口匿名实测的真实形状（{ code, result: { tracks: [{ id, name, artists }] } }，n 参数被忽略、一次返回约 200 首，我们只取前 30 首）。
  //  · 接口层（后台 neteaseApiCall）要求浏览器里至少有一个 music.163.com 的 Cookie，完全没有时直接抛“未登录”，这里按没有候选处理（音乐页同样如此）。
  //  · 永不抛出：任何一步失败都按没有候选处理，由控制器决定静默跳过。
  // 设计与边界见 docs/superpowers/specs/2026-10-17-jelly-errands-design.md 第 4 节与 docs/superpowers/plans/2026-10-17-jelly-errands-phase2.md。

  const DAILY = '/api/v3/discovery/recommend/songs';
  const CHART = Object.freeze({ endpoint: '/api/playlist/detail', params: Object.freeze({ id: 3778678, n: 30 }) });
  const MAX = 30;

  /** 把接口返回的歌曲数组规范化：songId 必须是 ≤20 位的纯数字（统一成字符串）、歌名非空、去重、最多 MAX 首；单条失败只跳过那一条。 */
  function accept(list, normalize) {
    const out = [];
    const seen = new Set();
    for (const item of Array.isArray(list) ? list : []) {
      let song;
      try { song = normalize(item, out.length); } catch (_) { continue; }
      if (!song || typeof song !== 'object') continue;
      const id = String(song.songId ?? '');
      if (!/^\d{1,20}$/.test(id) || seen.has(id)) continue;
      const title = typeof song.title === 'string' ? song.title.trim() : '';
      if (!title) continue;
      seen.add(id);
      out.push({ ...song, songId: id, title, artist: typeof song.artist === 'string' ? song.artist : '' });
      if (out.length >= MAX) break;
    }
    return out;
  }

  function create({ api, loggedIn = async () => false, normalize } = {}) {
    /** 取一批候选歌曲；返回的每首都满足 accept 的约束。 */
    async function suggest() {
      if (typeof api !== 'function' || typeof normalize !== 'function') return [];
      let logged = false;
      try { logged = (await loggedIn()) === true; } catch (_) { logged = false; }
      let list = [];
      if (logged) {
        try {
          const data = await api(DAILY);
          list = accept(data?.data?.dailySongs || data?.dailySongs, normalize);
        } catch (_) { list = []; }
      }
      if (!list.length) {
        try {
          const data = await api(CHART.endpoint, { ...CHART.params });
          list = accept(data?.playlist?.tracks || data?.result?.playlist?.tracks || data?.result?.tracks, normalize);
        } catch (_) { list = []; }
      }
      return list;
    }
    return { suggest };
  }

  return { create, accept, DAILY, CHART, MAX };
});
