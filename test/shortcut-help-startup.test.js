const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture({ structured = true } = {}) {
  class Element {
    constructor(id = '', className = '') {
      this.id = id;
      this.className = className;
      this.children = [];
      this.listeners = new Map();
      this.classList = { contains: name => this.className.split(' ').includes(name) };
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text || this.children.map(child => child.textContent).join(''); }
    querySelector(selector) {
      return this.children.find(child => selector.startsWith('#') ? child.id === selector.slice(1) : child.classList.contains(selector.slice(1))) || null;
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
  }
  const rail = new Element('', structured ? 'keyboard-hint shortcut-hints' : 'keyboard-hint');
  const label = new Element('', 'shortcut-hint-background');
  const trigger = new Element('shortcut-help-trigger');
  if (structured) rail.children.push(label, trigger);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const settingsListeners = [];
  const document = {
    readyState: 'loading',
    querySelector(selector) {
      if (selector === '.keyboard-hint') return rail;
      if (selector === '#shortcut-help-trigger') return rail.querySelector(selector);
      return null;
    },
    addEventListener: (name, listener) => documentListeners.set(name, listener),
  };
  const window = {
    navigator: { platform: 'MacIntel' },
    addEventListener: (name, listener) => windowListeners.set(name, listener),
    settingsManager: {
      settings: { language: 'zh' },
      addChangeListener: listener => settingsListeners.push(listener),
    },
  };
  const context = vm.createContext({ window, document });
  vm.runInContext(read('js/shortcut-help.js'), context);
  return { window, document, rail, label, trigger, settingsListeners, windowListeners, documentListeners };
}

test('HTML 尚在加载时入口已可响应，不等待后面的同步脚本', () => {
  const f = fixture();
  assert.equal(f.document.readyState, 'loading');
  assert.equal(typeof f.trigger.listeners.get('click'), 'function');
  assert.equal(typeof f.windowListeners.get('keydown'), 'function');
});

test('首页和设置页不再加载国际化或提供语言切换', () => {
  assert.doesNotMatch(read('index.html'), /src="js\/i18n\.js/);
  assert.doesNotMatch(read('js/main.js'), /i18nManager/);
  assert.doesNotMatch(read('js/memo.js'), /i18nManager/);
  assert.doesNotMatch(read('settings.html'), /id="set-language"/);
});

test('正式首页在重型供应脚本之前加载快捷键入口与样式', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('css/shortcut-help.css') < html.indexOf('</head>'));
  assert.ok(html.indexOf('js/shortcut-help.js') > html.indexOf('id="shortcut-help-trigger"'));
  assert.ok(html.indexOf('js/shortcut-help.js') < html.indexOf('vendor/marked.min.js'));
  assert.equal((html.match(/src="js\/shortcut-help\.js/g) || []).length, 1);
});
