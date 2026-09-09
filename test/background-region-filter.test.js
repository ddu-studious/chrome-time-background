const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/background-provider.js'), 'utf8');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'js/background.js'), 'utf8');
const context = {
  self: {},
  console: { warn() {} },
};

vm.runInNewContext(source, context, { filename: 'background-provider.js' });

const { isBackgroundAllowed, FALLBACK_BACKGROUNDS } = context.self.BackgroundProviderManager;

test('统一过滤日本及主要日本地点的中英文背景元数据', () => {
  const blocked = [
    { location: '京都，日本', description: '秋日古寺' },
    { description: 'Snow above Mount Fuji' },
    { url: 'https://images.example.com/Tokyo_skyline.jpg' },
    { thumbnailUrl: 'https://images.example.com/%E5%8C%97%E6%B5%B7%E9%81%93-snow.jpg' },
    { videoUrl: 'https://videos.example.com/okinawa-beach.mp4' },
    { licenseUrl: 'https://example.com/photos/shibuya-crossing' },
  ];

  for (const item of blocked) {
    assert.equal(isBackgroundAllowed(item), false, JSON.stringify(item));
  }
});

test('不根据摄影师姓名误伤其他地区背景', () => {
  assert.equal(isBackgroundAllowed({
    location: 'Swiss Alps',
    description: 'Mountain sunrise',
    photographer: 'Japanese landscape photographer',
    url: 'https://images.example.com/alps.jpg',
  }), true);
});

test('内置兜底背景全部符合地区过滤规则', () => {
  assert.ok(FALLBACK_BACKGROUNDS.length > 0);
  assert.ok(FALLBACK_BACKGROUNDS.every(isBackgroundAllowed));
});

test('Wikimedia 不再主动轮询日本精选图片分类', () => {
  assert.ok(!source.includes('Category:Featured_pictures_of_Japan'));
  assert.ok(!serviceWorkerSource.includes('Category:Featured_pictures_of_Japan'));
});
