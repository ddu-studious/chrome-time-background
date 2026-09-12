(function () {
  'use strict';

  const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
  const SOUND_LABELS = { chime: '清澈钟声', rise: '渐升晨光', urgent: '紧迫提醒', water: '山涧水滴' };

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  }

  function send(action, payload = {}) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action, ...payload }, response => {
          resolve(response || { ok: false, error: chrome.runtime.lastError?.message || '后台没有响应' });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || '扩展 API 不可用' });
      }
    });
  }

  class AlarmCenter {
    constructor() {
      this.root = null;
      this.ringRoot = null;
      this.state = { alarms: [], runtime: {}, nextFireAt: null, notificationPermission: 'unknown' };
      this.editingId = null;
      this.initialized = false;
      this.returnFocus = null;
      this.ringReturnFocus = null;
      this.inerted = [];
      this.ringInerted = [];
    }

    async init() {
      if (this.initialized) return;
      this.initialized = true;
      this._createShell();
      window.mountSmartAlarm?.(this);
      this._bindEvents();
      await this.refresh();

      if (chrome.runtime?.onMessage?.addListener) {
        chrome.runtime.onMessage.addListener(message => {
          if (message.action === 'user_alarm_open_center') {
            this.open('notification');
            return;
          }
          if (message.action !== 'user_alarm_state_changed') return;
          if (message.session) this.showRinging(message.session);
          else this.hideRinging();
          void this.refresh();
        });
      }
    }

    _createShell() {
      this.root = document.createElement('div');
      this.root.className = 'alarm-center-overlay';
      this.root.id = 'alarm-center-overlay';
      this.root.setAttribute('aria-hidden', 'true');
      this.root.inert = true;
      this.root.innerHTML = `
        <div class="alarm-center-backdrop" data-alarm-close></div>
        <section class="alarm-center" role="dialog" aria-modal="true" aria-labelledby="alarm-center-title" tabindex="-1">
          <header class="alarm-center-header">
            <div>
              <span class="alarm-kicker">TIME KEEPER</span>
              <h2 id="alarm-center-title"><i class="fas fa-bell"></i> 闹钟</h2>
              <p>说一句，记住接下来要做的事</p>
            </div>
            <button class="alarm-icon-button" type="button" data-alarm-close aria-label="关闭闹钟中心"><i class="fas fa-times"></i></button>
          </header>

          <div class="alarm-next-card">
            <div>
              <span>下一次提醒</span>
              <strong id="alarm-next-time">暂无已开启闹钟</strong>
              <small id="alarm-next-countdown">创建一个闹钟，让时间主动来找你</small>
            </div>
            <button class="alarm-secondary-button" type="button" id="alarm-new-button"><i class="fas fa-plus"></i> 手动设置</button>
          </div>

          <div class="alarm-quick-row" aria-label="快速创建倒计时">
            <span>快速开始</span>
            <button type="button" data-alarm-quick="10">10 分钟</button>
            <button type="button" data-alarm-quick="25">25 分钟</button>
            <button type="button" data-alarm-quick="60">1 小时</button>
            <button type="button" data-alarm-quick="next-hour">下个整点</button>
          </div>

          <div class="alarm-health" id="alarm-health">
            <button type="button" class="alarm-text-button" id="alarm-desktop-test">测试桌面提醒</button>
            <span class="alarm-health-item" data-health="sound"><i class="fas fa-volume-high"></i> 离线声音就绪</span>
            <span class="alarm-health-item" data-health="notification"><i class="fas fa-bell"></i> 通知检测中</span>
            <span class="alarm-health-item warning"><i class="fas fa-moon"></i> 电脑睡眠时无法准点唤醒</span>
          </div>

          <div class="alarm-workspace">
            <section class="alarm-list-section">
              <div class="alarm-section-heading">
                <div><h3>我的闹钟</h3><small id="alarm-list-summary">0 个已开启</small></div>
                <button type="button" class="alarm-text-button" id="alarm-refresh-button"><i class="fas fa-rotate"></i> 检查提醒</button>
              </div>
              <div class="alarm-list" id="alarm-list"></div>
            </section>

            <form class="alarm-editor" id="alarm-editor" hidden>
              <div class="alarm-section-heading">
                <div><span class="alarm-kicker">ALARM SETUP</span><h3 id="alarm-editor-title">新建闹钟</h3></div>
                <button class="alarm-icon-button" type="button" id="alarm-editor-close" aria-label="收起编辑器"><i class="fas fa-times"></i></button>
              </div>
              <label class="alarm-field alarm-field-wide"><span>提醒内容</span><input name="label" maxlength="80" required placeholder="例如：产品评审开始了"></label>
              <div class="alarm-field-grid">
                <label class="alarm-field"><span>时间</span><input name="time" type="time" required></label>
                <label class="alarm-field" data-once-field><span>日期</span><input name="date" type="date" required></label>
              </div>
              <label class="alarm-field"><span>重复</span>
                <select name="repeat">
                  <option value="once">仅一次</option><option value="daily">每天</option>
                  <option value="weekdays">周一至周五</option><option value="custom">自定义星期</option>
                </select>
              </label>
              <div class="alarm-day-picker" data-custom-days hidden aria-label="选择重复星期">
                ${DAY_LABELS.map((label, day) => `<label><input type="checkbox" name="days" value="${day}"><span>${label}</span></label>`).join('')}
              </div>
              <div class="alarm-field-grid">
                <label class="alarm-field"><span>声音</span><select name="soundId">${Object.entries(SOUND_LABELS).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label>
                <label class="alarm-field"><span>提醒强度</span><select name="intensity"><option value="standard">标准</option><option value="important">重要</option></select></label>
              </div>
              <label class="alarm-range-field"><span>音量 <output data-volume-output>80%</output></span><input name="volume" type="range" min="5" max="100" value="80"></label>
              <label class="alarm-range-field"><span>渐强时间 <output data-fade-output>12 秒</output></span><input name="fadeSeconds" type="range" min="0" max="60" value="12"></label>
              <div class="alarm-field-grid">
                <label class="alarm-field"><span>贪睡时长</span><select name="snoozeMinutes"><option value="5">5 分钟</option><option value="10" selected>10 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option></select></label>
                <label class="alarm-field"><span>最多贪睡</span><select name="snoozeLimit"><option value="0">不允许</option><option value="1">1 次</option><option value="3" selected>3 次</option><option value="5">5 次</option></select></label>
              </div>
              <label class="alarm-checkbox"><input type="checkbox" name="openWindow"><span><b>重要提醒时弹出小窗</b><small>仅在“重要”强度下生效，会主动聚焦 Chrome</small></span></label>
              <div class="alarm-editor-error" id="alarm-editor-error" role="alert"></div>
              <div class="alarm-editor-actions">
                <button type="button" class="alarm-secondary-button" id="alarm-test-button"><i class="fas fa-volume-high"></i> 试听</button>
                <button type="submit" class="alarm-primary-button"><i class="fas fa-check"></i> 保存闹钟</button>
              </div>
            </form>
          </div>
        </section>`;
      document.body.appendChild(this.root);

      this.ringRoot = document.createElement('div');
      this.ringRoot.className = 'alarm-ringing-overlay';
      this.ringRoot.id = 'alarm-ringing-overlay';
      this.ringRoot.setAttribute('aria-hidden', 'true');
      this.ringRoot.inert = true;
      this.ringRoot.innerHTML = `
        <div class="alarm-ringing-glow" aria-hidden="true"></div>
        <section class="alarm-ringing-card" role="alertdialog" aria-modal="true" aria-labelledby="alarm-ringing-label">
          <span class="alarm-ringing-kicker">TIME IS UP</span>
          <time id="alarm-ringing-time"></time>
          <h2 id="alarm-ringing-label">时间到了</h2>
          <p id="alarm-ringing-meta">闹钟正在响铃</p>
          <div class="alarm-ringing-actions">
            <button type="button" class="alarm-snooze-button" data-ring-action="snooze"><i class="fas fa-clock"></i> 贪睡 <span id="alarm-ring-snooze-minutes">10</span> 分钟</button>
            <button type="button" class="alarm-stop-button" data-ring-action="dismiss"><i class="fas fa-stop"></i> 停止</button>
          </div>
        </section>`;
      document.body.appendChild(this.ringRoot);
    }

    _bindEvents() {
      this.root.querySelector('#alarm-desktop-test').addEventListener('click', async event => {
        event.target.disabled = true;
        const result = await send('user_alarm_desktop_test');
        this._toast(result.ok ? '桌面卡片已打开，可切换到其他应用查看' : '桌面组件未连接：请先安装组件，再重新加载扩展');
        event.target.disabled = false;
      });
      this.root.querySelectorAll('[data-alarm-close]').forEach(button => button.addEventListener('click', () => this.close()));
      this.root.querySelector('#alarm-new-button').addEventListener('click', () => this.openEditor());
      this.root.querySelector('#alarm-editor-close').addEventListener('click', () => this.closeEditor());
      this.root.querySelector('#alarm-refresh-button').addEventListener('click', async () => {
        await send('user_alarm_reconcile');
        await this.refresh();
        this._toast('闹钟调度已对账');
      });
      this.root.querySelectorAll('[data-alarm-quick]').forEach(button => button.addEventListener('click', () => {
        void this.createQuickAlarm(button.dataset.alarmQuick);
      }));

      const form = this.root.querySelector('#alarm-editor');
      form.addEventListener('submit', event => { event.preventDefault(); void this.saveEditor(); });
      form.elements.repeat.addEventListener('change', () => this._syncEditorVisibility());
      form.elements.intensity.addEventListener('change', () => this._syncEditorVisibility());
      form.elements.volume.addEventListener('input', () => {
        form.querySelector('[data-volume-output]').textContent = `${form.elements.volume.value}%`;
      });
      form.elements.fadeSeconds.addEventListener('input', () => {
        form.querySelector('[data-fade-output]').textContent = `${form.elements.fadeSeconds.value} 秒`;
      });
      form.querySelector('#alarm-test-button').addEventListener('click', () => void this.testSound());

      this.root.querySelector('#alarm-list').addEventListener('click', event => {
        const action = event.target.closest('[data-alarm-action]');
        if (!action) return;
        const alarmId = action.closest('[data-alarm-id]')?.dataset.alarmId;
        if (action.dataset.alarmAction === 'edit') this.openEditor(alarmId);
        if (action.dataset.alarmAction === 'delete') void this.deleteAlarm(alarmId);
      });
      this.root.querySelector('#alarm-list').addEventListener('change', event => {
        const toggle = event.target.closest('[data-alarm-toggle]');
        if (toggle) void this.toggleAlarm(toggle.closest('[data-alarm-id]')?.dataset.alarmId, toggle.checked);
      });

      this.ringRoot.querySelector('[data-ring-action="dismiss"]').addEventListener('click', () => void this.dismiss());
      this.ringRoot.querySelector('[data-ring-action="snooze"]').addEventListener('click', () => void this.snooze());
      document.addEventListener('dock:dismiss-all', () => this.close());
      document.addEventListener('keydown', event => {
        if (event.key === 'Tab' && this.ringRoot.classList.contains('open')) {
          this._trapFocus(this.ringRoot, event);
          return;
        }
        if (event.key === 'Tab' && this.root.classList.contains('open')) {
          this._trapFocus(this.root.querySelector('.alarm-center'), event);
          return;
        }
        if (event.key === 'Escape' && this.root.classList.contains('open') && !this.ringRoot.classList.contains('open')) this.close();
      });
    }

    async refresh() {
      const response = await send('user_alarm_list');
      if (response.ok) {
        this.state = response;
        if (response.runtime?.activeSession) this.showRinging(response.runtime.activeSession);
      } else {
        this.state = { alarms: [], runtime: {}, nextFireAt: null, notificationPermission: 'unknown' };
      }
      this._render();
      return response;
    }

    _render() {
      this._renderNext();
      this._renderHealth();
      this._renderList();
    }

    _renderNext() {
      const time = this.root.querySelector('#alarm-next-time');
      const countdown = this.root.querySelector('#alarm-next-countdown');
      if (!this.state.nextFireAt) {
        time.textContent = '暂无已开启闹钟';
        countdown.textContent = '创建一个闹钟，让时间主动来找你';
        return;
      }
      const next = new Date(this.state.nextFireAt);
      time.textContent = next.toLocaleString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
      const minutes = Math.max(0, Math.round((this.state.nextFireAt - Date.now()) / 60000));
      countdown.textContent = minutes < 60 ? `约 ${minutes} 分钟后` : `约 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟后`;
    }

    _renderHealth() {
      const item = this.root.querySelector('[data-health="notification"]');
      const granted = this.state.notificationPermission === 'granted';
      item.classList.toggle('warning', !granted);
      if (this.state.notificationPermission === 'unknown') {
        item.innerHTML = '<i class="fas fa-circle-info"></i> 扩展环境中检测系统通知';
      } else {
        item.innerHTML = granted
          ? '<i class="fas fa-circle-check"></i> 系统通知已开启'
          : '<i class="fas fa-triangle-exclamation"></i> 系统通知未开启';
      }
    }

    _repeatLabel(alarm) {
      if (alarm.repeat === 'once') return alarm.date ? new Date(`${alarm.date}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '仅一次';
      if (alarm.repeat === 'daily') return '每天';
      if (alarm.repeat === 'weekdays') return '周一至周五';
      return (alarm.days || []).map(day => `周${DAY_LABELS[day]}`).join(' · ') || '自定义';
    }

    _renderList() {
      const list = this.root.querySelector('#alarm-list');
      const alarms = this.state.alarms || [];
      const enabled = alarms.filter(alarm => alarm.enabled).length;
      this.root.querySelector('#alarm-list-summary').textContent = `${enabled} 个已开启 · 共 ${alarms.length} 个`;
      if (!alarms.length) {
        list.innerHTML = '<div class="alarm-empty"><i class="far fa-clock"></i><strong>还没有闹钟</strong><span>可以从上面的快捷时间开始</span></div>';
        return;
      }
      const renderAlarm = alarm => `
        <article class="alarm-item${alarm.enabled ? '' : ' disabled'}" data-alarm-id="${escapeHtml(alarm.id)}">
          <label class="alarm-switch" aria-label="${alarm.enabled ? '关闭' : '开启'}${escapeHtml(alarm.label)}">
            <input type="checkbox" data-alarm-toggle ${alarm.enabled ? 'checked' : ''}><span></span>
          </label>
          <div class="alarm-item-time">${escapeHtml(alarm.time)}</div>
          <div class="alarm-item-copy">
            <strong>${escapeHtml(alarm.label)}</strong>
            <span>${escapeHtml(this._repeatLabel(alarm))} · ${escapeHtml(SOUND_LABELS[alarm.soundId] || '清澈钟声')} · ${alarm.intensity === 'important' ? '重要' : '标准'}</span>
          </div>
          <div class="alarm-item-actions">
            <button type="button" data-alarm-action="edit" aria-label="编辑${escapeHtml(alarm.label)}"><i class="fas fa-pen"></i></button>
            <button type="button" data-alarm-action="delete" aria-label="删除${escapeHtml(alarm.label)}"><i class="fas fa-trash"></i></button>
          </div>
        </article>`;
      const archived = alarms.filter(alarm => !alarm.enabled);
      const expanded = list.querySelector('details')?.open;
      list.innerHTML = alarms.filter(alarm => alarm.enabled).map(renderAlarm).join('') +
        (archived.length ? `<details class="alarm-archived" ${expanded ? 'open' : ''}><summary>已关闭或结束（${archived.length}）</summary><div class="alarm-list">${archived.map(renderAlarm).join('')}</div></details>` : '');
    }

    open(source = 'dock') {
      if (this.root.classList.contains('open')) {
        void this.refresh();
        return;
      }
      this.returnFocus = document.activeElement;
      this.inerted = [...document.body.children].filter(element => element !== this.root && element !== this.ringRoot && !element.inert);
      this.inerted.forEach(element => { element.inert = true; });
      this.root.setAttribute('aria-hidden', 'false');
      this.root.inert = false;
      this.root.classList.add('open');
      this.root.querySelector('.alarm-center').focus({ preventScroll: true });
      window.ProductUIV5?.setBusinessPage?.('alarm', source);
      void this.refresh();
    }

    close() {
      if (!this.root.classList.contains('open')) return;
      this.closeEditor();
      const activeElement = document.activeElement;
      if (activeElement && this.root.contains(activeElement)) activeElement.blur();
      this.root.inert = true;
      this.root.classList.remove('open');
      this.inerted.forEach(element => { element.inert = false; });
      this.inerted = [];
      this.returnFocus?.focus?.({ preventScroll: true });
      this.root.setAttribute('aria-hidden', 'true');
      this.returnFocus = null;
    }

    toggle() {
      if (this.root.classList.contains('open')) this.close();
      else this.open();
    }

    _defaultFuture(minutes = 10) {
      const date = new Date(Date.now() + minutes * 60000);
      date.setSeconds(0, 0);
      return {
        date: AlarmCore.localDateKey(date),
        time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      };
    }

    openEditor(alarmId = null) {
      const form = this.root.querySelector('#alarm-editor');
      const alarm = alarmId ? this.state.alarms.find(item => item.id === alarmId) : null;
      const future = this._defaultFuture();
      this.editingId = alarm?.id || null;
      form.hidden = false;
      form.reset();
      form.elements.label.value = alarm?.label || '';
      form.elements.time.value = alarm?.time || future.time;
      form.elements.date.value = alarm?.date || future.date;
      form.elements.repeat.value = alarm?.repeat || 'once';
      form.elements.soundId.value = alarm?.soundId || 'chime';
      form.elements.intensity.value = alarm?.intensity || 'standard';
      form.elements.volume.value = Math.round((alarm?.volume ?? .8) * 100);
      form.elements.fadeSeconds.value = alarm?.fadeSeconds ?? 12;
      form.elements.snoozeMinutes.value = alarm?.snoozeMinutes ?? 10;
      form.elements.snoozeLimit.value = alarm?.snoozeLimit ?? 3;
      form.elements.openWindow.checked = alarm?.openWindow === true;
      [...form.elements.days].forEach(input => { input.checked = (alarm?.days || []).includes(Number(input.value)); });
      form.querySelector('#alarm-editor-title').textContent = alarm ? '编辑闹钟' : '新建闹钟';
      form.querySelector('#alarm-editor-error').textContent = '';
      form.querySelector('[data-volume-output]').textContent = `${form.elements.volume.value}%`;
      form.querySelector('[data-fade-output]').textContent = `${form.elements.fadeSeconds.value} 秒`;
      this._syncEditorVisibility();
      form.elements.label.focus({ preventScroll: true });
    }

    closeEditor() {
      const form = this.root?.querySelector('#alarm-editor');
      if (form) {
        if (form.contains(document.activeElement)) this.root.querySelector('#alarm-new-button')?.focus({ preventScroll: true });
        form.hidden = true;
      }
      this.editingId = null;
      void send('user_alarm_test_stop');
    }

    _syncEditorVisibility() {
      const form = this.root.querySelector('#alarm-editor');
      const once = form.elements.repeat.value === 'once';
      form.querySelector('[data-once-field]').hidden = !once;
      form.elements.date.required = once;
      form.querySelector('[data-custom-days]').hidden = form.elements.repeat.value !== 'custom';
      const important = form.elements.intensity.value === 'important';
      form.elements.openWindow.disabled = !important;
      if (!important) form.elements.openWindow.checked = false;
    }

    async saveEditor() {
      const form = this.root.querySelector('#alarm-editor');
      const repeat = form.elements.repeat.value;
      const date = form.elements.date.value;
      const time = form.elements.time.value;
      const fireAt = repeat === 'once' ? new Date(`${date}T${time}:00`).getTime() : null;
      const alarm = {
        id: this.editingId,
        label: form.elements.label.value.trim(),
        time,
        date: repeat === 'once' ? date : null,
        fireAt,
        repeat,
        days: [...form.elements.days].filter(input => input.checked).map(input => Number(input.value)),
        soundId: form.elements.soundId.value,
        intensity: form.elements.intensity.value,
        volume: Number(form.elements.volume.value) / 100,
        fadeSeconds: Number(form.elements.fadeSeconds.value),
        snoozeMinutes: Number(form.elements.snoozeMinutes.value),
        snoozeLimit: Number(form.elements.snoozeLimit.value),
        openWindow: form.elements.openWindow.checked,
        enabled: true
      };
      const response = await send('user_alarm_save', { alarm });
      if (!response.ok) {
        form.querySelector('#alarm-editor-error').textContent = response.error || '保存失败';
        return;
      }
      this.closeEditor();
      await this.refresh();
      this._toast('闹钟已保存');
    }

    async createQuickAlarm(value) {
      const now = new Date();
      let fireAt;
      let label;
      if (value === 'next-hour') {
        const next = new Date(now);
        next.setHours(next.getHours() + 1, 0, 0, 0);
        fireAt = next.getTime();
        label = '整点提醒';
      } else {
        const minutes = Number(value) || 10;
        fireAt = Date.now() + minutes * 60000;
        label = `${minutes} 分钟到了`;
      }
      const date = new Date(fireAt);
      const response = await send('user_alarm_save', {
        alarm: {
          label,
          time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
          date: AlarmCore.localDateKey(date),
          fireAt,
          repeat: 'once',
          soundId: 'chime',
          intensity: 'standard',
          volume: .8,
          fadeSeconds: 8,
          snoozeMinutes: 10,
          snoozeLimit: 3,
          enabled: true
        }
      });
      if (!response.ok) return this._toast(response.error || '创建失败', true);
      await this.refresh();
      this._toast(`${label}，已开始计时`);
    }

    async toggleAlarm(alarmId, enabled) {
      const response = await send('user_alarm_toggle', { alarmId, enabled });
      if (!response.ok) this._toast(response.error || '操作失败', true);
      await this.refresh();
    }

    async deleteAlarm(alarmId) {
      const alarm = this.state.alarms.find(item => item.id === alarmId);
      if (!alarm || !window.confirm(`删除闹钟“${alarm.label}”？`)) return;
      const response = await send('user_alarm_delete', { alarmId });
      if (!response.ok) this._toast(response.error || '删除失败', true);
      await this.refresh();
    }

    async testSound() {
      const form = this.root.querySelector('#alarm-editor');
      const button = form.querySelector('#alarm-test-button');
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-volume-high"></i> 试听中…';
      const response = await send('user_alarm_test', {
        soundId: form.elements.soundId.value,
        volume: Number(form.elements.volume.value) / 100
      });
      if (!response.ok) this._toast(response.error || '声音试听失败', true);
      setTimeout(() => {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-volume-high"></i> 试听';
      }, 6800);
    }

    showRinging(session) {
      if (!session?.occurrences?.length) return;
      const primary = session.occurrences[0];
      const labels = session.occurrences.map(item => item.label);
      this.ringRoot.dataset.sessionId = session.id;
      this.ringRoot.querySelector('#alarm-ringing-time').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      this.ringRoot.querySelector('#alarm-ringing-label').textContent = labels.length > 1 ? `${labels[0]}，另有 ${labels.length - 1} 个闹钟` : labels[0];
      const lateMinutes = Math.max(0, Math.round((Date.now() - session.scheduledAt) / 60000));
      this.ringRoot.querySelector('#alarm-ringing-meta').textContent = lateMinutes > 0 ? `原定时间已过 ${lateMinutes} 分钟` : '时间已经到了';
      this.ringRoot.querySelector('#alarm-ring-snooze-minutes').textContent = primary.snoozeMinutes || 10;
      const canSnooze = Number(primary.snoozeCount || 0) < Number(primary.snoozeLimit || 0);
      this.ringRoot.querySelector('[data-ring-action="snooze"]').hidden = !canSnooze;
      if (!this.ringRoot.classList.contains('open')) {
        this.ringReturnFocus = document.activeElement;
        this.ringInerted = [...document.body.children].filter(element => element !== this.ringRoot && !element.inert);
        this.ringInerted.forEach(element => { element.inert = true; });
      }
      this.ringRoot.setAttribute('aria-hidden', 'false');
      this.ringRoot.inert = false;
      this.ringRoot.classList.add('open');
      this.ringRoot.querySelector('[data-ring-action="dismiss"]').focus({ preventScroll: true });
    }

    hideRinging() {
      const activeElement = document.activeElement;
      if (activeElement && this.ringRoot.contains(activeElement)) activeElement.blur();
      this.ringRoot.inert = true;
      this.ringRoot.classList.remove('open');
      this.ringInerted.forEach(element => { element.inert = false; });
      this.ringInerted = [];
      this.ringReturnFocus?.focus?.({ preventScroll: true });
      this.ringRoot.setAttribute('aria-hidden', 'true');
      this.ringReturnFocus = null;
      delete this.ringRoot.dataset.sessionId;
    }

    _trapFocus(container, event) {
      const focusable = [...container.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    async dismiss() {
      const response = await send('user_alarm_dismiss');
      if (response.ok) this.hideRinging();
      await this.refresh();
    }

    async snooze() {
      const minutes = Number(this.ringRoot.querySelector('#alarm-ring-snooze-minutes').textContent) || 10;
      const response = await send('user_alarm_snooze', { minutes });
      if (response.ok) {
        this.hideRinging();
        this._toast(`已贪睡 ${minutes} 分钟`);
      }
      await this.refresh();
    }

    _toast(message, error = false) {
      const toast = document.createElement('div');
      toast.className = `alarm-toast${error ? ' error' : ''}`;
      toast.textContent = message;
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('show'));
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
      }, 2400);
    }
  }

  window.alarmCenter = new AlarmCenter();
})();
