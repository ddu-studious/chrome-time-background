(function () {
  'use strict';

  const games = [
    { id: 'snake', name: '贪吃蛇', desc: '方向键控制，轻量快速挑战', icon: 'fas fa-worm', color: '#51d36e', dockBtnId: 'snake-dock-btn', panelId: 'snake-game-panel' },
    { id: 'tetris', name: '俄罗斯方块', desc: '经典消除、连击与本地最高分', icon: 'fas fa-th-large', color: '#6d8cff', dockBtnId: 'tetris-dock-btn', panelId: 'tetris-game-panel' },
    { id: 'voxel', name: '立体方块', desc: 'WebGL 优先并支持 Canvas 降级', icon: 'fas fa-cubes-stacked', color: '#ff914d', dockBtnId: 'tetris-3d-dock-btn', panelId: 'tetris-3d-game-panel' },
    // 解压果冻没有独立面板和 Dock 按钮：直接在游戏中心的面板里渲染（见 showJelly），不计分，所以统计项换成“累计放松”。
    { id: 'jelly', name: '解压果冻', desc: '拖一拖、戳一戳，没有输赢', icon: 'fas fa-droplet', color: '#ff7ab8', dockBtnId: null, panelId: null, statLabel: '累计放松', action: '开始放松', hint: '在游戏中心里直接打开，不计分' },
  ];

  let panel;
  let returnFocus = null;
  let backgroundInertSiblings = [];

  function setPage(page) { window.ProductUIV5?.setBusinessPage?.('games', page); }

  // 这些值会被拼进 innerHTML：分数来自 localStorage，不能假定它一定是数字。
  function esc(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  // 面板内容被整块替换或面板被关闭之前，必须先卸载果冻：卸载会结算累计时长、停掉动画循环和倒计时。
  function releaseJelly() {
    try { window.JellyGame?.unmount?.(); } catch (error) { console.warn('解压果冻卸载失败', error); }
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'games-v5-panel';
    panel.className = 'games-v5-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '休闲游戏');
    panel.setAttribute('aria-hidden', 'true');
    panel.tabIndex = -1;
    panel.inert = true;
    document.body.appendChild(panel);
    void panel.offsetWidth;   // 先提交“关闭态”样式：否则随后同步加 visible，首次打开没有入场过渡
    return panel;
  }

  function setBackgroundInert(active) {
    if (active) {
      if (backgroundInertSiblings.length) return;
      backgroundInertSiblings = [...document.body.children]
        .filter(child => child !== panel && !child.inert);
      backgroundInertSiblings.forEach(child => { child.inert = true; });
      return;
    }
    backgroundInertSiblings.forEach(child => { child.inert = false; });
    backgroundInertSiblings = [];
  }

  // 面板从 visibility:hidden 过渡出来的第一帧还不可聚焦：只在一次 rAF 里 focus() 会落空，焦点留在 body
  // （真实 Chromium 实测：从 Dock 打开大厅、从番茄钟打开果冻都会这样；面板已可见时从大厅切到果冻则没问题）。
  // 所以逐帧有界重试：面板已关闭、目标不在了、或焦点已经被移进面板（用户 Tab 过、视图自己放过）就停，不抢焦点。
  const FOCUS_RETRY_FRAMES = 8;
  function focusWhenReady(host, focusSelector) {
    let left = FOCUS_RETRY_FRAMES;
    const attempt = () => {
      if (!host.classList.contains('visible')) return;
      const active = document.activeElement;
      if (active && active !== host && host.contains(active)) return;
      const target = host.querySelector(focusSelector);
      if (!target) return;
      target.focus({ preventScroll: true });
      if (document.activeElement !== target && --left > 0) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }

  // above：从番茄钟（z-index 10002）里打开时要盖在它上面；每次打开都重新决定，关闭时不摘（淡出中不能沉到下面）
  function openHost(label, focusSelector, { above = false } = {}) {
    const host = ensurePanel();
    if (!host.classList.contains('visible')) returnFocus = document.activeElement;
    host.classList.toggle('games-v5-above', !!above);
    host.setAttribute('aria-label', label);
    host.setAttribute('aria-hidden', 'false');
    host.inert = false;
    host.classList.add('visible');
    setBackgroundInert(true);
    focusWhenReady(host, focusSelector);
  }

  function hideHost(restoreFocus = true) {
    if (!panel) return;
    releaseJelly();
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    setBackgroundInert(false);
    if (restoreFocus) {
      const dockBtn = document.getElementById('games-hub-dock-btn');
      const usableReturn = returnFocus?.isConnected && returnFocus.getClientRects?.().length;
      (usableReturn ? returnFocus : (dockBtn?.getClientRects?.().length ? dockBtn : document.getElementById('dock-launchpad-btn')))?.focus?.({ preventScroll: true });
    }
    returnFocus = null;
  }

  function localStats(game) {
    if (game.id === 'jelly') {
      try { return esc(window.JellyGame?.statText?.() || '—'); } catch (error) { return '—'; }
    }
    const candidates = game.id === 'snake' ? ['snakeHighScore', 'snake-high-score'] : game.id === 'tetris' ? ['tetrisHighScore', 'tetris-high-score'] : ['tetris3dHighScore', 'tetris-3d-high-score'];
    for (const key of candidates) {
      const value = localStorage.getItem(key);
      if (value != null) return esc(value);
    }
    return '—';
  }

  function showLauncher() {
    const host = ensurePanel();
    releaseJelly();
    setPage('launcher');
    host.innerHTML = `<header><div><i class="fas fa-gamepad"></i><strong>休闲游戏</strong><span>本地运行 · 不需要网络</span></div><div><button id="games-v5-help"><i class="fas fa-gear"></i> 设置与帮助</button><button id="games-v5-close"><i class="fas fa-times"></i></button></div></header><main><div class="games-v5-hero"><span class="eyebrow">GAME LOUNGE</span><h1>短暂离开工作流</h1><p>三款游戏沿用原有规则、分数和降级路径，另有不计分的解压果冻；启动器只负责统一入口，不重建游戏内核。</p></div><div class="games-v5-grid">${games.map(game => `<article data-game="${game.id}" style="--game-color:${game.color}"><i class="${game.icon}"></i><div><span>${game.statLabel || '本地最高分'}</span><b>${localStats(game)}</b></div><h2>${game.name}</h2><p>${game.desc}</p><button data-game-launch="${game.id}"><i class="fas fa-play"></i> ${game.action || '开始游戏'}</button></article>`).join('')}</div><section class="games-v5-local"><i class="fas fa-shield-halved"></i><div><strong>本地游戏数据</strong><span>分数、音效、渲染偏好，以及果冻的颜色和累计放松时长，保存在当前浏览器，不会上传。</span></div></section></main>`;
    openHost('游戏大厅', '[data-game-launch], #games-v5-help');
    bindLauncher();
  }

  function bindLauncher() {
    panel.querySelector('#games-v5-close')?.addEventListener('click', close);
    panel.querySelector('#games-v5-help')?.addEventListener('click', showSettingsHelp);
    panel.querySelectorAll('[data-game-launch]').forEach(button => button.addEventListener('click', () => launch(button.dataset.gameLaunch)));
  }

  function launch(id) {
    const game = games.find(item => item.id === id);
    if (!game) return;
    // 解压果冻就在这块面板里渲染，不经过 Dock 按钮，也不登记 ProductPagesV5 的页面（那是一份固定的设计合同）
    if (game.id === 'jelly') { showJelly({ origin: 'lobby' }); return; }
    hideHost(false);
    setPage(game.id);
    document.getElementById(game.dockBtnId)?.click();
  }

  // origin：'lobby' 从游戏大厅进入（Esc 回大厅，头部有“游戏大厅”按钮）；'pomodoro' 从番茄钟的休息提示进入（Esc 直接关闭）。
  // rest：休息秒数，大于 0 时显示倒计时；果冻控制器自己限制上限。
  function showJelly(options = {}) {
    const host = ensurePanel();
    const origin = options.origin === 'pomodoro' ? 'pomodoro' : 'lobby';
    releaseJelly();
    host.innerHTML = `<header><div><i class="fas fa-droplet"></i><strong>解压果冻</strong><span>本地运行 · 不计分 · 没有声音</span></div><div>${origin === 'lobby' ? '<button id="games-v5-lobby"><i class="fas fa-gamepad"></i> 游戏大厅</button>' : ''}<button id="games-v5-close" aria-label="关闭"><i class="fas fa-times"></i></button></div></header><main class="games-v5-jelly" data-origin="${origin}"><div class="games-v5-jelly-root"></div></main>`;
    const root = host.querySelector('.games-v5-jelly-root');
    let mounted = null;
    try {
      mounted = window.JellyGame?.mount?.(root, { rest: options.rest, onDone: close }) || null;
    } catch (error) {
      console.warn('解压果冻启动失败', error);
      releaseJelly();
    }
    if (!mounted) root.innerHTML = '<p class="games-v5-jelly-missing" role="alert">解压果冻没有加载成功，可以刷新页面后再试。</p>';
    openHost('解压果冻', mounted ? '.jelly-canvas' : '#games-v5-close', { above: origin === 'pomodoro' });
    host.querySelector('#games-v5-close')?.addEventListener('click', close);
    host.querySelector('#games-v5-lobby')?.addEventListener('click', showLauncher);
  }

  function showPauseGameover(gameId = 'tetris', mode = 'paused') {
    const game = games.find(item => item.id === gameId) || games[1];
    const host = ensurePanel();
    releaseJelly();
    setPage('pause-gameover');
    host.innerHTML = `<div class="games-v5-state"><i class="${game.icon}"></i><span class="eyebrow">${mode === 'gameover' ? 'GAME OVER' : 'PAUSED'}</span><h2>${mode === 'gameover' ? '本局结束' : '游戏已暂停'}</h2><p>${game.name} 的规则状态仍由原游戏内核维护。这里提供一致的恢复入口。</p><div class="games-v5-state-score"><div><b>${localStats(game)}</b><span>本地最高分</span></div><div><b>${game.name}</b><span>当前游戏</span></div></div><div><button class="primary" id="games-v5-resume"><i class="fas fa-play"></i> 返回游戏</button><button id="games-v5-lobby">返回大厅</button></div></div>`;
    openHost(mode === 'gameover' ? '本局结束' : '游戏已暂停', '#games-v5-resume');
    host.querySelector('#games-v5-resume')?.addEventListener('click', () => launch(game.id));
    host.querySelector('#games-v5-lobby')?.addEventListener('click', showLauncher);
  }

  function showSettingsHelp() {
    const host = ensurePanel();
    releaseJelly();
    setPage('settings-help');
    host.innerHTML = `<header><div><i class="fas fa-gamepad"></i><strong>游戏设置与帮助</strong></div><button id="games-v5-close"><i class="fas fa-times"></i></button></header><main class="games-v5-settings"><section><span class="eyebrow">统一说明</span><h2>键盘、声音与渲染</h2><div class="games-v5-help-grid"><article><i class="fas fa-keyboard"></i><strong>键盘</strong><p>方向键或 WASD 移动，Space 执行主要动作，P 暂停，R 重开，Esc 返回。解压果冻用鼠标或手指拖动，聚焦后按 Space 或 Enter 戳一下。</p></article><article><i class="fas fa-volume-high"></i><strong>声音</strong><p>每款游戏保留独立音效开关，不会影响网易云播放器；解压果冻没有声音。</p></article><article><i class="fas fa-cube"></i><strong>3D 降级</strong><p>立体方块优先 WebGL；探测失败会安全回落到 Canvas 2D。</p></article></div><h3>真实游戏入口</h3><div class="games-v5-settings-list">${games.map(game => `<button data-game-launch="${game.id}"><i class="${game.icon}" style="color:${game.color}"></i><span>${game.name}</span><small>${game.hint || '打开独立设置与游戏面板'}</small></button>`).join('')}</div><button id="games-v5-lobby">返回游戏大厅</button></section></main>`;
    openHost('游戏设置与帮助', '[data-game-launch], #games-v5-lobby');
    host.querySelector('#games-v5-close')?.addEventListener('click', close);
    host.querySelector('#games-v5-lobby')?.addEventListener('click', showLauncher);
    host.querySelectorAll('[data-game-launch]').forEach(button => button.addEventListener('click', () => launch(button.dataset.gameLaunch)));
  }

  function close() {
    hideHost(true);
    window.ProductUIV5?.setShellPage?.('home');
  }

  function handleKeydown(event) {
    if (!panel?.classList.contains('visible')) return;
    if (event.key === 'Escape') {
      const jellyView = panel.querySelector('.games-v5-jelly');
      // 果冻视图：从大厅进来回大厅；从番茄钟进来直接关闭，回到番茄钟
      if (jellyView) { if (jellyView.dataset.origin === 'lobby') showLauncher(); else close(); }
      else if (panel.querySelector('.games-v5-state, .games-v5-settings')) showLauncher();
      else close();
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!panel.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function init() {
    document.getElementById('games-hub-dock-btn')?.addEventListener('click', showLauncher);
    for (const game of games) {
      if (!game.dockBtnId) continue;   // 解压果冻没有 Dock 按钮
      document.getElementById(game.dockBtnId)?.addEventListener('click', () => setPage(game.id));
    }
    document.addEventListener('keydown', handleKeydown);
  }

  window.GamesV5 = { showLauncher, launch, showPauseGameover, showSettingsHelp, showJelly, close, games };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
