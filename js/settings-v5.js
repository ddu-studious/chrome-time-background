(function () {
  'use strict';

  const pages = {
    appearance: {
      title: '外观', eyebrow: 'LOOK & FEEL',
      desc: '统一时间、天气与界面主题的显示方式。',
      icon: 'fa-wand-magic-sparkles', targets: ['time', 'weather', 'appearance'],
    },
    homepage: {
      title: '首页', eyebrow: 'HOME SURFACE',
      desc: '决定新标签页上出现的信息、计划与工作入口。',
      icon: 'fa-house', targets: ['info', 'schedule', 'worklog'],
    },
    dock: {
      title: 'Dock', eyebrow: 'APP DOCK',
      desc: '管理固定应用、排序来源与悬浮反馈。',
      icon: 'fa-layer-group', targets: ['dock'],
    },
    'data-privacy': {
      title: '数据与隐私', eyebrow: 'LOCAL FIRST',
      desc: '查看数据边界，并分阶段导入、导出或重置配置。',
      icon: 'fa-lock', targets: ['data-privacy'],
    },
    integrations: {
      title: '集成', eyebrow: 'CONNECTIONS',
      desc: '配置壁纸来源、API Key 与可选网络能力。',
      icon: 'fa-plug', targets: ['background'],
    },
    shortcuts: {
      title: '快捷键', eyebrow: 'KEYBOARD',
      desc: '集中查看当前代码实际支持的键盘操作与使用说明。',
      icon: 'fa-keyboard', targets: ['shortcuts', 'guide'],
    },
    'about-diagnostics': {
      title: '关于与诊断', eyebrow: 'SYSTEM HEALTH',
      desc: '确认版本、运行上下文和功能开关，不向外部发送诊断数据。',
      icon: 'fa-circle-info', targets: ['diagnostics', 'performance', 'about'],
    },
  };

  const dockEffects = [
    ['magnify', '经典放大'], ['tilt', '3D 倾斜'], ['glow', '光晕效果'],
    ['bounce', '弹跳'], ['wave', '波浪'], ['spotlight', '聚光灯'],
    ['jelly', '果冻'], ['none', '无效果'],
  ];
  const storageKeys = {
    dock: 'dockManagerConfig', effect: 'dockEffectConfig', recent: 'dockManagerRecentApps',
  };
  let activePage = 'appearance';
  let stagedImport = null;
  let loadedDockConfig = null;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  async function areaGet(area, key = null) {
    try {
      const target = globalThis.chrome?.storage?.[area];
      if (target?.get) return await target.get(key);
    } catch { /* local preview fallback */ }
    if (key == null) return {};
    const keys = Array.isArray(key) ? key : [key];
    return Object.fromEntries(keys.map(item => {
      try { return [item, JSON.parse(localStorage.getItem(item))]; } catch { return [item, null]; }
    }).filter(([, value]) => value != null));
  }

  async function areaSet(area, patch) {
    try {
      const target = globalThis.chrome?.storage?.[area];
      if (target?.set) await target.set(patch);
    } catch { /* local preview fallback */ }
    if (!globalThis.chrome?.storage?.[area]) {
      for (const [key, value] of Object.entries(patch)) localStorage.setItem(key, JSON.stringify(value));
    } else if (area === 'local') {
      for (const [key, value] of Object.entries(patch)) localStorage.setItem(key, JSON.stringify(value));
    }
  }

  async function areaRemove(area, keys) {
    try {
      const target = globalThis.chrome?.storage?.[area];
      if (target?.remove) await target.remove(keys);
    } catch { /* local preview fallback */ }
    if (!globalThis.chrome?.storage?.[area] || area === 'local') for (const key of keys) localStorage.removeItem(key);
  }

  function status(message, tone = 'neutral') {
    const el = document.querySelector('#settings-v5-status');
    if (!el) return;
    el.dataset.tone = tone;
    el.innerHTML = `<i class="fas ${tone === 'success' ? 'fa-circle-check' : tone === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle'}"></i>${escapeHtml(message)}`;
  }

  function injectNavigation() {
    const sidebar = document.querySelector('.sp-sidebar');
    if (!sidebar) return;
    sidebar.dataset.v5Ready = 'true';
    sidebar.setAttribute('aria-label', '设置导航');
    sidebar.querySelectorAll('.sp-nav-section').forEach(section => section.remove());
    sidebar.insertAdjacentHTML('beforeend', `
      <div class="sp-v5-nav-meta"><span>设置中心</span><small>7 个配置域</small></div>
      <div class="sp-nav-section sp-v5-nav">${Object.entries(pages).map(([id, page]) => `
        <a class="sp-nav-item" data-page="${id}" href="#${id}" aria-label="${escapeHtml(page.title)}" title="${escapeHtml(page.title)}">
          <i class="fas ${page.icon}"></i><span>${page.title}</span><i class="fas fa-chevron-right"></i>
        </a>`).join('')}</div>
      <div class="sp-v5-local-note"><i class="fas fa-lock"></i><div><strong>本地优先</strong><span>敏感字段仅在确认后写入扩展存储</span></div></div>`);
  }

  function injectHeader() {
    const main = document.querySelector('.sp-main');
    if (!main) return;
    main.insertAdjacentHTML('afterbegin', `
      <header class="settings-v5-header">
        <div><span id="settings-v5-eyebrow"></span><h1 id="settings-v5-title"></h1><p id="settings-v5-desc"></p></div>
        <div class="settings-v5-header-actions">
          <span id="settings-v5-status" role="status" aria-live="polite" aria-atomic="true" data-tone="neutral"><i class="fas fa-circle"></i>准备就绪</span>
          <button type="button" id="settings-v5-back" title="返回新标签页" aria-label="返回首页"><i class="fas fa-arrow-left"></i><span>返回首页</span></button>
        </div>
      </header>`);
    document.querySelector('#settings-v5-back')?.addEventListener('click', () => {
      try {
        const url = globalThis.chrome?.runtime?.getURL?.('index.html') || 'index.html';
        location.href = url;
      } catch { location.href = 'index.html'; }
    });
  }

  function injectDockPage() {
    const main = document.querySelector('.sp-main');
    const apps = globalThis.ProductAppRegistry?.apps || [];
    main?.insertAdjacentHTML('beforeend', `
      <section class="sp-page settings-v5-special" id="page-dock">
        <div class="settings-v5-grid settings-v5-grid-wide">
          <article class="settings-v5-card settings-v5-dock-preview">
            <div class="settings-v5-card-title"><div><span>DOCK PREVIEW</span><h3>固定应用</h3></div><strong id="settings-v5-dock-count">—</strong></div>
            <p>勾选要常驻 Dock 的入口。应用启动台始终保留，未固定应用仍可从启动台访问。</p>
            <div class="settings-v5-app-grid">${apps.filter(app => !app.isSystem).map(app => `
              <label class="settings-v5-app-choice" data-app="${app.id}"><input type="checkbox" value="${app.id}"><i class="${app.icon}"></i><span>${escapeHtml(app.name)}</span><small>${escapeHtml(app.summary)}</small></label>`).join('')}</div>
            <button type="button" class="settings-v5-primary" id="settings-v5-save-dock"><i class="fas fa-check"></i>应用 Dock 配置</button>
          </article>
          <aside class="settings-v5-stack">
            <article class="settings-v5-card"><div class="settings-v5-card-title"><div><span>FEEDBACK</span><h3>悬浮效果</h3></div><i class="fas fa-wand-magic-sparkles"></i></div>
              <label class="settings-v5-control"><span>交互动效</span><select id="settings-v5-dock-effect">${dockEffects.map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</select></label>
              <p>修改后将在下一次打开新标签页时生效。</p>
            </article>
            <article class="settings-v5-card settings-v5-tip"><i class="fas fa-grip"></i><div><strong>排序仍在首页完成</strong><p>拖动 Dock 图标可调整顺序；本页只管理固定集合，避免意外改变已有分组。</p></div></article>
          </aside>
        </div>
      </section>`);
  }

  function injectPrivacyPage() {
    document.querySelector('.sp-main')?.insertAdjacentHTML('beforeend', `
      <section class="sp-page settings-v5-special" id="page-data-privacy">
        <div class="settings-v5-boundary"><i class="fas fa-lock"></i><div><span>DATA BOUNDARY</span><h2>你的配置默认留在浏览器</h2><p>同步设置由 Chrome 扩展存储管理；Dock、最近使用与游戏分数保存在本地。导出文件只在你点击后生成。</p></div></div>
        <div class="settings-v5-grid">
          <article class="settings-v5-card"><i class="fas fa-file-export settings-v5-card-icon"></i><h3>导出配置</h3><p>生成包含同步设置、本地设置和 localStorage 快照的 JSON 文件。</p><button type="button" id="settings-v5-export"><i class="fas fa-download"></i>导出 JSON</button></article>
          <article class="settings-v5-card"><i class="fas fa-file-import settings-v5-card-icon"></i><h3>分阶段导入</h3><p>先解析并展示范围，只有再次确认才会写入。</p><label class="settings-v5-file-label" for="settings-v5-import-file">选择设置备份 JSON</label><input type="file" id="settings-v5-import-file" accept="application/json,.json" aria-describedby="settings-v5-import-summary"><button type="button" id="settings-v5-import-confirm" class="settings-v5-primary" disabled><i class="fas fa-check"></i>确认导入</button><div id="settings-v5-import-summary" class="settings-v5-inline-status" role="status" aria-live="polite" aria-atomic="true">尚未选择文件</div></article>
          <article class="settings-v5-card settings-v5-danger"><i class="fas fa-rotate-left settings-v5-card-icon"></i><h3>重置界面配置</h3><p>只移除设置、背景源和 Dock 配置；不会清空任务、文稿或知识库内容。</p><button type="button" id="settings-v5-reset" aria-expanded="false" aria-controls="settings-v5-reset-actions"><i class="fas fa-rotate-left"></i>准备重置</button><div class="settings-v5-reset-actions" id="settings-v5-reset-actions" role="group" aria-label="确认重置界面配置" hidden><button type="button" id="settings-v5-reset-cancel">取消</button><button type="button" id="settings-v5-reset-confirm" class="danger">确认重置界面配置</button></div></article>
        </div>
      </section>`);
  }

  function injectShortcutsPage() {
    document.querySelector('.sp-main')?.insertAdjacentHTML('beforeend', `
      <section class="sp-page settings-v5-special" id="page-shortcuts">
        <div class="settings-v5-shortcuts">
          <article><kbd>⌘ / Ctrl</kbd><b>+</b><kbd>K</kbd><div><strong>上下文搜索</strong><span>音乐面板、任务面板和知识区使用当前上下文搜索。</span></div></article>
          <article><kbd>Esc</kbd><div><strong>关闭顶层浮层</strong><span>优先关闭菜单、抽屉、启动台或当前应用面板。</span></div></article>
          <article><kbd>Space</kbd><div><strong>专注模式控制</strong><span>焦点不在输入框时切换专注计时的运行状态。</span></div></article>
          <article><kbd>↑ ↓ ← →</kbd><div><strong>游戏与列表导航</strong><span>三款本地游戏和部分选择列表支持方向键。</span></div></article>
        </div>
      </section>`);
  }

  function injectDiagnosticsPage() {
    document.querySelector('.sp-main')?.insertAdjacentHTML('beforeend', `
      <section class="sp-page settings-v5-special" id="page-diagnostics">
        <div class="settings-v5-diagnostics">
          <div><span>运行上下文</span><strong id="settings-v5-runtime">检测中</strong></div>
          <div><span>扩展版本</span><strong id="settings-v5-version">—</strong></div>
          <div><span>存储能力</span><strong id="settings-v5-storage">检测中</strong></div>
          <div><span>网络诊断</span><strong>未主动运行</strong></div>
        </div>
        <button type="button" id="settings-v5-run-diagnostics"><i class="fas fa-stethoscope"></i>运行本地诊断</button>
        <pre id="settings-v5-diagnostic-log">诊断不会访问外部服务，也不会上传日志。</pre>
      </section>`);
  }

  function markSectionGroups() {
    for (const [pageId, page] of Object.entries(pages)) {
      for (const target of page.targets) document.querySelector(`#page-${target}`)?.setAttribute('data-settings-group', pageId);
    }
  }

  function enhanceFormSemantics() {
    document.querySelectorAll('.sp-field').forEach((field, fieldIndex) => {
      const label = field.querySelector('.sp-field-label');
      if (!label) return;
      if (!label.id) label.id = `settings-v5-field-label-${fieldIndex + 1}`;
      field.querySelectorAll('input, select, textarea').forEach(control => {
        if (!control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) {
          const provider = field.classList.contains('sp-bg-key-field')
            ? field.closest('.sp-bg-source')?.querySelector(':scope > .sp-field .sp-field-label')?.textContent?.trim()
            : '';
          if (provider) control.setAttribute('aria-label', `${provider} ${label.textContent.trim()}`);
          else control.setAttribute('aria-labelledby', label.id);
        }
      });
    });
  }

  function collapseResetConfirmation({ focus = false, announce = false } = {}) {
    const reset = document.querySelector('#settings-v5-reset');
    const actions = document.querySelector('#settings-v5-reset-actions');
    if (!reset || !actions) return;
    actions.hidden = true;
    reset.hidden = false;
    reset.setAttribute('aria-expanded', 'false');
    if (announce) status('已取消重置，配置未改变');
    if (focus) reset.focus({ preventScroll: true });
  }

  function showPage(pageId, updateHash = true) {
    if (activePage === 'data-privacy' && pageId !== 'data-privacy') collapseResetConfirmation();
    const page = pages[pageId] || pages.appearance;
    activePage = pages[pageId] ? pageId : 'appearance';
    document.querySelectorAll('.sp-page').forEach(section => section.classList.remove('active'));
    for (const target of page.targets) document.querySelector(`#page-${target}`)?.classList.add('active');
    document.querySelectorAll('.sp-nav-item[data-page]').forEach(item => {
      const current = item.dataset.page === activePage;
      item.classList.toggle('active', current);
      if (current) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    document.querySelector('#settings-v5-eyebrow').textContent = page.eyebrow;
    document.querySelector('#settings-v5-title').textContent = page.title;
    document.querySelector('#settings-v5-desc').textContent = page.desc;
    document.body.dataset.settingsPage = activePage;
    globalThis.ProductUIV5?.setBusinessPage?.('settings', activePage);
    if (updateHash) history.replaceState(null, '', `#${activePage}`);
    document.querySelector('.sp-main')?.scrollTo?.({ top: 0, behavior: 'instant' });
    globalThis.scrollTo?.({ top: 0, behavior: 'instant' });
  }

  function bindNavigation() {
    document.querySelectorAll('.sp-nav-item[data-page]').forEach(item => item.addEventListener('click', event => {
      event.preventDefault();
      showPage(item.dataset.page);
    }));
  }

  async function loadDockState() {
    const apps = globalThis.ProductAppRegistry?.apps || [];
    const local = await areaGet('local', [storageKeys.dock, storageKeys.effect]);
    let config = local[storageKeys.dock];
    if (!config) {
      try { config = JSON.parse(localStorage.getItem(storageKeys.dock)); } catch { /* default */ }
    }
    loadedDockConfig = config || {
      version: 2,
      items: apps.filter(app => app.defaultInDock).map(app => ({ type: 'app', appId: app.id })),
      hiddenApps: [],
    };
    const selected = new Set(loadedDockConfig.items.flatMap(item => item.type === 'group' ? (item.children || []) : item.type === 'app' ? [item.appId] : []));
    document.querySelectorAll('.settings-v5-app-choice input').forEach(input => { input.checked = selected.has(input.value); });
    updateDockCount();
    let effect = local[storageKeys.effect];
    if (!effect) {
      try { effect = JSON.parse(localStorage.getItem(storageKeys.effect)); } catch { /* default */ }
    }
    const select = document.querySelector('#settings-v5-dock-effect');
    if (select) select.value = effect?.effect || 'magnify';
  }

  function updateDockCount() {
    const count = document.querySelectorAll('.settings-v5-app-choice input:checked').length;
    const el = document.querySelector('#settings-v5-dock-count');
    if (el) el.textContent = `${count} 个`;
  }

  function reconcileDockItems(config, selectedIds) {
    const selected = new Set(selectedIds);
    const included = new Set();
    const items = [];
    for (const item of config?.items || []) {
      if (item.type === 'app' && selected.has(item.appId) && !included.has(item.appId)) {
        items.push({ ...item });
        included.add(item.appId);
      } else if (item.type === 'group') {
        const children = (item.children || []).filter(appId => selected.has(appId) && !included.has(appId));
        children.forEach(appId => included.add(appId));
        if (children.length > 1) items.push({ ...item, children });
        else if (children.length === 1) items.push({ type: 'app', appId: children[0] });
      } else if (item.type === 'divider') {
        items.push({ ...item });
      }
    }
    for (const appId of selectedIds) {
      if (!included.has(appId)) {
        items.push({ type: 'app', appId });
        included.add(appId);
      }
    }
    return items.filter((item, index, all) => item.type !== 'divider' || (index > 0 && index < all.length - 1 && all[index - 1].type !== 'divider'));
  }

  function bindDock() {
    document.querySelectorAll('.settings-v5-app-choice input').forEach(input => input.addEventListener('change', updateDockCount));
    document.querySelector('#settings-v5-save-dock')?.addEventListener('click', async () => {
      const ids = [...document.querySelectorAll('.settings-v5-app-choice input:checked')].map(input => input.value);
      const allIds = (globalThis.ProductAppRegistry?.apps || []).filter(app => !app.isSystem).map(app => app.id);
      const config = { version: 2, items: reconcileDockItems(loadedDockConfig, ids), hiddenApps: allIds.filter(id => !ids.includes(id)), lastModified: Date.now() };
      await areaSet('local', { [storageKeys.dock]: config });
      loadedDockConfig = config;
      status(`已保存 ${ids.length} 个 Dock 应用`, 'success');
    });
    document.querySelector('#settings-v5-dock-effect')?.addEventListener('change', async event => {
      const effect = event.target.value;
      await areaSet('local', { [storageKeys.effect]: { effect } });
      status(`悬浮效果已设为“${event.target.selectedOptions[0].textContent}”`, 'success');
    });
  }

  function validImport(value) {
    return value?.schema === 'chrome-time-background-settings' && value.version === 1
      && [value.sync, value.local, value.localStorage].every(part => part == null || (typeof part === 'object' && !Array.isArray(part)));
  }

  function bindPrivacy() {
    document.querySelector('#settings-v5-export')?.addEventListener('click', async () => {
      const sync = await areaGet('sync');
      const local = await areaGet('local');
      const localSnapshot = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        localSnapshot[key] = localStorage.getItem(key);
      }
      const payload = { schema: 'chrome-time-background-settings', version: 1, exportedAt: new Date().toISOString(), sync, local, localStorage: localSnapshot };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href, download: `chrome-time-background-settings-${new Date().toISOString().slice(0, 10)}.json` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 0);
      status('配置已导出到本地文件', 'success');
    });
    document.querySelector('#settings-v5-import-file')?.addEventListener('change', async event => {
      stagedImport = null;
      const confirm = document.querySelector('#settings-v5-import-confirm');
      const summary = document.querySelector('#settings-v5-import-summary');
      try {
        const file = event.target.files?.[0];
        if (!file) {
          summary.textContent = '尚未选择文件';
          confirm.disabled = true;
          status('已取消选择导入文件');
          return;
        }
        const parsed = JSON.parse(await file.text());
        if (!validImport(parsed)) throw new Error('结构不符合设置备份格式');
        stagedImport = parsed;
        const counts = ['sync', 'local', 'localStorage'].map(key => `${key} ${Object.keys(parsed[key] || {}).length} 项`).join(' · ');
        summary.textContent = `已解析：${counts}。尚未写入。`;
        confirm.disabled = false;
        status('导入文件已暂存，等待确认');
      } catch (error) {
        summary.textContent = `无法导入：${error.message}`;
        confirm.disabled = true;
        status('导入文件校验失败', 'danger');
      }
    });
    document.querySelector('#settings-v5-import-confirm')?.addEventListener('click', async () => {
      if (!stagedImport) return;
      if (stagedImport.sync) await areaSet('sync', stagedImport.sync);
      if (stagedImport.local) await areaSet('local', stagedImport.local);
      for (const [key, value] of Object.entries(stagedImport.localStorage || {})) localStorage.setItem(key, String(value));
      stagedImport = null;
      document.querySelector('#settings-v5-import-confirm').disabled = true;
      document.querySelector('#settings-v5-import-summary').textContent = '导入完成，重新打开新标签页后完整生效。';
      status('配置导入完成', 'success');
    });
    const reset = document.querySelector('#settings-v5-reset');
    const confirmReset = document.querySelector('#settings-v5-reset-confirm');
    const cancelReset = document.querySelector('#settings-v5-reset-cancel');
    const resetActions = document.querySelector('#settings-v5-reset-actions');
    reset?.addEventListener('click', () => {
      reset.hidden = true;
      resetActions.hidden = false;
      reset.setAttribute('aria-expanded', 'true');
      confirmReset.focus();
      status('重置尚未执行，请再次确认', 'danger');
    });
    cancelReset?.addEventListener('click', () => collapseResetConfirmation({ focus: true, announce: true }));
    resetActions?.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      collapseResetConfirmation({ focus: true, announce: true });
    });
    confirmReset?.addEventListener('click', async () => {
      await areaRemove('sync', ['settings', 'backgroundProviderSettings']);
      await areaRemove('local', Object.values(storageKeys));
      status('界面配置已重置；业务内容未删除', 'success');
      collapseResetConfirmation({ focus: true });
    });
  }

  async function runDiagnostics() {
    const manifest = globalThis.chrome?.runtime?.getManifest?.();
    const extension = Boolean(globalThis.chrome?.runtime?.id);
    document.querySelector('#settings-v5-runtime').textContent = extension ? 'Chrome 扩展' : '本地预览';
    document.querySelector('#settings-v5-version').textContent = manifest?.version || '开发版本';
    let storageText = globalThis.chrome?.storage ? '扩展存储可用' : 'localStorage 降级';
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage != null) storageText += ` · ${(estimate.usage / 1024 / 1024).toFixed(1)} MB`;
    } catch { /* optional API */ }
    document.querySelector('#settings-v5-storage').textContent = storageText;
    const log = [
      `运行上下文: ${extension ? 'extension' : location.origin}`,
      `页面注册: ${globalThis.ProductPagesV5?.totalPages || 0} 个`,
      `Chrome storage: ${globalThis.chrome?.storage ? 'available' : 'fallback'}`,
      '外部网络: 未访问',
    ];
    document.querySelector('#settings-v5-diagnostic-log').textContent = log.join('\n');
    status('本地诊断完成', 'success');
  }

  function bindDiagnostics() {
    document.querySelector('#settings-v5-run-diagnostics')?.addEventListener('click', runDiagnostics);
    runDiagnostics();
  }

  async function init() {
    injectNavigation();
    injectHeader();
    injectDockPage();
    injectPrivacyPage();
    injectShortcutsPage();
    injectDiagnosticsPage();
    markSectionGroups();
    enhanceFormSemantics();
    bindNavigation();
    bindDock();
    bindPrivacy();
    bindDiagnostics();
    await loadDockState();
    const hash = location.hash.slice(1);
    showPage(pages[hash] ? hash : 'appearance', false);
  }

  globalThis.SettingsV5 = Object.freeze({ init, showPage, runDiagnostics, reconcileDockItems, pages, getActivePage: () => activePage });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
