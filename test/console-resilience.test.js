const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('背景亮度分析失败后缓存默认值，避免同一图片重复请求', async () => {
  const debugMessages = [];
  const context = {
    window: {},
    console: { debug: (...args) => debugMessages.push(args), log() {} },
  };
  vm.runInNewContext(read('js/adaptive-overlay.js'), context);
  const overlay = context.window.adaptiveOverlay;
  let attempts = 0;
  const applied = [];
  overlay._getImageBrightness = async () => {
    attempts++;
    throw new Error('Image 加载失败');
  };
  overlay._applyOverlay = value => applied.push(value);

  await overlay.analyzeAndApply('https://images.example.test/background.jpg');
  await overlay.analyzeAndApply('https://images.example.test/background.jpg');

  assert.equal(attempts, 1);
  assert.deepEqual(applied, [0.35, 0.35]);
  assert.equal(debugMessages.length, 1);
});

test('书签目录被删除后保留有效目录并清理失效 ID', async () => {
  const storageWrites = [];
  const context = {
    window: {},
    console: { debug() {}, warn() {} },
    chrome: {
      bookmarks: {
        async getSubTree(folderId) {
          if (folderId === '1465') throw new Error("Can't find bookmark for id.");
          return [{ id: folderId, title: '有效目录', children: [
            { id: 'bookmark-1', title: '示例', url: 'https://example.com', parentId: folderId },
          ] }];
        },
      },
      storage: {
        sync: {
          set(value, callback) {
            storageWrites.push(value);
            callback?.();
          },
        },
      },
    },
  };
  vm.runInNewContext(read('js/bookmark-rag.js'), context);
  const rag = new context.window.BookmarkRAG();
  rag.settings = {
    enabled: true,
    folderIds: ['100', '1465'],
    folderNames: ['有效目录', '已删除目录'],
  };

  const bookmarks = await rag.getBookmarksInFolders(rag.settings.folderIds);

  assert.equal(bookmarks.length, 1);
  assert.deepEqual(Array.from(rag.settings.folderIds), ['100']);
  assert.deepEqual(Array.from(rag.settings.folderNames), ['有效目录']);
  assert.equal(storageWrites.length, 1);
});

test('可恢复外部依赖降级不再记入 warning', () => {
  const ticker = read('js/ticker.js');
  const bilibili = read('js/bilibili-controller.js');
  const hermes = read('js/hermes-writing-sync.js');
  const index = read('index.html');

  assert.ok(ticker.includes('console.debug(`[Ticker] ${key} 暂不可用，已跳过:`'));
  assert.ok(ticker.includes('hotapi GitHub 无数据，已回退 Search API'));
  assert.ok(bilibili.includes('UP 主投稿接口不可用，已切换动态流'));
  assert.ok(hermes.includes('本地 Bridge 未启动，已跳过自动同步'));
  for (const resource of [
    'js/bookmark-rag.js?v=1',
    'js/ticker.js?v=4',
    'js/adaptive-overlay.js?v=1',
    'js/bilibili-controller.js?v=29',
    'js/youtube-controller.js?v=11',
    'js/hermes-writing-sync.js?v=1',
  ]) assert.ok(index.includes(resource), `缺少缓存版本: ${resource}`);
});
