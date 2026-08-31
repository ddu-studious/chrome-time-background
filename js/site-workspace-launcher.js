(function () {
  'use strict';

  const Core = window.SiteWorkspaceCore;
  if (!Core || typeof chrome === 'undefined') return;
  const service = new Core.WorkspaceService(chrome);

  async function openPanel() {
    await service.openPanel();
  }

  async function openUrl(url, options = {}) {
    const panelPromise = service.openPanel();
    const tabPromise = service.openUrl(url, options);
    const [, result] = await Promise.all([panelPromise, tabPromise]);
    return result;
  }

  function bindButton() {
    const button = document.getElementById('site-workspace-dock-btn');
    if (!button || button.dataset.siteWorkspaceBound === 'true') return;
    button.dataset.siteWorkspaceBound = 'true';
    button.setAttribute('aria-label', '打开网站工作区');
    button.addEventListener('click', event => {
      event.stopPropagation();
      openPanel().catch(error => console.warn('[SiteWorkspace] 打开侧边栏失败:', error));
    });
  }

  const observer = new MutationObserver(bindButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  bindButton();

  window.siteWorkspaceLauncher = Object.freeze({ openPanel, openUrl, service });
})();
