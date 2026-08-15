/**
 * v5 product shell: default home cockpit and focus workspace.
 * The existing TodayOverview module remains the read-only aggregation page.
 */
(function exposeProductShellV5(global) {
  'use strict';

  class ProductShellV5 {
    constructor() {
      this.home = null;
      this.focus = null;
      this.toolbar = null;
      this.personalize = null;
      this.offline = null;
      this._focusTimer = null;
      this._focusRemaining = 25 * 60;
      this._focusRunning = false;
      this._focusStartedAt = 0;
      this._lastFocused = null;
      this._preferences = {
        density: 1,
        scale: 1,
        dim: 24,
        cards: { focus: true, agenda: true, music: true },
      };
    }

    async init() {
      if (document.getElementById('v5-shell-home')) return;
      this._buildHome();
      this._buildToolbar();
      this._buildPersonalize();
      this._buildOffline();
      this._buildFocus();
      this._bind();
      await this._loadPreferences();
      await this.refresh();
      chrome.storage?.onChanged?.addListener?.((changes, area) => {
        if (area !== 'local') return;
        if (['schedulePlans', 'memos', 'worklogEntries', 'bookmarkCache', 'lastMusicState'].some(key => changes[key])) {
          void this.refresh();
        }
      });
      window.addEventListener('online', () => this._renderNetworkState());
      window.addEventListener('offline', () => {
        this._renderNetworkState();
        if (global.ProductUIV5?.getState?.().shellPage === 'home') this.openOffline(false);
      });
      global.ProductUIV5?.subscribe?.((state, reason) => {
        if (reason === 'player') this._renderMusic(state.player);
      });
    }

    _buildHome() {
      this.home = document.createElement('section');
      this.home.id = 'v5-shell-home';
      this.home.className = 'v5-shell-home';
      this.home.setAttribute('aria-label', '产品首页工作台');
      this.home.innerHTML = `
        <article class="v5-home-card v5-focus-card">
          <div class="v5-card-kicker"><i class="fas fa-bullseye"></i> 今日焦点 <span id="v5-focus-status">准备开始</span></div>
          <div class="v5-focus-card-body">
            <div class="v5-progress-ring" id="v5-focus-ring" style="--progress:0"><strong id="v5-focus-progress">0%</strong><small>今日专注</small></div>
            <div class="v5-focus-copy"><span>下一项</span><strong id="v5-focus-title">完成 v5 设计审计</strong><small id="v5-focus-meta">25 分钟 · 工作</small></div>
          </div>
          <button class="v5-primary-btn" type="button" data-shell-open="focus"><i class="fas fa-play"></i> 开始专注</button>
        </article>
        <article class="v5-home-card v5-agenda-card">
          <div class="v5-card-kicker"><i class="fas fa-stream"></i> 今日概览 <span id="v5-agenda-count">0 项</span></div>
          <div class="v5-agenda-list" id="v5-agenda-list"></div>
          <button class="v5-link-btn" type="button" data-shell-open="today">打开完整概览 <i class="fas fa-arrow-right"></i></button>
        </article>
        <article class="v5-home-card v5-home-player" data-shell-open="music" role="button" tabindex="0" aria-label="打开网易云音乐">
          <div class="v5-home-player-cover" id="v5-home-player-cover"><i class="fas fa-music"></i></div>
          <div class="v5-home-player-copy"><span id="v5-home-player-status">音乐</span><strong id="v5-home-player-title">打开网易云音乐</strong><small id="v5-home-player-artist">选择一首歌开始今天</small></div>
          <div class="v5-home-player-action"><i class="fas fa-chevron-right"></i></div>
        </article>`;
      document.body.appendChild(this.home);
    }

    _buildToolbar() {
      this.toolbar = document.createElement('nav');
      this.toolbar.id = 'v5-shell-toolbar';
      this.toolbar.className = 'v5-shell-toolbar';
      this.toolbar.setAttribute('aria-label', '首页视图');
      this.toolbar.innerHTML = `
        <button type="button" data-shell-open="today"><i class="fas fa-sun"></i><span>今日概览</span></button>
        <button type="button" data-shell-open="personalize"><i class="fas fa-sliders-h"></i><span>个性化</span></button>
        <button type="button" data-shell-open="focus"><i class="fas fa-bullseye"></i><span>专注</span></button>
        <button type="button" data-shell-open="offline" id="v5-network-entry"><i class="fas fa-wifi"></i><span>网络正常</span></button>`;
      document.body.appendChild(this.toolbar);
    }

    _buildPersonalize() {
      this.personalize = document.createElement('section');
      this.personalize.id = 'v5-personalize-workspace';
      this.personalize.className = 'v5-personalize-workspace hidden';
      this.personalize.setAttribute('role', 'dialog');
      this.personalize.setAttribute('aria-modal', 'true');
      this.personalize.setAttribute('aria-labelledby', 'v5-personalize-title');
      this.personalize.innerHTML = `
        <header class="v5-workspace-header">
          <div class="v5-brand"><span class="v5-brand-mark"><i class="fas fa-mountain"></i></span><span>效率工作台</span></div>
          <div><span class="v5-page-eyebrow">首页布局</span><h1 id="v5-personalize-title">个性化首页</h1></div>
          <div class="v5-header-actions"><button class="v5-secondary-btn" type="button" data-personalize-action="reset"><i class="fas fa-undo"></i>恢复默认</button><button class="v5-primary-btn" type="button" data-personalize-action="save"><i class="fas fa-check"></i>保存布局</button><button class="v5-icon-btn" type="button" data-personalize-action="close" aria-label="关闭个性化"><i class="fas fa-times"></i></button></div>
        </header>
        <div class="v5-personalize-stage">
          <aside class="v5-config-panel">
            <span class="v5-section-label">布局模板</span>
            <button class="v5-template-card active" type="button" data-layout-template="balanced"><strong>均衡工作台</strong><small>专注、日程与音乐并重</small></button>
            <button class="v5-template-card" type="button" data-layout-template="focus"><strong>深度工作</strong><small>放大今日焦点，减少干扰</small></button>
            <button class="v5-template-card" type="button" data-layout-template="compact"><strong>紧凑总览</strong><small>一屏容纳更多信息</small></button>
            <div class="v5-config-note"><i class="fas fa-shield-alt"></i><span>布局偏好只保存在本机</span></div>
          </aside>
          <main class="v5-layout-preview" aria-label="首页布局预览">
            <div class="v5-preview-toolbar"><span><i class="fas fa-desktop"></i> 实时预览</span><small>1280 × 800</small></div>
            <div class="v5-preview-canvas">
              <div class="v5-preview-clock">22:48<small>:20</small></div>
              <div class="v5-preview-grid">
                <article data-preview-card="focus"><span>今日焦点</span><strong>完成 v5 设计审计</strong><div class="v5-preview-progress"><i></i></div></article>
                <article data-preview-card="agenda"><span>今日概览</span><div>09:30 设计评审</div><div>14:00 功能验收</div><div>18:30 整理总结</div></article>
                <article data-preview-card="music"><span>正在播放</span><strong>晨风大海</strong><small>本地播放器</small></article>
              </div>
              <div class="v5-preview-dock"><i></i><i></i><i></i><i></i><i></i><i></i></div>
            </div>
          </main>
          <aside class="v5-config-panel v5-config-controls">
            <span class="v5-section-label">显示设置</span>
            <label>界面缩放 <output data-value-for="scale">100%</output><input type="range" min="85" max="115" step="5" value="100" data-pref="scale"></label>
            <label>内容密度 <output data-value-for="density">标准</output><input type="range" min="0" max="2" step="1" value="1" data-pref="density"></label>
            <label>背景压暗 <output data-value-for="dim">24%</output><input type="range" min="0" max="55" step="1" value="24" data-pref="dim"></label>
            <span class="v5-section-label">首页卡片</span>
            <label class="v5-toggle-row"><span>今日焦点</span><input type="checkbox" checked data-card-pref="focus"><i></i></label>
            <label class="v5-toggle-row"><span>今日概览</span><input type="checkbox" checked data-card-pref="agenda"><i></i></label>
            <label class="v5-toggle-row"><span>音乐播放器</span><input type="checkbox" checked data-card-pref="music"><i></i></label>
          </aside>
        </div>
        <footer class="v5-workspace-footer"><span><i class="fas fa-mouse-pointer"></i> 控件会实时更新预览</span><button type="button" class="v5-link-btn" data-personalize-action="close">取消并返回首页</button></footer>`;
      document.body.appendChild(this.personalize);
    }

    _buildOffline() {
      this.offline = document.createElement('section');
      this.offline.id = 'v5-offline-workspace';
      this.offline.className = 'v5-offline-workspace hidden';
      this.offline.setAttribute('role', 'dialog');
      this.offline.setAttribute('aria-modal', 'true');
      this.offline.setAttribute('aria-labelledby', 'v5-offline-title');
      this.offline.innerHTML = `
        <header class="v5-workspace-header v5-offline-header">
          <div class="v5-brand"><span class="v5-brand-mark"><i class="fas fa-mountain"></i></span><span>效率工作台</span></div>
          <div class="v5-network-badge" id="v5-network-badge"><i class="fas fa-wifi"></i><span>检测网络中</span></div>
          <button class="v5-icon-btn" type="button" data-offline-action="close" aria-label="返回首页"><i class="fas fa-times"></i></button>
        </header>
        <div class="v5-offline-stage">
          <section class="v5-offline-summary">
            <div class="v5-offline-icon"><i class="fas fa-cloud"></i><span></span></div>
            <span class="v5-page-eyebrow">离线恢复中心</span>
            <h1 id="v5-offline-title">网络连接已断开</h1>
            <p id="v5-offline-description">本地任务、计划、工作日志和已缓存内容仍然可用；联网后会自动恢复同步。</p>
            <div class="v5-offline-actions"><button class="v5-primary-btn" type="button" data-offline-action="retry"><i class="fas fa-sync-alt"></i>重新检测</button><button class="v5-secondary-btn" type="button" data-offline-action="close">继续离线使用</button></div>
          </section>
          <aside class="v5-sync-panel">
            <div class="v5-sync-title"><span>同步队列</span><small id="v5-sync-count">3 项等待</small></div>
            <div class="v5-sync-row"><i class="fas fa-check-square"></i><div><strong>任务变更</strong><small>2 条本地更新</small></div><span>等待网络</span></div>
            <div class="v5-sync-row"><i class="fas fa-clipboard-list"></i><div><strong>工作日志</strong><small>今天 42 分钟</small></div><span>仅本地</span></div>
            <div class="v5-sync-row"><i class="fas fa-pen-nib"></i><div><strong>写作草稿</strong><small>自动保存成功</small></div><span>待同步</span></div>
            <div class="v5-sync-tip"><i class="fas fa-lock"></i><span>关闭页面不会丢失本地修改</span></div>
          </aside>
          <section class="v5-offline-apps">
            <span class="v5-section-label">离线可用</span>
            <div><button type="button" data-offline-open="memo"><i class="fas fa-tasks"></i><span>任务</span><small>本地完整可用</small></button><button type="button" data-offline-open="schedule"><i class="fas fa-calendar-check"></i><span>计划</span><small>本地完整可用</small></button><button type="button" data-offline-open="worklog"><i class="fas fa-clipboard-list"></i><span>工作日志</span><small>本地完整可用</small></button><button type="button" data-offline-open="knowledge"><i class="fas fa-brain"></i><span>常用信息</span><small>缓存内容可用</small></button></div>
          </section>
        </div>
        <footer class="v5-workspace-footer"><span><i class="fas fa-database"></i> 本地优先 · 自动保存</span><span id="v5-network-checked">尚未检测</span></footer>`;
      document.body.appendChild(this.offline);
    }

    _buildFocus() {
      this.focus = document.createElement('section');
      this.focus.id = 'v5-focus-workspace';
      this.focus.className = 'v5-focus-workspace hidden';
      this.focus.setAttribute('role', 'dialog');
      this.focus.setAttribute('aria-modal', 'true');
      this.focus.setAttribute('aria-labelledby', 'v5-focus-heading');
      this.focus.innerHTML = `
        <header class="v5-focus-header">
          <div class="v5-brand"><span class="v5-brand-mark"><i class="fas fa-mountain"></i></span><span>效率工作台</span></div>
          <div class="v5-focus-mode-badge"><i class="fas fa-moon"></i> 专注模式</div>
          <button type="button" class="v5-icon-btn" data-focus-action="close" aria-label="退出专注模式"><i class="fas fa-times"></i></button>
        </header>
        <div class="v5-focus-stage">
          <div class="v5-focus-hero">
            <span class="v5-focus-label">当前专注</span>
            <h1 id="v5-focus-heading">完成 v5 设计审计</h1>
            <div class="v5-focus-chips"><span>工作</span><span>25 分钟</span><span><i class="fas fa-volume-down"></i> 山间夜雨</span></div>
            <div class="v5-focus-clock" id="v5-focus-clock">25:00</div>
            <div class="v5-focus-track"><span id="v5-focus-track-fill"></span></div>
            <div class="v5-focus-actions">
              <button type="button" class="v5-primary-btn" data-focus-action="toggle"><i class="fas fa-play"></i><span>开始</span></button>
              <button type="button" class="v5-secondary-btn" data-focus-action="away"><i class="fas fa-coffee"></i> 暂离</button>
              <button type="button" class="v5-secondary-btn" data-focus-action="finish"><i class="fas fa-check"></i> 完成并总结</button>
            </div>
          </div>
          <aside class="v5-focus-aside">
            <section><span>今日专注</span><strong id="v5-focus-total">0 分钟</strong><small>完成后会写入本地统计</small></section>
            <section><span>环境声音</span><div class="v5-sound-options"><button class="active" type="button">山间夜雨</button><button type="button">松林风声</button><button type="button">关闭</button></div></section>
            <section><span>下一项建议</span><strong id="v5-focus-next">整理实现验收记录</strong><small>来自今日未完成任务</small></section>
          </aside>
        </div>
        <footer class="v5-focus-footer"><span><kbd>Space</kbd> 暂停/继续</span><span><kbd>Esc</kbd> 退出专注</span><span>本地计时 · 不上传</span></footer>`;
      document.body.appendChild(this.focus);
    }

    _bind() {
      document.addEventListener('click', event => {
        const opener = event.target.closest('[data-shell-open]');
        if (!opener) return;
        const page = opener.dataset.shellOpen;
        if (page === 'today') this.openToday();
        if (page === 'focus') this.openFocus();
        if (page === 'personalize') this.openPersonalize();
        if (page === 'offline') this.openOffline(true);
        if (page === 'music') document.getElementById('music-dock-btn')?.click();
      });
      this.home.querySelector('[data-shell-open="music"]')?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          document.getElementById('music-dock-btn')?.click();
        }
      });
      this.focus.addEventListener('click', event => {
        const action = event.target.closest('[data-focus-action]')?.dataset.focusAction;
        if (!action) return;
        if (action === 'close') this.closeFocus();
        if (action === 'toggle') this._toggleFocus();
        if (action === 'away') this._pauseFocus('已暂离');
        if (action === 'finish') this._finishFocus();
      });
      this.focus.querySelectorAll('.v5-sound-options button').forEach(button => {
        button.addEventListener('click', () => {
          this.focus.querySelectorAll('.v5-sound-options button').forEach(item => item.classList.toggle('active', item === button));
        });
      });
      this.personalize.addEventListener('click', event => {
        const action = event.target.closest('[data-personalize-action]')?.dataset.personalizeAction;
        if (action === 'close') this.closePersonalize();
        if (action === 'save') void this._savePreferences();
        if (action === 'reset') this._resetPreferences();
        const template = event.target.closest('[data-layout-template]')?.dataset.layoutTemplate;
        if (template) this._applyTemplate(template);
      });
      this.personalize.addEventListener('input', event => {
        if (event.target.matches('[data-pref], [data-card-pref]')) this._readPreferenceControls();
      });
      this.offline.addEventListener('click', event => {
        const action = event.target.closest('[data-offline-action]')?.dataset.offlineAction;
        if (action === 'close') this.closeOffline();
        if (action === 'retry') this._retryNetwork();
        const app = event.target.closest('[data-offline-open]')?.dataset.offlineOpen;
        if (app) {
          const ids = { memo: 'memo-toggle-btn', schedule: 'schedule-dock-btn', worklog: 'worklog-dock-btn', knowledge: 'kw-dock-btn' };
          this.closeOffline();
          document.getElementById(ids[app])?.click();
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !this.personalize?.classList.contains('hidden')) this.closePersonalize();
        else if (event.key === 'Escape' && !this.offline?.classList.contains('hidden')) this.closeOffline();
        else if (event.key === 'Escape' && !this.focus?.classList.contains('hidden')) this.closeFocus();
        if (!this.focus || this.focus.classList.contains('hidden')) return;
        if (event.key === ' ' && !event.target.closest('button, input, textarea')) {
          event.preventDefault();
          this._toggleFocus();
        }
      });
    }

    async refresh() {
      const data = await chrome.storage.local.get(['schedulePlans', 'memos', 'worklogEntries', 'lastMusicState', 'v5FocusMinutes']);
      const today = this._today();
      const plans = (data.schedulePlans || []).filter(item => item.date === today && !item.completed);
      const tasks = (data.memos || []).filter(item => !item.completed && !item.deleted);
      const next = plans[0]?.name || tasks[0]?.title || tasks[0]?.text || '完成 v5 设计审计';
      const agenda = [
        ...plans.slice(0, 2).map(item => ({ icon: 'fa-calendar-check', meta: item.startTime || '--:--', title: item.name || '未命名计划' })),
        ...tasks.slice(0, 2).map(item => ({ icon: 'fa-check-square', meta: '任务', title: item.title || item.text || '未命名任务' })),
      ].slice(0, 3);
      this.home.querySelector('#v5-focus-title').textContent = next;
      this.focus.querySelector('#v5-focus-heading').textContent = next;
      this.focus.querySelector('#v5-focus-next').textContent = tasks[1]?.title || tasks[1]?.text || '整理实现验收记录';
      this.focus.querySelector('#v5-focus-total').textContent = `${Number(data.v5FocusMinutes || 0)} 分钟`;
      this.home.querySelector('#v5-agenda-count').textContent = `${plans.length + tasks.length} 项`;
      this.home.querySelector('#v5-agenda-list').innerHTML = agenda.length ? agenda.map(item => `
        <div class="v5-agenda-row"><i class="fas ${item.icon}"></i><span class="v5-agenda-time">${this._esc(item.meta)}</span><strong>${this._esc(item.title)}</strong><i class="fas fa-chevron-right"></i></div>`).join('') : '<div class="v5-home-empty"><i class="fas fa-check-circle"></i><span>今天没有待处理事项</span></div>';
      const storedPlayer = data.lastMusicState;
      const storedPlayerFresh = Boolean(storedPlayer?.title && Date.now() - (storedPlayer.savedAt || 0) < 30 * 60 * 1000);
      this._renderMusic(storedPlayerFresh ? storedPlayer : (global.ProductUIV5?.getState?.().player || {}));
    }

    _renderMusic(player) {
      const title = player.title || '打开网易云音乐';
      const artist = player.artist || '选择一首歌开始今天';
      const status = player.title ? (player.isPlaying ? '正在播放' : '最近播放') : '音乐';
      this.home.querySelector('#v5-home-player-status').textContent = status;
      this.home.querySelector('#v5-home-player-title').textContent = title;
      this.home.querySelector('#v5-home-player-artist').textContent = artist;
      const cover = this.home.querySelector('#v5-home-player-cover');
      if (player.cover) cover.innerHTML = `<img src="${this._esc(player.cover)}" alt="${this._esc(title)}封面">`;
      else cover.innerHTML = '<i class="fas fa-music"></i>';
    }

    openToday() {
      this._lastFocused = document.activeElement;
      this._closeShellOverlays();
      global.ProductUIV5?.setShellPage?.('today');
      global.todayOverview?.open?.();
    }

    openFocus() {
      this._lastFocused = document.activeElement;
      this._closeShellOverlays();
      global.ProductUIV5?.setShellPage?.('focus');
      document.body.classList.add('v5-focus-open');
      this.focus.classList.remove('hidden');
      this.focus.querySelector('[data-focus-action="toggle"]')?.focus();
    }

    closeFocus(status = '已暂停') {
      this._pauseFocus(status);
      document.body.classList.remove('v5-focus-open');
      this.focus.classList.add('hidden');
      global.ProductUIV5?.setShellPage?.('home');
      this._lastFocused?.focus?.();
    }

    openPersonalize() {
      this._lastFocused = document.activeElement;
      this._closeShellOverlays();
      global.ProductUIV5?.setShellPage?.('personalize');
      this.personalize.classList.remove('hidden');
      this._writePreferenceControls();
      setTimeout(() => this.personalize.querySelector('[data-personalize-action="save"]')?.focus(), 40);
    }

    closePersonalize() {
      this.personalize.classList.add('hidden');
      global.ProductUIV5?.setShellPage?.('home');
      this._lastFocused?.focus?.();
    }

    openOffline(forcePreview = false) {
      this._lastFocused = document.activeElement;
      this._closeShellOverlays();
      this.offline.dataset.preview = forcePreview && navigator.onLine ? 'true' : 'false';
      global.ProductUIV5?.setShellPage?.('offline');
      this.offline.classList.remove('hidden');
      this._renderNetworkState();
      setTimeout(() => this.offline.querySelector('[data-offline-action="retry"]')?.focus(), 40);
    }

    closeOffline() {
      this.offline.classList.add('hidden');
      global.ProductUIV5?.setShellPage?.('home');
      this._lastFocused?.focus?.();
    }

    _toggleFocus() {
      if (this._focusRunning) this._pauseFocus('已暂停');
      else this._startFocus();
    }

    _startFocus() {
      this._focusRunning = true;
      this._focusStartedAt = Date.now();
      const button = this.focus.querySelector('[data-focus-action="toggle"]');
      button.innerHTML = '<i class="fas fa-pause"></i><span>暂停</span>';
      this.home.querySelector('#v5-focus-status').textContent = '专注中';
      clearInterval(this._focusTimer);
      this._focusTimer = setInterval(() => {
        if (!this._focusRunning) return;
        this._focusRemaining = Math.max(0, this._focusRemaining - 1);
        this._renderFocusClock();
        if (this._focusRemaining === 0) this._finishFocus();
      }, 1000);
    }

    _pauseFocus(label) {
      this._focusRunning = false;
      clearInterval(this._focusTimer);
      const button = this.focus?.querySelector('[data-focus-action="toggle"]');
      if (button) button.innerHTML = '<i class="fas fa-play"></i><span>继续</span>';
      const status = this.home?.querySelector('#v5-focus-status');
      if (status) status.textContent = label;
    }

    async _finishFocus() {
      this._pauseFocus('本轮完成');
      const elapsedMinutes = Math.max(1, Math.round((25 * 60 - this._focusRemaining) / 60));
      const { v5FocusMinutes = 0 } = await chrome.storage.local.get('v5FocusMinutes');
      await chrome.storage.local.set({ v5FocusMinutes: Number(v5FocusMinutes) + elapsedMinutes });
      this._focusRemaining = 25 * 60;
      this._renderFocusClock();
      await this.refresh();
      this.closeFocus('本轮完成');
    }

    _renderFocusClock() {
      const minutes = Math.floor(this._focusRemaining / 60);
      const seconds = this._focusRemaining % 60;
      this.focus.querySelector('#v5-focus-clock').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      const progress = Math.round((1 - this._focusRemaining / (25 * 60)) * 100);
      this.focus.querySelector('#v5-focus-track-fill').style.width = `${progress}%`;
      this.home.querySelector('#v5-focus-progress').textContent = `${progress}%`;
      this.home.querySelector('#v5-focus-ring').style.setProperty('--progress', progress);
    }

    _closeShellOverlays() {
      this.personalize?.classList.add('hidden');
      this.offline?.classList.add('hidden');
      if (!this.focus?.classList.contains('hidden')) {
        this._pauseFocus('已暂停');
        this.focus.classList.add('hidden');
        document.body.classList.remove('v5-focus-open');
      }
      global.todayOverview?.panel?.classList?.add('hidden');
    }

    async _loadPreferences() {
      const { v5ShellPreferences } = await chrome.storage.local.get('v5ShellPreferences');
      if (v5ShellPreferences && typeof v5ShellPreferences === 'object') {
        this._preferences = {
          ...this._preferences,
          ...v5ShellPreferences,
          cards: { ...this._preferences.cards, ...(v5ShellPreferences.cards || {}) },
        };
      }
      this._applyPreferences();
      this._writePreferenceControls();
    }

    _readPreferenceControls() {
      const value = key => Number(this.personalize.querySelector(`[data-pref="${key}"]`)?.value);
      this._preferences = {
        density: value('density'),
        scale: value('scale') / 100,
        dim: value('dim'),
        cards: Object.fromEntries([...this.personalize.querySelectorAll('[data-card-pref]')].map(input => [input.dataset.cardPref, input.checked])),
      };
      this._applyPreferences();
      this._writePreferenceLabels();
    }

    _writePreferenceControls() {
      const set = (key, value) => {
        const input = this.personalize?.querySelector(`[data-pref="${key}"]`);
        if (input) input.value = String(value);
      };
      set('density', this._preferences.density);
      set('scale', Math.round(this._preferences.scale * 100));
      set('dim', this._preferences.dim);
      this.personalize?.querySelectorAll('[data-card-pref]').forEach(input => {
        input.checked = this._preferences.cards[input.dataset.cardPref] !== false;
      });
      this._writePreferenceLabels();
      this._applyPreferences();
    }

    _writePreferenceLabels() {
      const densityNames = ['宽松', '标准', '紧凑'];
      const values = {
        scale: `${Math.round(this._preferences.scale * 100)}%`,
        density: densityNames[this._preferences.density] || '标准',
        dim: `${this._preferences.dim}%`,
      };
      Object.entries(values).forEach(([key, value]) => {
        const output = this.personalize?.querySelector(`[data-value-for="${key}"]`);
        if (output) output.textContent = value;
      });
    }

    _applyPreferences() {
      const densityGap = [17, 12, 8][this._preferences.density] || 12;
      document.documentElement.style.setProperty('--v5-home-scale', String(this._preferences.scale));
      document.documentElement.style.setProperty('--v5-home-gap', `${densityGap}px`);
      document.documentElement.style.setProperty('--v5-background-dim', String(Math.max(0, Math.min(55, this._preferences.dim)) / 100));
      document.body.classList.toggle('v5-home-customized', this._preferences.dim > 0);
      const map = { focus: '.v5-focus-card', agenda: '.v5-agenda-card', music: '.v5-home-player' };
      Object.entries(map).forEach(([key, selector]) => {
        this.home?.querySelector(selector)?.classList.toggle('v5-card-disabled', this._preferences.cards[key] === false);
        this.personalize?.querySelector(`[data-preview-card="${key}"]`)?.classList.toggle('v5-card-disabled', this._preferences.cards[key] === false);
      });
      this.personalize?.querySelector('.v5-preview-canvas')?.style.setProperty('--preview-scale', String(this._preferences.scale));
      this.personalize?.querySelector('.v5-preview-canvas')?.style.setProperty('--preview-gap', `${Math.max(5, densityGap / 2)}px`);
    }

    async _savePreferences() {
      this._readPreferenceControls();
      await chrome.storage.local.set({ v5ShellPreferences: this._preferences });
      const button = this.personalize.querySelector('[data-personalize-action="save"]');
      const original = button.innerHTML;
      button.innerHTML = '<i class="fas fa-check-circle"></i>已保存';
      setTimeout(() => { button.innerHTML = original; }, 1200);
    }

    _resetPreferences() {
      this._preferences = { density: 1, scale: 1, dim: 24, cards: { focus: true, agenda: true, music: true } };
      this.personalize.querySelectorAll('[data-layout-template]').forEach(button => button.classList.toggle('active', button.dataset.layoutTemplate === 'balanced'));
      this._writePreferenceControls();
    }

    _applyTemplate(template) {
      const presets = {
        balanced: { density: 1, scale: 1, cards: { focus: true, agenda: true, music: true } },
        focus: { density: 0, scale: 1.1, cards: { focus: true, agenda: false, music: true } },
        compact: { density: 2, scale: .9, cards: { focus: true, agenda: true, music: true } },
      };
      this._preferences = { ...this._preferences, ...presets[template], cards: { ...presets[template].cards } };
      this.personalize.querySelectorAll('[data-layout-template]').forEach(button => button.classList.toggle('active', button.dataset.layoutTemplate === template));
      this._writePreferenceControls();
    }

    async _renderNetworkState() {
      const online = navigator.onLine;
      const preview = this.offline?.dataset.preview === 'true';
      const entry = this.toolbar?.querySelector('#v5-network-entry');
      if (entry) {
        entry.classList.toggle('warning', !online);
        entry.querySelector('i').className = online ? 'fas fa-wifi' : 'fas fa-wifi-slash';
        entry.querySelector('span').textContent = online ? '网络正常' : '离线';
      }
      if (!this.offline) return;
      const badge = this.offline.querySelector('#v5-network-badge');
      badge.classList.toggle('online', online);
      badge.querySelector('i').className = online ? 'fas fa-wifi' : 'fas fa-wifi-slash';
      badge.querySelector('span').textContent = online ? '当前网络正常' : '当前处于离线状态';
      this.offline.querySelector('#v5-offline-title').textContent = online ? (preview ? '离线状态预览' : '网络连接已恢复') : '网络连接已断开';
      this.offline.querySelector('#v5-offline-description').textContent = online
        ? '这里展示断网时的恢复路径。本地业务无需网络即可继续使用，联网后自动恢复外部服务。'
        : '本地任务、计划、工作日志和已缓存内容仍然可用；联网后会自动恢复同步。';
      this.offline.querySelector('#v5-network-checked').textContent = `最近检测 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      await this._renderOfflineData();
    }

    async _renderOfflineData() {
      const data = await chrome.storage.local.get(['memos', 'schedulePlans', 'worklogEntries']);
      const rows = [
        ['fa-check-square', '本地任务', `${(data.memos || []).filter(item => !item.deleted).length} 条记录`],
        ['fa-calendar-check', '计划安排', `${(data.schedulePlans || []).length} 项计划`],
        ['fa-clipboard-list', '工作日志', `${(data.worklogEntries || []).length} 条日志`],
      ];
      const panel = this.offline.querySelector('.v5-sync-panel');
      panel.querySelector('#v5-sync-count').textContent = `${rows.length} 个模块就绪`;
      panel.querySelectorAll('.v5-sync-row').forEach((row, index) => {
        const item = rows[index];
        row.querySelector('i').className = `fas ${item[0]}`;
        row.querySelector('strong').textContent = item[1];
        row.querySelector('small').textContent = item[2];
        row.querySelector(':scope > span').textContent = navigator.onLine ? '本地已保存' : '离线可用';
      });
    }

    _retryNetwork() {
      const button = this.offline.querySelector('[data-offline-action="retry"]');
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>检测中';
      setTimeout(async () => {
        await this._renderNetworkState();
        button.disabled = false;
        button.innerHTML = navigator.onLine ? '<i class="fas fa-check"></i>网络正常' : '<i class="fas fa-sync-alt"></i>再次检测';
      }, 450);
    }

    _today() {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    _esc(value) {
      return global.ProductUIV5?.escapeHtml?.(value) ?? String(value || '');
    }
  }

  const shell = new ProductShellV5();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => shell.init(), { once: true });
  else void shell.init();
  global.productShellV5 = shell;
})(window);
