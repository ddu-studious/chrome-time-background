/** Read-only shortcut reference. Chrome owns command bindings; each app owns its keys. */
(function exposeShortcutHelp(global) {
  'use strict';

  const mod = /Mac|iPhone|iPad/.test(global.navigator?.platform || '') ? '⌘' : 'Ctrl';
  const localRows = [
    ['首页与面板', '查看快捷键', '? / Shift + /', '首页或设置页，输入时不触发；也可按 ' + mod + ' + Shift + /'],
    ['首页与面板', '切换背景', mod + ' + Shift + B', '首页，焦点不在输入框时'],
    ['首页与面板', '切换极简模式', mod + ' + Shift + .', '首页，焦点不在输入框时'],
    ['首页与面板', '关闭当前浮层 / 退出极简模式', 'Esc', '各面板按自己的层级关闭'],
    ['任务与书签', '搜索书签', mod + ' + K', '首页的书签搜索入口'],
    ['任务与书签', '新建任务', mod + ' + N', '首页，焦点不在输入框时；浏览器可能优先处理此组合'],
    ['任务与书签', '显示 / 隐藏任务面板', mod + ' + H', '首页，焦点不在输入框时；浏览器或系统可能优先处理此组合'],
    ['任务与书签', '编辑选中的任务', 'E', '首页任务列表已选中任务，焦点不在输入框时'],
    ['任务与书签', '删除选中的任务', 'Delete / Backspace', '首页任务列表已选中任务，仍需确认'],
    ['任务与书签', '选择上 / 下一条任务', '↑ / ↓', '首页任务列表已选中任务，焦点不在输入框时'],
    ['应用内操作', '进入音乐搜索', mod + ' + K', '音乐面板已打开时'],
    ['应用内操作', '发送需求', 'Enter', '快捷助手输入框；Shift + Enter 换行'],
    ['应用内操作', '以新会话发送当前需求', mod + ' + Enter', '快捷助手输入框'],
    ['应用内操作', '开始 / 暂停专注', 'Space', '专注页，焦点不在按钮或输入框时'],
    ['应用内操作', '文字加粗 / 斜体', mod + ' + B / I', '任务、知识区和写作的 Markdown 编辑器'],
    ['应用内操作', '插入链接', mod + ' + K', '知识区和写作的 Markdown 编辑器'],
    ['应用内操作', '游戏操作', '↑ ↓ ← → / Space / P / R', '依具体游戏：移动、主要动作、暂停、重开；以游戏内说明为准'],
  ].map(([group, title, keys, scope]) => ({ group, title, keys, scope }));

  let dialog, search, list, result, commandStatus, desktopStatus, previousFocus;
  let rows = localRows;
  let readVersion = 0;

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function editable(event) {
    return (event.composedPath?.() || [event.target]).some(el =>
      el?.matches?.('input, textarea, select, [role="textbox"]') || el?.isContentEditable);
  }

  function isHelpKey(event) {
    return !event.altKey && (
      (event.key === '?' && !event.ctrlKey && !event.metaKey) ||
      (event.code === 'Slash' && event.shiftKey && (event.ctrlKey || event.metaKey))
    );
  }

  function readWithin(operation) {
    let timer;
    return Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve, reject) => { timer = global.setTimeout(() => reject(new Error('timeout')), 3000); }),
    ]).finally(() => global.clearTimeout(timer));
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = rows.filter(row => [row.group, row.title, row.keys, row.scope].join(' ').toLocaleLowerCase().includes(query));
    list.replaceChildren();
    for (const group of ['首页与面板', 'Chrome 快捷键', '桌面助手', '任务与书签', '应用内操作']) {
      if (!visible.some(row => row.group === group)) continue;
      const section = element('section', 'shortcut-help-group');
      section.append(element('h3', '', group));
      for (const row of visible.filter(item => item.group === group)) {
        const item = element('div', 'shortcut-help-row');
        const copy = element('div', 'shortcut-help-copy');
        copy.append(element('strong', '', row.title), element('small', '', row.scope));
        const keys = element('kbd', row.keys === '未设置' ? 'is-unbound' : '', row.keys);
        item.append(copy, keys);
        section.append(item);
      }
      list.append(section);
    }
    if (!visible.length) list.append(element('p', 'shortcut-help-empty', '没有匹配的快捷键，试试“音乐”“背景”或“助手”。'));
    result.textContent = query ? '找到 ' + visible.length + ' 项' : '共 ' + visible.length + ' 项 · 按使用场景分组';
  }

  function build() {
    dialog = element('dialog', 'shortcut-help');
    dialog.id = 'shortcut-help';
    dialog.setAttribute('aria-labelledby', 'shortcut-help-title');
    dialog.setAttribute('aria-describedby', 'shortcut-help-description');
    // This template is static. All runtime values below use textContent.
    dialog.innerHTML = `
      <div class="shortcut-help-panel">
        <header class="shortcut-help-header">
          <div><span class="shortcut-help-eyebrow">随手查，少记一点</span><h2 id="shortcut-help-title">快捷键一览</h2></div>
          <button type="button" class="shortcut-help-close" aria-label="关闭快捷键面板">×</button>
        </header>
        <p id="shortcut-help-description">首页、浏览器和应用内的快捷操作，都在这里。</p>
        <label class="shortcut-help-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索功能或按键，如：音乐、背景、Ctrl" aria-label="搜索快捷键" autocomplete="off"></label>
        <div class="shortcut-help-meta"><span role="status" aria-live="polite" id="shortcut-help-result"></span><span><kbd>?</kbd> 唤出 · <kbd>Esc</kbd> 关闭</span></div>
        <div class="shortcut-help-list" tabindex="0" aria-label="快捷键列表"></div>
        <footer class="shortcut-help-footer">
          <div><p id="shortcut-help-command-status" role="status"></p><p id="shortcut-help-desktop-status" role="status"></p></div>
          <a href="chrome://extensions/shortcuts" class="shortcut-help-settings">修改 Chrome 快捷键 ↗</a>
        </footer>
      </div>`;
    document.body.append(dialog);
    search = dialog.querySelector('input');
    search.placeholder = '搜索功能或按键，如：音乐、背景、' + mod;
    list = dialog.querySelector('.shortcut-help-list');
    result = dialog.querySelector('#shortcut-help-result');
    commandStatus = dialog.querySelector('#shortcut-help-command-status');
    desktopStatus = dialog.querySelector('#shortcut-help-desktop-status');
    dialog.querySelector('.shortcut-help-close').addEventListener('click', close);
    dialog.addEventListener('click', event => {
      event.stopPropagation();
      if (event.target === dialog) close();
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      readVersion++;
      document.querySelector('#shortcut-help-trigger')?.setAttribute('aria-expanded', 'false');
      if (previousFocus?.isConnected && !previousFocus.inert) previousFocus.focus({ preventScroll: true });
    });
    // Keep underlying app hotkeys from handling typing, Tab or Escape in this modal.
    dialog.addEventListener('keydown', event => event.stopPropagation());
    search.addEventListener('input', render);
    dialog.querySelector('.shortcut-help-settings').addEventListener('click', async event => {
      event.preventDefault();
      try {
        if (!global.chrome?.tabs?.create) throw new Error('unavailable');
        await global.chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      } catch {
        commandStatus.textContent = '请在 Chrome 地址栏打开 chrome://extensions/shortcuts 修改绑定。';
      }
    });
  }

  async function loadBindings() {
    const version = ++readVersion;
    rows = localRows;
    commandStatus.textContent = '正在读取 Chrome 实际绑定…';
    desktopStatus.textContent = '正在读取桌面助手状态…';
    render();
    // Independent reads: desktop component failure cannot hide Chrome bindings.
    await Promise.allSettled([
      (async () => {
        try {
          if (!global.chrome?.commands?.getAll) throw new Error('unavailable');
          const commands = await readWithin(() => global.chrome.commands.getAll());
          if (version !== readVersion || !dialog.open) return;
          rows = rows.concat(commands.filter(command => command.name !== '_execute_action').map(command => ({
            group: 'Chrome 快捷键', title: command.description || command.name,
            keys: command.shortcut || '未设置', scope: '由 Chrome 管理；生效范围以 Chrome 快捷键设置为准',
          })));
          commandStatus.textContent = 'Chrome 绑定为当前实值；未设置的组合可在浏览器中绑定。';
          render();
        } catch {
          if (version === readVersion) commandStatus.textContent = 'Chrome 快捷键读取失败；可进入浏览器设置核对。';
        }
      })(),
      (async () => {
        try {
          if (!global.chrome?.runtime?.sendMessage) throw new Error('unavailable');
          const state = await readWithin(() => global.chrome.runtime.sendMessage({ action: 'jelly_desktop_get' }));
          if (version !== readVersion || !dialog.open) return;
          if (!state?.ok || !state.assistant) throw new Error('unavailable');
          const assistant = state.assistant;
          const labels = { ctrl: '⌃', option: '⌥', shift: '⇧', cmd: '⌘', space: '空格' };
          const keys = String(assistant.hotkey || '').split('+').map(key => labels[key] || key.toUpperCase()).join(' ');
          const scope = !assistant.enabled ? '尚未启用；可在设置 → 桌面水母中开启' : assistant.needsResident ? '需要先开启桌面水母常驻' : ({
            ok: '系统已接受注册；在任意应用中使用，若冲突请在设置中更换',
            taken: '此组合已被占用，请在设置中更换', invalid: '此组合无效，请在设置中更换',
            failed: '系统未接受此组合，请在设置中更换', unsupported: '桌面组件需要更新',
          })[assistant.hotkeyStatus] || '等待桌面组件连接并注册';
          rows = rows.concat({ group: '桌面助手', title: '唤出桌面 AI 助手', keys: keys || '未设置', scope });
          desktopStatus.textContent = '';
          render();
        } catch {
          if (version === readVersion) desktopStatus.textContent = '桌面助手状态暂不可用，可在设置 → 桌面水母中核对。';
        }
      })(),
    ]);
  }

  function open() {
    if (!dialog) build();
    if (dialog.open) return;
    previousFocus = document.activeElement;
    dialog.inert = false;
    search.value = '';
    dialog.showModal();
    document.querySelector('#shortcut-help-trigger')?.setAttribute('aria-expanded', 'true');
    search.focus({ preventScroll: true });
    void loadBindings();
  }

  function close() { if (dialog?.open) dialog.close(); }

  function bindHintActivity() {
    const hint = document.querySelector('.shortcut-hints');
    if (!hint) return;
    const idleMs = 3000;
    let lastActivity = 0, timer = null;
    const hideWhenIdle = () => {
      timer = null;
      const remaining = idleMs - (Date.now() - lastActivity);
      if (remaining > 0) { timer = global.setTimeout(hideWhenIdle, remaining); return; }
      if (!hint.matches(':hover') && !hint.querySelector(':focus-visible')) hint.classList.remove('is-active');
    };
    const wake = () => {
      if (document.hidden) return;
      lastActivity = Date.now();
      hint.classList.add('is-active');
      // Mouse movement updates the timestamp; only one timer is ever active.
      if (timer === null) timer = global.setTimeout(hideWhenIdle, idleMs);
    };
    document.addEventListener('pointermove', wake, { passive: true });
    hint.addEventListener('pointerleave', wake, { passive: true });
    hint.addEventListener('focusin', wake);
    hint.addEventListener('focusout', wake);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      global.clearTimeout(timer); timer = null;
      hint.classList.remove('is-active');
    });
  }

  function init() {
    bindHintActivity();
    document.querySelector('#shortcut-help-trigger')?.addEventListener('click', open);
    global.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229 || event.repeat || event.defaultPrevented) return;
      if (dialog?.open && event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); close(); return;
      }
      if (!isHelpKey(event) || editable(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (dialog?.open) close(); else open();
    }, true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && dialog?.open) void loadBindings(); });
  }

  global.ShortcutHelp = { open, close };
  // 首页在提示栏之后立即加载本脚本；不要等后续重型脚本或异步设置就绪。
  init();
})(window);
