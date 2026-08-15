const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games-v5.js'), 'utf8');
const snakeSource = fs.readFileSync(path.join(root, 'js/snake-game.js'), 'utf8');
const tetrisSource = fs.readFileSync(path.join(root, 'js/tetris-game.js'), 'utf8');
const voxelSource = fs.readFileSync(path.join(root, 'js/tetris-3d-game.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/product-ui-v5.css'), 'utf8');

test('游戏六个设计页面复用三款真实游戏入口', () => {
  for (const page of ['launcher', 'snake', 'tetris', 'voxel', 'pause-gameover', 'settings-help']) {
    assert.match(source, new RegExp(`['\"]${page}['\"]`));
  }
  for (const id of ['snake-dock-btn', 'tetris-dock-btn', 'tetris-3d-dock-btn']) assert.match(source, new RegExp(id));
  assert.match(html, /js\/games-v5\.js\?v=2/);
  for (const script of ['snake-game', 'tetris-game', 'tetris-3d-game']) {
    assert.match(html, new RegExp(`js/${script}\\.js\\?v=2`));
  }
});

test('游戏大厅与状态页提供模态隔离、Tab 闭环和 Esc 分层返回', () => {
  assert.match(source, /panel\.setAttribute\('role', 'dialog'\)/);
  assert.match(source, /setBackgroundInert\(true\)/);
  assert.match(source, /handleKeydown/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /games-v5-state, \.games-v5-settings/);
  assert.match(source, /returnFocus/);
  for (const name of ['贪吃蛇', '俄罗斯方块', '立体方块游戏面板']) assert.match(html, new RegExp(`aria-label="${name}"`));
});

test('三款真实游戏面板同步可见语义并支持 Esc 关闭和焦点回归', () => {
  for (const managerSource of [snakeSource, tetrisSource, voxelSource]) {
    assert.match(managerSource, /event\.code === 'Escape'/);
    assert.match(managerSource, /setAttribute\('aria-hidden', willOpen \? 'false' : 'true'\)/);
    assert.match(managerSource, /_returnFocus/);
  }
});

test('启动器不替换游戏内核且说明本地数据边界', () => {
  assert.match(source, /启动器只负责统一入口，不重建游戏内核/);
  assert.match(source, /不会上传/);
  assert.match(css, /games-v5-panel/);
});
