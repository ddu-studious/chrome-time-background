const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Warm = require('../js/background-warm.js');
const source = fs.readFileSync(path.join(__dirname, '../js/home-background-start.js'), 'utf8');

function fixture({ hidden = false, saveData = false, brokenStorage = false } = {}) {
  const calls = [], preloads = [];
  const window = {
    chrome: { runtime: { sendMessage: (message, callback) => calls.push({ message, callback }) } },
    navigator: { connection: { saveData } },
    localStorage: { getItem: () => JSON.stringify([{ url: 'https://example.com/warm.jpg', ts: Date.now() }]) },
    BackgroundWarm: { ...Warm, warmImage: async url => { preloads.push(url); return true; } },
  };
  if (brokenStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('unavailable'); } });
  vm.runInNewContext(source, { window, document: { hidden } });
  return { window, calls, preloads };
}

test('提前只请求一次列表，预取的图片与 main 接收的候选相同', async () => {
  const f = fixture();
  assert.equal(f.calls.length, 1);
  const response = { backgrounds: [{ url: 'https://example.com/cold.jpg' }, { url: 'https://example.com/warm.jpg' }] };
  f.calls[0].callback(response);
  const value = await f.window.HomeBackground.ready;
  assert.equal(value.response, response);
  assert.equal(value.choice.item, response.backgrounds[1]);
  assert.deepEqual(f.preloads, ['https://example.com/warm.jpg']);
});

test('隐藏、省流量与不可预取图片均不提前下载', async () => {
  for (const options of [{ hidden: true }, { saveData: true }, {}]) {
    const f = fixture(options);
    f.calls[0].callback({ backgrounds: [{ url: 'https://example.com/a.jpg', mediaType: options.hidden || options.saveData ? 'image' : 'video' }] });
    await f.window.HomeBackground.ready;
    assert.deepEqual(f.preloads, []);
  }
});

test('预热存储不可用仍把真实列表交给首页，不会丢失结果', async () => {
  const f = fixture({ brokenStorage: true });
  const response = { backgrounds: [{ url: 'https://example.com/a.jpg' }] };
  f.calls[0].callback(response);
  assert.equal((await f.window.HomeBackground.ready).response, response);
});
