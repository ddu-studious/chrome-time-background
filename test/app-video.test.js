const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const AppVideo = require('../js/app-video.js');

const baseURL = 'chrome-extension://test-extension/index.html';

test('视频入口仅接受真实支持平台与平台对应的 ID', () => {
  for (const input of [
    { platform: 'other', id: 'dQw4w9WgXcQ' },
    { platform: 'youtube', id: 'javascript:alert(1)' },
    { platform: 'youtube', id: 'BV1xx411c7mD' },
    { platform: 'bilibili', id: 'dQw4w9WgXcQ' },
    { platform: 'youtube', id: { toString: () => 'dQw4w9WgXcQ' } },
    { platform: 'youtube', query: '   ' },
    { platform: 'bilibili', query: 'MySQL' }
  ]) assert.throws(() => AppVideo.normalize(input), /平台|编号/);
  assert.equal(AppVideo.normalize({ platform: 'youtube', id: 'Abc_def-123' }).id, 'Abc_def-123');
  assert.equal(AppVideo.normalize({ platform: 'bilibili', id: 'BV1xx411c7mD' }).id, 'BV1xx411c7mD');
});

test('App 链接完整往返平台、编码标题、续看秒数及 B 站分 P', () => {
  const request = { platform: 'bilibili', id: 'BV1xx411c7mD', seconds: 123.9, page: 3,
    title: 'MySQL & 索引 #2 + / ?=', author: '课程作者 & Co' };
  const url = AppVideo.buildURL(request, baseURL);
  assert.equal(new URL(url).protocol, 'chrome-extension:');
  assert.equal(new URL(url).pathname, '/index.html');
  assert.deepEqual(AppVideo.readURL(url), { ...request, seconds: 123 });
  assert.doesNotMatch(url, /www\.bilibili\.com|youtube\.com/);
  const youtube = AppVideo.readURL(AppVideo.buildURL({ platform: 'youtube', id: 'dQw4w9WgXcQ', seconds: 63, page: 5 }, baseURL));
  assert.equal(youtube.seconds, 63);
  assert.equal(Object.hasOwn(youtube, 'page'), false);
});

test('没有提供续看秒数时不写零秒，显式零秒仍可传给播放器', () => {
  const request = { platform: 'youtube', id: 'dQw4w9WgXcQ' };
  const url = AppVideo.buildURL(request, baseURL);
  assert.equal(new URL(url).searchParams.has('videoSeconds'), false);
  assert.equal(Object.hasOwn(AppVideo.readURL(url), 'seconds'), false);
  assert.equal(AppVideo.readURL(AppVideo.buildURL({ ...request, seconds: 0 }, baseURL)).seconds, 0);
});

test('无效进度与分 P 在生成或读取入口时均拒绝', () => {
  const request = { platform: 'bilibili', id: 'BV1xx411c7mD' };
  for (const seconds of [-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, 'bad']) {
    assert.throws(() => AppVideo.normalize({ ...request, seconds }), /进度/);
  }
  for (const page of [0, -1, 1.5, 10001, Infinity, 'bad']) {
    assert.throws(() => AppVideo.normalize({ ...request, page }), /分 P/);
  }
  const url = new URL(AppVideo.buildURL(request, baseURL));
  url.searchParams.set('videoSeconds', '-3');
  assert.throws(() => AppVideo.readURL(url.href), /进度/);
});

test('搜索入口编码完整查询，旧播放参数清理且保留无关 App 参数', () => {
  const query = 'MySQL 索引 & + # / ? v=1';
  const old = AppVideo.buildURL({ platform: 'bilibili', id: 'BV1xx411c7mD', seconds: 125, page: 2, title: '旧视频' }, baseURL + '?theme=dark#workspace');
  const next = AppVideo.buildURL({ platform: 'youtube', query: ` ${query} ` }, old);
  assert.deepEqual(AppVideo.readURL(next), { platform: 'youtube', query });
  const parsed = new URL(next);
  assert.equal(parsed.searchParams.has('videoId'), false);
  assert.equal(parsed.searchParams.has('videoSeconds'), false);
  assert.equal(parsed.searchParams.has('videoPage'), false);
  assert.equal(parsed.searchParams.has('videoTitle'), false);
  assert.equal(AppVideo.clearURL(next), baseURL + '?theme=dark#workspace');
  assert.equal(AppVideo.readURL(AppVideo.clearURL(next)), null);
});

test('生成入口只能指向扩展 App 首页，展示字段剥离 HTML', () => {
  const request = { platform: 'youtube', id: 'dQw4w9WgXcQ', title: '<b>课程</b>', author: '<i>作者</i>' };
  for (const target of ['https://www.youtube.com/watch', 'javascript:alert(1)', 'chrome-extension://test-extension/settings.html']) {
    assert.throws(() => AppVideo.buildURL(request, target));
  }
  const parsed = AppVideo.readURL(AppVideo.buildURL(request, baseURL));
  assert.equal(parsed.title, '课程');
  assert.equal(parsed.author, '作者');
});

test('后台真实 App 适配器使用扩展入口，取消不建标签且缺失标签 ID 不报成功', async () => {
  const source = fs.readFileSync(require.resolve('../js/background.js'), 'utf8');
  const start = source.indexOf('        async openVideo(request, ctx) {');
  const end = source.indexOf('        async controlMusic(', start);
  assert.ok(start >= 0 && end > start, '提取生产 QuickAssistant 的完整 openVideo 方法');
  const created = [], resolved = [];
  let tabResult = { id: 42 };
  const scope = { AppVideo, chrome: {
    runtime: { getURL(path) { resolved.push(path); return `chrome-extension://adapter-extension/${path}`; } },
    tabs: { async create(options) { created.push(structuredClone(options)); return tabResult; } }
  } };
  vm.runInNewContext(`globalThis.adapter = ({${source.slice(start, end)}});`, scope);
  const request = { platform: 'bilibili', id: 'BV1xx411c7mD', seconds: 85, page: 3, title: '课程 & 续看' };
  const opened = await scope.adapter.openVideo(request, { guard() {} });
  assert.deepEqual(resolved, ['index.html']);
  assert.deepEqual(created, [{ url: AppVideo.buildURL(request, 'chrome-extension://adapter-extension/index.html'), active: true }]);
  assert.deepEqual(structuredClone(opened), { opened: true, destination: 'app', playbackConfirmed: false });

  await assert.rejects(scope.adapter.openVideo(request, { guard() { throw Object.assign(new Error('已取消'), { name: 'AbortError' }); } }), /已取消/);
  assert.equal(created.length, 1);
  for (const missingID of [undefined, {}, { id: '42' }]) {
    tabResult = missingID;
    const unconfirmed = await scope.adapter.openVideo(request, { guard() {} });
    assert.equal(unconfirmed.opened, false); assert.equal(unconfirmed.playbackConfirmed, false);
  }
});

test('AppVideo 同时提供 CommonJS 与浏览器 API，并在后台与首页使用者之前加载', () => {
  const scope = { URL };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/app-video.js'), 'utf8'), scope);
  assert.deepEqual(Object.keys(scope.AppVideo).sort(), Object.keys(AppVideo).sort());
  const request = { platform: 'youtube', id: 'dQw4w9WgXcQ', seconds: 9 };
  assert.equal(scope.AppVideo.buildURL(request, baseURL), AppVideo.buildURL(request, baseURL));

  const background = fs.readFileSync(require.resolve('../js/background.js'), 'utf8');
  let loaded;
  vm.runInNewContext(background.split('\n')[0], { importScripts: (...scripts) => { loaded = scripts; } });
  for (const consumer of ['assistant-management.js', 'assistant-tools.js', 'assistant-background.js']) {
    assert.ok(loaded.indexOf('app-video.js') >= 0 && loaded.indexOf('app-video.js') < loaded.indexOf(consumer), consumer);
  }
  const index = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const scripts = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1].split('?')[0]);
  for (const consumer of ['js/bilibili-controller.js', 'js/youtube-controller.js', 'js/main.js']) {
    assert.ok(scripts.indexOf('js/app-video.js') >= 0 && scripts.indexOf('js/app-video.js') < scripts.indexOf(consumer), consumer);
  }
});
