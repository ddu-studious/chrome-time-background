(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AppVideo = api;
})(globalThis, function () {
  'use strict';
  const fields = { platform: 'videoPlatform', id: 'videoId', seconds: 'videoSeconds', page: 'videoPage', title: 'videoTitle', author: 'videoAuthor', query: 'videoQuery' };
  const text = value => String(value || '').replace(/<[^>]*>/g, '').slice(0, 200);
  function normalize(input) {
    const { platform, id } = input || {};
    if (!['bilibili', 'youtube'].includes(platform)) throw new Error('视频平台无效');
    if (!id && platform === 'youtube' && typeof input.query === 'string' && input.query.trim()) {
      return { platform, query: input.query.trim().slice(0, 200) };
    }
    if (typeof id !== 'string' || !(platform === 'youtube' ? /^[A-Za-z0-9_-]{11}$/ : /^BV[A-Za-z0-9]{10}$/).test(id)) throw new Error('视频编号无效');
    const seconds = input.seconds == null ? 0 : Number(input.seconds);
    const page = input.page == null ? 1 : Number(input.page);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > Number.MAX_SAFE_INTEGER || !Number.isInteger(page) || page < 1 || page > 10000) throw new Error('视频进度或分 P 无效');
    return { platform, id, ...(input.seconds == null ? {} : { seconds: Math.floor(seconds) }), ...(input.page == null || platform === 'youtube' ? {} : { page }), title: text(input.title), author: text(input.author) };
  }
  function clearURL(value) {
    const url = new URL(value);
    for (const key of Object.values(fields)) url.searchParams.delete(key);
    return url.href;
  }
  function buildURL(input, baseURL) {
    const url = new URL(clearURL(baseURL));
    if (url.protocol !== 'chrome-extension:' || url.pathname !== '/index.html') throw new Error('App 视频入口无效');
    for (const [key, value] of Object.entries(normalize(input))) url.searchParams.set(fields[key], String(value));
    return url.href;
  }
  function readURL(value) {
    const url = new URL(value);
    if (!url.searchParams.has(fields.platform)) return null;
    return normalize(Object.fromEntries(Object.entries(fields).filter(([, key]) => url.searchParams.has(key)).map(([key, param]) => [key, url.searchParams.get(param)])));
  }
  return { normalize, buildURL, readURL, clearURL };
});
