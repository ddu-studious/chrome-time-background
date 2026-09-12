(function () {
  'use strict';

  class TodayOverview {
    constructor() {
      this.panel = null;
      this.trigger = null;
      this._refreshTimer = null;
    }

    async init() {
      if (document.getElementById('today-overview')) return;
      this._build();
      this._bind();
      window.ProductUIV5?.subscribe?.((state, reason) => {
        if (reason !== 'player') return;
        const player = state.player;
        const signature = JSON.stringify([player.title, player.artist, player.cover, player.isPlaying]);
        if (signature === this._musicSignature) return;
        this._musicSignature = signature;
        void this.refresh();
      });
      await this.refresh();
      this._refreshTimer = setInterval(() => this.refresh(), 60 * 1000);
      chrome.storage?.onChanged?.addListener?.((changes, area) => {
        if (area !== 'local') return;
        const keys = ['schedulePlans', 'memos', 'worklogEntries', 'bookmarkCache', 'lastMusicState'];
        if (keys.some(key => changes[key])) void this.refresh();
      });
    }

    _build() {
      this.panel = document.createElement('section');
      this.panel.id = 'today-overview';
      this.panel.className = 'today-overview v5-shell-page hidden';
      this.panel.setAttribute('aria-label', '今日概览');
      this.panel.innerHTML = `
        <header class="to-header">
          <div><span class="to-eyebrow" id="to-date-label">今天 · ASIA/SHANGHAI</span><h2>今日概览</h2><small id="to-summary-meta">正在汇总今天的数据</small></div>
          <div class="to-header-actions">
            <button type="button" class="to-start-next" data-action="start-next"><i class="fas fa-play"></i><span>开始下一项</span></button>
            <button type="button" data-action="collapse" aria-label="收起今日概览" title="收起"><i class="fas fa-chevron-up"></i></button>
            <button type="button" data-action="close" aria-label="关闭今日概览" title="关闭"><i class="fas fa-times"></i></button>
          </div>
        </header>
        <div class="to-summary" id="today-overview-summary"></div>
        <div class="to-body" id="today-overview-body" aria-live="polite"></div>
        <footer class="to-footer"><span><i class="fas fa-shield-alt"></i> 数据仅来自本地业务模块</span><button type="button" data-action="close">返回首页</button></footer>`;

      this.trigger = document.createElement('button');
      this.trigger.type = 'button';
      this.trigger.className = 'today-overview-trigger';
      this.trigger.innerHTML = '<i class="fas fa-sun"></i><span>今日概览</span><i class="fas fa-chevron-left"></i>';
      this.trigger.setAttribute('aria-label', '打开今日概览');
      document.body.appendChild(this.panel);
      document.body.appendChild(this.trigger);
    }

    _bind() {
      this.panel.querySelector('[data-action="collapse"]')?.addEventListener('click', (event) => {
        const collapsed = this.panel.classList.toggle('collapsed');
        event.currentTarget.querySelector('i').className = collapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        event.currentTarget.title = collapsed ? '展开' : '收起';
      });
      this.panel.querySelector('[data-action="close"]')?.addEventListener('click', () => {
        this.close();
      });
      this.trigger.addEventListener('click', () => {
        this.open();
      });
      this.panel.querySelector('[data-action="start-next"]')?.addEventListener('click', () => this._startNext());
      this.panel.querySelector('.to-footer [data-action="close"]')?.addEventListener('click', () => this.close());
      this.panel.addEventListener('click', (event) => {
        const opener = event.target.closest('[data-open]');
        if (!opener) return;
        this._open(opener.dataset.open, opener.dataset.actionType || 'open');
      });
    }

    async refresh() {
      const data = await chrome.storage.local.get([
        'schedulePlans', 'memos', 'worklogEntries', 'bookmarkCache', 'lastMusicState'
      ]);
      const today = this._today();
      const dateLabel = this.panel?.querySelector('#to-date-label');
      if (dateLabel) {
        const now = new Date();
        dateLabel.textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ASIA/SHANGHAI`;
      }
      const plans = (data.schedulePlans || []).filter(item => item.date === today);
      const activeTasks = (data.memos || []).filter(item => !item.completed && !item.deleted).slice(0, 4);
      const logs = (data.worklogEntries || []).filter(item => item.date === today);
      const minutes = logs.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
      const workProgress = Math.min(100, Math.round(minutes / 480 * 100));
      const bookmarks = data.bookmarkCache?.items || [];
      const reading = bookmarks.filter(item => item.status !== 'archived').slice(0, 3);
      const song = window.ProductUIV5?.getDisplayPlayer?.(data.lastMusicState) || null;

      const completedPlans = plans.filter(item => item.completed).length;
      const completedTasks = (data.memos || []).filter(item => item.completed && !item.deleted).length;
      const summary = this.panel?.querySelector('#today-overview-summary');
      if (summary) summary.innerHTML = `
        <div><i class="fas fa-calendar-check"></i><span>今日计划</span><strong>${plans.length}</strong><small>${completedPlans} 项完成</small></div>
        <div><i class="fas fa-check-circle"></i><span>待办任务</span><strong>${activeTasks.length}</strong><small>${completedTasks} 项完成</small></div>
        <div><i class="fas fa-clock"></i><span>工作投入</span><strong>${Math.floor(minutes / 60)}h ${minutes % 60}m</strong><small>${workProgress}% 目标</small></div>
        <div><i class="fas fa-exclamation-triangle"></i><span>需要关注</span><strong>${activeTasks.filter(item => item.priority === 'high' || item.priority === 'urgent').length}</strong><small>高优先级任务</small></div>`;
      const summaryMeta = this.panel?.querySelector('#to-summary-meta');
      if (summaryMeta) summaryMeta.textContent = `${plans.length + activeTasks.length} 个待处理事项 · ${minutes} 分钟已记录`;

      const body = this.panel?.querySelector('#today-overview-body');
      if (!body) return;
      body.innerHTML = `
        <article class="to-card to-plan-card">
          <div class="to-card-head"><strong><i class="fas fa-calendar-check"></i> 今日计划</strong><button data-open="schedule" data-action-type="create">+ 添加计划</button></div>
          <div class="to-list">${this._plans(plans)}</div>
        </article>
        <article class="to-card to-task-card">
          <div class="to-card-head"><strong><i class="fas fa-check-circle"></i> 待办</strong><button data-open="memo" data-action-type="create">+ 添加待办</button></div>
          <div class="to-list">${this._tasks(activeTasks)}</div>
        </article>
        <article class="to-card to-worklog-card" data-open="worklog">
          <div class="to-card-head"><strong><i class="fas fa-clipboard-list"></i> 工作日志</strong><span>${minutes} / 480 分钟</span></div>
          <div class="to-progress"><span style="width:${workProgress}%"></span></div>
          <div class="to-card-summary"><strong>${workProgress}%</strong><span>${logs.length ? `已记录 ${logs.length} 个时间段` : '今天还没有记录'}</span></div>
        </article>
        <article class="to-card to-reading-card" data-open="reading">
          <div class="to-card-head"><strong><i class="fas fa-book-reader"></i> 稍后阅读</strong><span>${reading.length}</span></div>
          <div class="to-list">${this._reading(reading)}</div>
        </article>
        <article class="to-card to-music-card" data-open="music">
          <div class="to-music-cover">${song?.cover ? `<img src="${this._esc(song.cover)}" alt="">` : '<i class="fas fa-music"></i>'}</div>
          <div class="to-music-copy"><span>${song?.isPlaying ? '正在播放' : song?.title ? '最近播放' : '音乐'}</span><strong>${this._esc(song?.title || '打开网易云音乐')}</strong><small>${this._esc(song?.artist || '选择一首歌开始今天')}</small></div>
          <i class="fas fa-chevron-right"></i>
        </article>`;
    }

    open() {
      this.panel?.classList.remove('hidden', 'collapsed');
      this.trigger?.classList.remove('visible');
      window.ProductUIV5?.setShellPage?.('today');
      void this.refresh();
      setTimeout(() => this.panel?.querySelector('[data-action="start-next"]')?.focus(), 60);
    }

    close() {
      this.panel?.classList.add('hidden');
      this.trigger?.classList.add('visible');
      window.ProductUIV5?.setShellPage?.('home');
      document.querySelector('[data-shell-open="today"]')?.focus?.();
    }

    _startNext() {
      const firstPlan = this.panel?.querySelector('.to-plan-card .to-row');
      if (firstPlan) this._open('schedule', 'open');
      else this._open('memo', 'create');
    }

    _plans(items) {
      if (!items.length) return '<div class="to-empty">暂无计划，给今天安排一个明确时间点</div>';
      return items.slice(0, 3).map(item => `<div class="to-row"><span class="to-time">${this._esc(item.startTime || '--:--')}</span><span>${this._esc(item.name || '未命名计划')}</span><i class="fas ${item.completed ? 'fa-check-circle' : 'fa-circle'}"></i></div>`).join('');
    }

    _tasks(items) {
      if (!items.length) return '<div class="to-empty">当前没有未完成任务</div>';
      return items.map(item => `<div class="to-row"><i class="far fa-square"></i><span>${this._esc(item.title || item.text || '未命名任务')}</span></div>`).join('');
    }

    _reading(items) {
      if (!items.length) return '<div class="to-empty">配置书签后显示待读内容</div>';
      return items.map(item => `<div class="to-row"><i class="far fa-bookmark"></i><span>${this._esc(item.title || item.url || '未命名书签')}</span></div>`).join('');
    }

    _open(app, actionType) {
      if (app === 'memo' && actionType === 'create') {
        const sidebar = document.getElementById('task-sidebar');
        if (!sidebar?.classList.contains('open')) window.memoManager?.toggle?.();
        setTimeout(() => window.memoManager?.showSidebarForm?.(), 100);
        return;
      }
      const ids = {
        schedule: 'schedule-dock-btn', worklog: 'worklog-dock-btn', reading: 'reading-dock-btn', music: 'music-dock-btn'
      };
      document.getElementById(ids[app])?.click();
      if (app === 'schedule' && actionType === 'create') {
        setTimeout(() => document.querySelector('.sch-add-plan-btn')?.click(), 120);
      }
    }

    _today() {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    _esc(value) {
      return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
  }

  const overview = new TodayOverview();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => overview.init(), { once: true });
  } else {
    void overview.init();
  }
  window.todayOverview = overview;
})();
