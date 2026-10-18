// 水母差事的歌曲来源（只读）：已登录每日推荐 → 热歌榜 → 空。全部由注入的 api / loggedIn / normalize 完成，这里用替身驱动，不联网。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Songs = require('../js/jelly-errand-songs.js');

// 与后台 normalizeSilentMusicSong 同一形状（songId 是接口给的数字）
const normalize = (song, index) => ({
  songId: song?.id, title: song?.name || '', artist: (song?.ar || song?.artists || []).map(a => a.name).join('/'),
  artists: [], albumId: null, album: '', cover: '', duration: song?.dt || 0, index,
});
const raw = (id, name, artist = '歌手') => ({ id, name, ar: [{ name: artist }] });

function make(options = {}) {
  const calls = [];
  const api = options.api || (async (endpoint, params) => {
    calls.push([endpoint, params]);
    const reply = options.replies?.[endpoint];
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(params) : reply;
  });
  const songs = Songs.create({
    api, normalize: options.normalize === undefined ? normalize : options.normalize,
    loggedIn: options.loggedIn === undefined ? async () => true : options.loggedIn,
  });
  return { songs, calls };
}

const chartReply = tracks => ({ playlist: { tracks } });

test('已登录：用每日推荐（data.data.dailySongs 与 data.dailySongs 两种形状）', async () => {
  for (const reply of [{ data: { dailySongs: [raw(1, '晴天'), raw(2, '七里香')] } }, { dailySongs: [raw(1, '晴天'), raw(2, '七里香')] }]) {
    const { songs, calls } = make({ replies: { [Songs.DAILY]: reply } });
    const list = await songs.suggest();
    assert.deepEqual(list.map(s => [s.songId, s.title, s.artist]), [['1', '晴天', '歌手'], ['2', '七里香', '歌手']]);
    assert.deepEqual(calls.map(c => c[0]), [Songs.DAILY]);
  }
});

test('未登录：直接用热歌榜（playlist.tracks、result.playlist.tracks 与 result.tracks 三种形状），不碰每日推荐', async () => {
  // 第三种是 2026-10-17 对 /api/playlist/detail?id=3778678 匿名实测的真实形状：{ code, result: { tracks: [{ id, name, artists }] } }（音乐页“发现”回退只认前两种）
  const realShape = { code: 200, result: { tracks: [{ id: 7, name: '歌一', artists: [{ id: 1, name: '歌手' }] }] } };
  for (const reply of [chartReply([raw(7, '歌一')]), { result: { playlist: { tracks: [raw(7, '歌一')] } } }, realShape]) {
    const { songs, calls } = make({ loggedIn: async () => false, replies: { [Songs.CHART.endpoint]: reply } });
    const list = await songs.suggest();
    assert.deepEqual(list.map(s => [s.songId, s.title, s.artist]), [['7', '歌一', '歌手']], JSON.stringify(reply));
    assert.deepEqual(calls, [[Songs.CHART.endpoint, Songs.CHART.params]]);
  }
  assert.deepEqual(Songs.CHART, { endpoint: '/api/playlist/detail', params: { id: 3778678, n: 30 } });
  assert.equal(Songs.DAILY, '/api/v3/discovery/recommend/songs');
});

test('每日推荐抛错、为空、没有歌曲数组：都退回热歌榜', async () => {
  for (const daily of [new Error('网络'), { data: { dailySongs: [] } }, { data: {} }, null, undefined, { data: { dailySongs: 'x' } }]) {
    const { songs, calls } = make({ replies: { [Songs.DAILY]: daily, [Songs.CHART.endpoint]: chartReply([raw(9, '热歌')]) } });
    assert.deepEqual((await songs.suggest()).map(s => s.songId), ['9'], String(daily?.message ?? JSON.stringify(daily)));
    assert.deepEqual(calls.map(c => c[0]), [Songs.DAILY, Songs.CHART.endpoint]);
  }
});

test('都失败或都没有歌：返回空数组，不抛出；loggedIn 抛错按未登录', async () => {
  const both = make({ replies: { [Songs.DAILY]: new Error('a'), [Songs.CHART.endpoint]: new Error('b') } });
  assert.deepEqual(await both.songs.suggest(), []);
  const empty = make({ loggedIn: async () => false, replies: { [Songs.CHART.endpoint]: chartReply([]) } });
  assert.deepEqual(await empty.songs.suggest(), []);
  const broken = make({ loggedIn: async () => { throw new Error('cookie'); }, replies: { [Songs.CHART.endpoint]: chartReply([raw(3, 'C')]) } });
  assert.deepEqual((await broken.songs.suggest()).map(s => s.songId), ['3']);
  assert.deepEqual(broken.calls.map(c => c[0]), [Songs.CHART.endpoint]);
});

test('loggedIn 只有严格返回 true 才算已登录', async () => {
  for (const value of [1, 'yes', {}, undefined, null]) {
    const { songs, calls } = make({ loggedIn: async () => value, replies: { [Songs.CHART.endpoint]: chartReply([raw(3, 'C')]) } });
    await songs.suggest();
    assert.deepEqual(calls.map(c => c[0]), [Songs.CHART.endpoint], String(value));
  }
});

test('缺 api 或 normalize：返回空数组', async () => {
  const noApi = Songs.create({ normalize });
  assert.deepEqual(await noApi.suggest(), []);
  const noNormalize = make({ normalize: null, replies: { [Songs.DAILY]: { dailySongs: [raw(1, 'A')] } } });
  assert.deepEqual(await noNormalize.songs.suggest(), []);
  assert.deepEqual(noNormalize.calls, []);
});

test('清洗：songId 变字符串；非数字/过长/空歌名/重复丢弃；normalize 抛错的条目跳过；最多 30 首', async () => {
  const daily = { dailySongs: [raw(11, '甲'), raw('12', '乙'), raw('abc', '坏编号'), raw('', '空编号'), raw(null, '无编号'), raw(13, ''), raw(14, '   '),
    raw(11, '甲（重复）'), raw('1'.repeat(21), '太长'), raw('9'.repeat(20), '刚好二十位'), raw(15, 7), { id: 16 }, null, 'x'] };
  const picky = (song, index) => { if (song === null) throw new Error('boom'); return normalize(song, index); };
  const { songs } = make({ normalize: picky, replies: { [Songs.DAILY]: { data: daily } } });
  const list = await songs.suggest();
  assert.deepEqual(list.map(s => s.songId), ['11', '12', '9'.repeat(20)]);
  assert.ok(list.every(s => typeof s.songId === 'string' && s.title === s.title.trim() && s.title));
  const many = make({ replies: { [Songs.DAILY]: { dailySongs: Array.from({ length: 80 }, (_, i) => raw(1000 + i, `歌${i}`)) } } });
  const out = await many.songs.suggest();
  assert.equal(out.length, Songs.MAX);
  assert.equal(Songs.MAX, 30);
  assert.equal(out[0].songId, '1000');
  assert.equal(out.at(-1).songId, String(1000 + 29));
});

test('结果保留规范化后的全部字段（交给播放器要用），只改 songId 为字符串、title 去首尾空白、artist 缺省为空串', async () => {
  const full = (song, index) => ({ songId: song.id, title: ` ${song.name} `, artist: undefined, artists: [{ id: 1, name: 'A' }], albumId: 5, album: '专辑', cover: 'https://p1.music.126.net/x.jpg?param=200y200', duration: 240000, index });
  const { songs } = make({ normalize: full, replies: { [Songs.DAILY]: { dailySongs: [{ id: 21, name: '歌' }] } } });
  const [song] = await songs.suggest();
  assert.deepEqual(song, { songId: '21', title: '歌', artist: '', artists: [{ id: 1, name: 'A' }], albumId: 5, album: '专辑', cover: 'https://p1.music.126.net/x.jpg?param=200y200', duration: 240000, index: 0 });
});

test('源码：没有联网、扩展接口、DOM 与动态执行（来源与调用都由后台注入）', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/jelly-errand-songs.js'), 'utf8');
  for (const pattern of [/\bfetch\s*\(/, /\bchrome\./, /innerHTML|insertAdjacentHTML/, /\beval\s*\(/, /new Function/, /\bdocument\./, /XMLHttpRequest/, /importScripts/, /setTimeout|setInterval/]) {
    assert.equal(pattern.test(source), false, String(pattern));
  }
});
