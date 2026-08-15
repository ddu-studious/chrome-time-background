(function () {
  'use strict';

  const games = [
    { id: 'snake', name: '贪吃蛇', desc: '方向键控制，轻量快速挑战', icon: 'fas fa-worm', color: '#51d36e', dockBtnId: 'snake-dock-btn', panelId: 'snake-game-panel' },
    { id: 'tetris', name: '俄罗斯方块', desc: '经典消除、连击与本地最高分', icon: 'fas fa-th-large', color: '#6d8cff', dockBtnId: 'tetris-dock-btn', panelId: 'tetris-game-panel' },
    { id: 'voxel', name: '立体方块', desc: 'WebGL 优先并支持 Canvas 降级', icon: 'fas fa-cubes-stacked', color: '#ff914d', dockBtnId: 'tetris-3d-dock-btn', panelId: 'tetris-3d-game-panel' },
  ];

  let panel;
  let returnFocus = null;
  let backgroundInertSiblings = [];

  function setPage(page) { window.ProductUIV5?.setBusinessPage?.('games', page); }

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

  function openHost(label, focusSelector) {
    const host = ensurePanel();
    if (!host.classList.contains('visible')) returnFocus = document.activeElement;
    host.setAttribute('aria-label', label);
    host.setAttribute('aria-hidden', 'false');
    host.inert = false;
    host.classList.add('visible');
    setBackgroundInert(true);
    requestAnimationFrame(() => host.querySelector(focusSelector)?.focus({ preventScroll: true }));
  }

  function hideHost(restoreFocus = true) {
    if (!panel) return;
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
    const candidates = game.id === 'snake' ? ['snakeHighScore', 'snake-high-score'] : game.id === 'tetris' ? ['tetrisHighScore', 'tetris-high-score'] : ['tetris3dHighScore', 'tetris-3d-high-score'];
    for (const key of candidates) {
      const value = localStorage.getItem(key);
      if (value != null) return value;
    }
    return '—';
  }

  function showLauncher() {
    const host = ensurePanel();
    setPage('launcher');
    host.innerHTML = `<header><div><i class="fas fa-gamepad"></i><strong>休闲游戏</strong><span>本地运行 · 不需要网络</span></div><div><button id="games-v5-help"><i class="fas fa-gear"></i> 设置与帮助</button><button id="games-v5-close"><i class="fas fa-times"></i></button></div></header><main><div class="games-v5-hero"><span class="eyebrow">GAME LOUNGE</span><h1>短暂离开工作流</h1><p>三款游戏沿用原有规则、分数和降级路径；启动器只负责统一入口，不重建游戏内核。</p></div><div class="games-v5-grid">${games.map(game => `<article style="--game-color:${game.color}"><i class="${game.icon}"></i><div><span>本地最高分</span><b>${localStats(game)}</b></div><h2>${game.name}</h2><p>${game.desc}</p><button data-game-launch="${game.id}"><i class="fas fa-play"></i> 开始游戏</button></article>`).join('')}</div><section class="games-v5-local"><i class="fas fa-shield-halved"></i><div><strong>本地游戏数据</strong><span>分数、音效和渲染偏好保存在当前浏览器，不会上传。</span></div></section></main>`;
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
    hideHost(false);
    setPage(game.id);
    document.getElementById(game.dockBtnId)?.click();
  }

  function showPauseGameover(gameId = 'tetris', mode = 'paused') {
    const game = games.find(item => item.id === gameId) || games[1];
    const host = ensurePanel();
    setPage('pause-gameover');
    host.innerHTML = `<div class="games-v5-state"><i class="${game.icon}"></i><span class="eyebrow">${mode === 'gameover' ? 'GAME OVER' : 'PAUSED'}</span><h2>${mode === 'gameover' ? '本局结束' : '游戏已暂停'}</h2><p>${game.name} 的规则状态仍由原游戏内核维护。这里提供一致的恢复入口。</p><div class="games-v5-state-score"><div><b>${localStats(game)}</b><span>本地最高分</span></div><div><b>${game.name}</b><span>当前游戏</span></div></div><div><button class="primary" id="games-v5-resume"><i class="fas fa-play"></i> 返回游戏</button><button id="games-v5-lobby">返回大厅</button></div></div>`;
    openHost(mode === 'gameover' ? '本局结束' : '游戏已暂停', '#games-v5-resume');
    host.querySelector('#games-v5-resume')?.addEventListener('click', () => launch(game.id));
    host.querySelector('#games-v5-lobby')?.addEventListener('click', showLauncher);
  }

  function showSettingsHelp() {
    const host = ensurePanel();
    setPage('settings-help');
    host.innerHTML = `<header><div><i class="fas fa-gamepad"></i><strong>游戏设置与帮助</strong></div><button id="games-v5-close"><i class="fas fa-times"></i></button></header><main class="games-v5-settings"><section><span class="eyebrow">统一说明</span><h2>键盘、声音与渲染</h2><div class="games-v5-help-grid"><article><i class="fas fa-keyboard"></i><strong>键盘</strong><p>方向键或 WASD 移动，Space 执行主要动作，P 暂停，R 重开，Esc 返回。</p></article><article><i class="fas fa-volume-high"></i><strong>声音</strong><p>每款游戏保留独立音效开关，不会影响网易云播放器。</p></article><article><i class="fas fa-cube"></i><strong>3D 降级</strong><p>立体方块优先 WebGL；探测失败会安全回落到 Canvas 2D。</p></article></div><h3>真实游戏入口</h3><div class="games-v5-settings-list">${games.map(game => `<button data-game-launch="${game.id}"><i class="${game.icon}" style="color:${game.color}"></i><span>${game.name}</span><small>打开独立设置与游戏面板</small></button>`).join('')}</div><button id="games-v5-lobby">返回游戏大厅</button></section></main>`;
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
      if (panel.querySelector('.games-v5-state, .games-v5-settings')) showLauncher();
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
    for (const game of games) document.getElementById(game.dockBtnId)?.addEventListener('click', () => setPage(game.id));
    document.addEventListener('keydown', handleKeydown);
  }

  window.GamesV5 = { showLauncher, launch, showPauseGameover, showSettingsHelp, close, games };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
