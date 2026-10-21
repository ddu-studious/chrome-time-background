const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('旧英文配置仍显示中文，重复初始化只保留一条时钟定时器', () => {
  const elements = { time: { textContent: '', style: {} }, date: { textContent: '', style: {} } };
  const intervals = [], listeners = [];
  const context = {
    window: { settingsManager: { settings: { language: 'en', timeFormat: '12', showSeconds: true, showDate: true }, addChangeListener: fn => listeners.push(fn) }, addEventListener() {} },
    document: { getElementById: id => elements[id] }, Date, Intl,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {},
  };
  vm.runInNewContext(read('js/clock.js'), context);
  context.window.clockManager.init();
  context.window.clockManager.init();
  assert.equal(intervals.length, 1);
  assert.equal(listeners.length, 1);
  assert.match(elements.date.textContent, /年.*月.*日.*星期/);
  assert.match(elements.time.textContent, /^(上午|下午) /);
});

test('读取旧设置时丢弃语言字段并保留其他偏好', async () => {
  const context = {
    window: {}, console,
    chrome: { storage: { sync: { get: (key, cb) => cb({ settings: { language: 'en', timeFormat: '12', showWeather: false } }) } } },
  };
  vm.runInNewContext(read('js/settings.js'), context);
  await context.window.settingsManager.loadSettings();
  assert.equal('language' in context.window.settingsManager.settings, false);
  assert.equal(context.window.settingsManager.settings.timeFormat, '12');
  assert.equal(context.window.settingsManager.settings.showWeather, false);
});
