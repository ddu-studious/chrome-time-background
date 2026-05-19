/**
 * Writing Assistant — AI 写作补全（Ghost Text）
 * 与 cursor-bridge 的 /writing/* 路由对接，提供 textarea 上的实时 AI 补全建议
 */
(function () {
  'use strict';

  const BRIDGE_URL = 'http://127.0.0.1:19840';
  const DEBOUNCE_MS = 500;
  const DEBOUNCE_MS_FAST = 250;
  const PAUSE_THRESHOLD_MS = 1200;
  const MIN_CHARS = 5;
  const GHOST_CLASS = 'writing-ghost-text';
  const CONTAINER_CLASS = 'writing-ghost-container';

  const SENTENCE_END_ZH = /[。！？；…]+$/;
  const SENTENCE_END_EN = /[.!?;]+\s*$/;
  const PARAGRAPH_END = /\n\s*\n$/;
  const COMMA_PAUSE_ZH = /[，、：]+$/;
  const COMMA_PAUSE_EN = /[,:]+\s*$/;

  class WritingAssistantClient {
    constructor() {
      this._abortCtrl = null;
      this._debounceTimer = null;
      this._pauseTimer = null;
      this._lastInputTime = 0;
      this._enabled = true;
      this._suggestion = '';
      this._pending = false;
      this._accepting = false;
      this._attachedTextareas = new WeakSet();
      this._ghostEls = new WeakMap();
      this._mirrorEls = new WeakMap();
      this._bridgeAvailable = null;
      this._checkBridgeStatus();
    }

    async _checkBridgeStatus() {
      try {
        const res = await fetch(`${BRIDGE_URL}/writing/config`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const cfg = await res.json();
          this._bridgeAvailable = cfg.qwenConfigured && cfg.enabled;
        } else {
          this._bridgeAvailable = false;
        }
      } catch {
        this._bridgeAvailable = false;
      }
    }

    attach(textarea) {
      if (!textarea || this._attachedTextareas.has(textarea)) return;
      this._attachedTextareas.add(textarea);

      const wrapper = this._createGhostOverlay(textarea);
      this._ghostEls.set(textarea, wrapper);

      textarea.addEventListener('input', () => this._onInput(textarea));
      textarea.addEventListener('keydown', (e) => this._onKeyDown(e, textarea));
      textarea.addEventListener('scroll', () => this._syncScroll(textarea));
      textarea.addEventListener('blur', () => {
        setTimeout(() => this._hideGhost(textarea), 150);
      });
      textarea.addEventListener('focus', () => {
        if (this._suggestion) this._showGhost(textarea, this._suggestion);
      });

      const ro = new ResizeObserver(() => this._syncGhostSize(textarea));
      ro.observe(textarea);
    }

    detach(textarea) {
      if (!textarea) return;
      this._attachedTextareas.delete(textarea);
      const ghost = this._ghostEls.get(textarea);
      if (ghost) {
        ghost.remove();
        this._ghostEls.delete(textarea);
      }
      this._cancelPending();
      if (this._pauseTimer) {
        clearInterval(this._pauseTimer);
        this._pauseTimer = null;
      }
    }

    setEnabled(v) { this._enabled = !!v; }
    isEnabled() { return this._enabled; }

    _createGhostOverlay(textarea) {
      const parent = textarea.parentElement;
      if (!parent) return null;
      if (!parent.style.position || parent.style.position === 'static') {
        parent.style.position = 'relative';
      }

      const container = document.createElement('div');
      container.className = CONTAINER_CLASS;

      const ghost = document.createElement('div');
      ghost.className = GHOST_CLASS;
      container.appendChild(ghost);

      const hint = document.createElement('div');
      hint.className = 'writing-ghost-hint';
      hint.textContent = 'Tab 接受 · Ctrl+→ 逐词 · Esc 取消';
      hint.style.display = 'none';
      container.appendChild(hint);

      parent.appendChild(container);
      this._syncGhostStyle(textarea, ghost);
      this._syncGhostSize(textarea);
      return container;
    }

    _syncGhostStyle(textarea, ghost) {
      const cs = window.getComputedStyle(textarea);
      const props = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
        'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'boxSizing', 'textTransform', 'textAlign',
      ];
      for (const prop of props) {
        ghost.style[prop] = cs[prop];
      }
      ghost.style.whiteSpace = 'pre-wrap';
      ghost.style.wordWrap = 'break-word';
      ghost.style.overflowWrap = 'break-word';
    }

    _syncGhostSize(textarea) {
      const container = this._ghostEls.get(textarea);
      if (!container) return;
      const ghost = container.querySelector('.' + GHOST_CLASS);
      if (!ghost) return;

      const rect = textarea.getBoundingClientRect();
      const parentRect = textarea.parentElement.getBoundingClientRect();
      container.style.top = (rect.top - parentRect.top) + 'px';
      container.style.left = (rect.left - parentRect.left) + 'px';
      container.style.width = rect.width + 'px';
      container.style.height = rect.height + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
    }

    _syncScroll(textarea) {
      const container = this._ghostEls.get(textarea);
      if (!container) return;
      const ghost = container.querySelector('.' + GHOST_CLASS);
      if (ghost) ghost.scrollTop = textarea.scrollTop;
    }

    _onInput(textarea) {
      if (this._accepting) return;

      this._hideGhost(textarea);
      this._suggestion = '';
      this._cancelPending();

      if (!this._enabled) return;

      const text = textarea.value;
      if (text.length < MIN_CHARS) return;

      const trigger = this._detectTrigger(textarea);
      const delay = trigger.fast ? DEBOUNCE_MS_FAST : DEBOUNCE_MS;

      this._lastInputTime = Date.now();

      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._requestCompletion(textarea, trigger.type);
      }, delay);

      if (!this._pauseTimer) {
        this._pauseTimer = setInterval(() => {
          if (!this._enabled || this._pending || this._suggestion) return;
          const elapsed = Date.now() - (this._lastInputTime || 0);
          if (elapsed >= PAUSE_THRESHOLD_MS && textarea.value.length >= MIN_CHARS) {
            clearInterval(this._pauseTimer);
            this._pauseTimer = null;
            this._requestCompletion(textarea, 'pause');
          }
        }, 500);
      }
    }

    _detectTrigger(textarea) {
      const text = textarea.value;
      const pos = textarea.selectionStart;
      const before = text.slice(0, pos);

      if (PARAGRAPH_END.test(before)) {
        return { fast: true, type: 'paragraph_end' };
      }
      if (SENTENCE_END_ZH.test(before) || SENTENCE_END_EN.test(before)) {
        return { fast: true, type: 'sentence_end' };
      }
      if (COMMA_PAUSE_ZH.test(before) || COMMA_PAUSE_EN.test(before)) {
        return { fast: false, type: 'clause_end' };
      }
      return { fast: false, type: 'typing' };
    }

    _isGhostVisible(textarea) {
      const container = this._ghostEls.get(textarea);
      return container && container.style.display !== 'none' && this._suggestion;
    }

    _onKeyDown(e, textarea) {
      if (!this._isGhostVisible(textarea)) return;

      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this._acceptSuggestion(textarea);
        return;
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this._acceptSuggestion(textarea);
        return;
      }

      if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        this._acceptPartialSuggestion(textarea);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this._rejectSuggestion(textarea);
        return;
      }
    }

    _acceptPartialSuggestion(textarea) {
      if (!this._suggestion) return;

      const SEG_PATTERN = /^[\u4e00-\u9fff\u3400-\u4dbf]{1,4}|^\S+\s?|^[\s,，、。！？；：]+/;
      const match = this._suggestion.match(SEG_PATTERN);
      const segment = match ? match[0] : this._suggestion;

      const remaining = this._suggestion.slice(segment.length);
      this._accepting = true;

      const pos = textarea.selectionStart;
      const before = textarea.value.slice(0, pos);
      const after = textarea.value.slice(pos);
      textarea.value = before + segment + after;
      textarea.selectionStart = textarea.selectionEnd = pos + segment.length;
      textarea.focus();

      this._sendFeedback(true);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      if (remaining.trim()) {
        this._suggestion = remaining;
        requestAnimationFrame(() => {
          this._accepting = false;
          this._showGhost(textarea, remaining);
        });
      } else {
        this._suggestion = '';
        this._hideGhost(textarea);
        requestAnimationFrame(() => { this._accepting = false; });
      }
    }

    _acceptSuggestion(textarea) {
      if (!this._suggestion) return;
      const accepted = this._suggestion;
      this._suggestion = '';
      this._accepting = true;

      const pos = textarea.selectionStart;
      const before = textarea.value.slice(0, pos);
      const after = textarea.value.slice(pos);
      textarea.value = before + accepted + after;
      textarea.selectionStart = textarea.selectionEnd = pos + accepted.length;
      textarea.focus();

      this._hideGhost(textarea);
      this._sendFeedback(true);

      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      requestAnimationFrame(() => { this._accepting = false; });
    }

    _rejectSuggestion(textarea) {
      this._sendFeedback(false);
      this._suggestion = '';
      this._hideGhost(textarea);
    }

    _showGhost(textarea, suggestion) {
      this._hideGhost(textarea);

      const parent = textarea.parentElement;
      if (!parent) return;

      const coords = this._getCaretCoords(textarea);
      if (!coords) {
        this._showGhostFallback(textarea, suggestion);
        return;
      }

      let popup = this._ghostEls.get(textarea)?.querySelector('.writing-inline-popup');
      if (!popup) {
        popup = document.createElement('div');
        popup.className = 'writing-inline-popup';
        const container = this._ghostEls.get(textarea);
        if (container) {
          container.appendChild(popup);
        } else {
          parent.appendChild(popup);
        }
      }

      const truncated = suggestion.length > 120 ? suggestion.slice(0, 120) + '…' : suggestion;
      popup.textContent = truncated;

      const taRect = textarea.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      const caretLeft = coords.left - textarea.scrollLeft;
      const caretTop = coords.top - textarea.scrollTop + coords.lineHeight;

      const offsetTop = taRect.top - parentRect.top;
      const offsetLeft = taRect.left - parentRect.left;

      let popupTop = offsetTop + caretTop + 4;
      let popupLeft = offsetLeft + caretLeft;

      const maxPopupLeft = offsetLeft + taRect.width - 60;
      if (popupLeft > maxPopupLeft) popupLeft = offsetLeft + 20;

      const maxVisibleTop = offsetTop + taRect.height;
      if (popupTop > maxVisibleTop - 30) {
        popupTop = maxVisibleTop - 32;
      }

      popup.style.top = popupTop + 'px';
      popup.style.left = Math.max(offsetLeft + 8, popupLeft) + 'px';
      popup.style.maxWidth = Math.min(500, taRect.width - 24) + 'px';
      popup.style.display = 'block';
      popup.style.opacity = '1';

      const container = this._ghostEls.get(textarea);
      if (container) {
        container.style.display = 'block';
        const hint = container.querySelector('.writing-ghost-hint');
        if (hint) hint.style.display = 'none';
        const ghost = container.querySelector('.' + GHOST_CLASS);
        if (ghost) ghost.style.display = 'none';
      }
    }

    _showGhostFallback(textarea, suggestion) {
      const container = this._ghostEls.get(textarea);
      if (!container) return;
      const ghost = container.querySelector('.' + GHOST_CLASS);
      const hint = container.querySelector('.writing-ghost-hint');
      if (!ghost) return;

      this._syncGhostStyle(textarea, ghost);
      this._syncGhostSize(textarea);

      const text = textarea.value;
      const pos = textarea.selectionStart;
      const before = text.slice(0, pos);
      const after = text.slice(pos);

      ghost.textContent = '';
      ghost.style.display = '';

      const beforeSpan = document.createElement('span');
      beforeSpan.style.visibility = 'hidden';
      beforeSpan.style.whiteSpace = 'pre-wrap';
      beforeSpan.textContent = before;
      ghost.appendChild(beforeSpan);

      const suggSpan = document.createElement('span');
      suggSpan.className = 'writing-ghost-suggestion';
      suggSpan.textContent = suggestion;
      ghost.appendChild(suggSpan);

      if (after) {
        const afterSpan = document.createElement('span');
        afterSpan.style.visibility = 'hidden';
        afterSpan.style.whiteSpace = 'pre-wrap';
        afterSpan.textContent = after;
        ghost.appendChild(afterSpan);
      }

      container.style.display = 'block';
      ghost.scrollTop = textarea.scrollTop;
      if (hint) hint.style.display = suggestion ? 'block' : 'none';
    }

    _getCaretCoords(textarea) {
      const mirror = this._getOrCreateMirror(textarea);
      if (!mirror) return null;

      const cs = window.getComputedStyle(textarea);
      const props = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
        'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'boxSizing', 'textTransform', 'textAlign', 'width',
      ];
      for (const p of props) mirror.style[p] = cs[p];
      mirror.style.whiteSpace = 'pre-wrap';
      mirror.style.wordWrap = 'break-word';
      mirror.style.overflowWrap = 'break-word';
      mirror.style.overflow = 'hidden';
      mirror.style.position = 'absolute';
      mirror.style.visibility = 'hidden';
      mirror.style.top = '0';
      mirror.style.left = '-9999px';
      mirror.style.height = 'auto';

      const text = textarea.value;
      const pos = textarea.selectionStart;
      mirror.textContent = text.slice(0, pos);

      const marker = document.createElement('span');
      marker.textContent = '\u200b';
      mirror.appendChild(marker);

      const lineHeight = parseInt(cs.lineHeight) || parseInt(cs.fontSize) * 1.4;

      const result = {
        left: marker.offsetLeft,
        top: marker.offsetTop,
        lineHeight,
      };

      mirror.textContent = '';
      return result;
    }

    _getOrCreateMirror(textarea) {
      let mirror = this._mirrorEls.get(textarea);
      if (mirror && mirror.parentElement) return mirror;
      mirror = document.createElement('div');
      mirror.setAttribute('aria-hidden', 'true');
      document.body.appendChild(mirror);
      this._mirrorEls.set(textarea, mirror);
      return mirror;
    }

    _hideGhost(textarea) {
      const container = this._ghostEls.get(textarea);
      if (!container) return;
      container.style.display = 'none';
      const popup = container.querySelector('.writing-inline-popup');
      if (popup) { popup.style.display = 'none'; popup.style.opacity = '0'; }
      const ghost = container.querySelector('.' + GHOST_CLASS);
      if (ghost) ghost.style.display = 'none';
    }

    _cancelPending() {
      if (this._abortCtrl) {
        this._abortCtrl.abort();
        this._abortCtrl = null;
      }
      this._pending = false;
    }

    async _requestCompletion(textarea, triggerType) {
      this._cancelPending();

      if (this._bridgeAvailable === false) return;

      const text = textarea.value;
      const cursorPosition = textarea.selectionStart;

      const titleEl = document.getElementById('blog-ed-title');
      const catEl = document.getElementById('blog-ed-cat');

      const ctx = {
        text,
        cursorPosition,
        title: titleEl?.value || '',
        category: catEl?.value || '',
        triggerType: triggerType || 'typing',
      };

      this._abortCtrl = new AbortController();
      this._pending = true;

      try {
        const res = await fetch(`${BRIDGE_URL}/writing/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ctx),
          signal: this._abortCtrl.signal,
        });

        if (!res.ok) {
          if (res.status === 503) this._bridgeAvailable = false;
          this._pending = false;
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullSuggestion = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === 'error') {
                this._pending = false;
                return;
              }

              if (currentEvent === 'token' && data.content) {
                fullSuggestion += data.content;
                if (textarea.value === text && textarea.selectionStart === cursorPosition) {
                  this._suggestion = fullSuggestion;
                  this._showGhost(textarea, fullSuggestion);
                }
              }
            } catch { /* ignore malformed SSE lines */ }

            currentEvent = '';
          }
        }

        this._pending = false;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[WritingAssistant] completion error:', err.message);
          this._checkBridgeStatus();
        }
        this._pending = false;
      }
    }

    _sendFeedback(accepted) {
      try {
        fetch(`${BRIDGE_URL}/writing/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete', accepted }),
        }).catch(() => {});
      } catch { /* non-critical */ }
    }

    async rewrite(text) {
      return this._callStreamAction('/writing/rewrite', { text });
    }

    async summarize(text) {
      return this._callStreamAction('/writing/summarize', { text });
    }

    async expand(text) {
      return this._callStreamAction('/writing/expand', { text });
    }

    async _callStreamAction(path, body) {
      if (this._bridgeAvailable === false) {
        return { error: 'Bridge not available' };
      }

      try {
        const res = await fetch(`${BRIDGE_URL}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) return { error: `HTTP ${res.status}` };

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let result = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'token' && data.content) {
                result += data.content;
              }
            } catch { /* skip */ }
            currentEvent = '';
          }
        }

        return { content: result };
      } catch (err) {
        return { error: err.message };
      }
    }

    isBridgeAvailable() {
      return this._bridgeAvailable;
    }
  }

  const assistantClient = new WritingAssistantClient();

  function tryAttachToEditor() {
    const textarea = document.getElementById('blog-ed-body');
    if (textarea) {
      assistantClient.attach(textarea);
    }
    bindToolbar();
  }

  function bindToolbar() {
    const toolbar = document.getElementById('writing-ai-toolbar');
    if (!toolbar || toolbar.dataset.bound) return;
    toolbar.dataset.bound = '1';

    const textarea = document.getElementById('blog-ed-body');
    const statusEl = document.getElementById('writing-ai-status');
    const hintEl = document.getElementById('writing-ai-selection-hint');
    const selectionBtns = toolbar.querySelectorAll('.writing-ai-selection-btn');

    function updateSelectionState() {
      if (!textarea) return;
      const hasSelection = textarea.selectionStart !== textarea.selectionEnd
        && textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim().length > 0;

      selectionBtns.forEach((btn) => {
        btn.classList.toggle('ready', hasSelection);
      });
      if (hintEl) {
        hintEl.style.display = hasSelection ? 'none' : '';
      }
    }

    if (textarea) {
      textarea.addEventListener('select', updateSelectionState);
      textarea.addEventListener('mouseup', updateSelectionState);
      textarea.addEventListener('keyup', updateSelectionState);
      textarea.addEventListener('blur', () => {
        setTimeout(updateSelectionState, 100);
      });
    }
    updateSelectionState();

    toolbar.querySelectorAll('[data-ai-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!textarea) return;
        const action = btn.dataset.aiAction;
        const selStart = textarea.selectionStart;
        const selEnd = textarea.selectionEnd;
        const selected = textarea.value.slice(selStart, selEnd);

        if (!selected.trim()) {
          if (statusEl) {
            statusEl.textContent = '请先选中文本';
            statusEl.className = 'writing-ai-status warn';
            setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'writing-ai-status'; }, 2000);
          }
          return;
        }

        btn.classList.add('loading');
        if (statusEl) { statusEl.textContent = '处理中...'; statusEl.className = 'writing-ai-status active'; }

        let result;
        if (action === 'rewrite') result = await assistantClient.rewrite(selected);
        else if (action === 'summarize') result = await assistantClient.summarize(selected);
        else if (action === 'expand') result = await assistantClient.expand(selected);

        btn.classList.remove('loading');

        if (result?.error) {
          if (statusEl) {
            statusEl.textContent = result.error;
            statusEl.className = 'writing-ai-status error';
            setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'writing-ai-status'; }, 3000);
          }
          return;
        }

        if (result?.content) {
          textarea.value = textarea.value.slice(0, selStart) + result.content + textarea.value.slice(selEnd);
          textarea.selectionStart = selStart;
          textarea.selectionEnd = selStart + result.content.length;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          if (statusEl) { statusEl.textContent = ''; statusEl.className = 'writing-ai-status'; }
        }
      });
    });

    const toggleBtn = document.getElementById('writing-ai-toggle');
    if (toggleBtn) {
      const updateToggle = () => {
        toggleBtn.classList.toggle('active', assistantClient.isEnabled());
      };
      updateToggle();
      toggleBtn.addEventListener('click', () => {
        assistantClient.setEnabled(!assistantClient.isEnabled());
        updateToggle();
        if (statusEl) {
          statusEl.textContent = assistantClient.isEnabled() ? 'AI 补全已开启' : 'AI 补全已关闭';
          setTimeout(() => { statusEl.textContent = ''; }, 1500);
        }
      });
    }

    bindSettingsPanel();
    updateToolbarStatus();
  }

  function bindSettingsPanel() {
    const settingsBtn = document.getElementById('writing-ai-settings-btn');
    if (!settingsBtn || settingsBtn.dataset.bound) return;
    settingsBtn.dataset.bound = '1';

    settingsBtn.addEventListener('click', async () => {
      let panel = document.getElementById('writing-ai-settings-panel');
      if (panel) { panel.remove(); return; }

      let config = {};
      try {
        const res = await fetch(`${BRIDGE_URL}/writing/config`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) config = await res.json();
      } catch { /* use defaults */ }

      panel = document.createElement('div');
      panel.id = 'writing-ai-settings-panel';
      panel.className = 'writing-ai-settings-panel';
      panel.innerHTML = `
        <div class="writing-ai-settings-header">
          <span>写作 AI 设置</span>
          <button class="writing-ai-settings-close">&times;</button>
        </div>
        <div class="writing-ai-settings-body">
          <label class="writing-ai-field">
            <span class="writing-ai-label">启用 AI 补全</span>
            <input type="checkbox" id="ws-enabled" ${config.enabled !== false ? 'checked' : ''}>
          </label>
          <label class="writing-ai-field">
            <span class="writing-ai-label">模型</span>
            <select id="ws-model">
              <option value="qwen-turbo-latest" ${config.model === 'qwen-turbo-latest' ? 'selected' : ''}>Qwen Turbo (最快)</option>
              <option value="qwen3-235b-a22b" ${config.model === 'qwen3-235b-a22b' || !config.model ? 'selected' : ''}>Qwen 3 235B</option>
              <option value="qwen-plus" ${config.model === 'qwen-plus' ? 'selected' : ''}>Qwen Plus</option>
              <option value="qwen-max" ${config.model === 'qwen-max' ? 'selected' : ''}>Qwen Max</option>
            </select>
          </label>
          <label class="writing-ai-field">
            <span class="writing-ai-label">温度 <small id="ws-temp-val">${config.temperature ?? 0.4}</small></span>
            <input type="range" id="ws-temperature" min="0" max="1.5" step="0.1" value="${config.temperature ?? 0.4}">
          </label>
          <label class="writing-ai-field">
            <span class="writing-ai-label">最大 Token</span>
            <input type="number" id="ws-max-tokens" min="50" max="4096" step="50" value="${config.maxTokens ?? 100}">
          </label>
          <div class="writing-ai-settings-actions">
            <button class="writing-ai-save-btn" id="ws-save">保存</button>
          </div>
          <div class="writing-ai-settings-info" id="ws-status">
            ${config.qwenConfigured ? 'Qwen API 已配置' : 'Qwen API 未配置'}
          </div>
        </div>
      `;

      const toolbar = document.getElementById('writing-ai-toolbar');
      (toolbar?.parentElement || document.body).appendChild(panel);

      const tempInput = panel.querySelector('#ws-temperature');
      const tempVal = panel.querySelector('#ws-temp-val');
      tempInput?.addEventListener('input', () => { tempVal.textContent = tempInput.value; });

      panel.querySelector('.writing-ai-settings-close')?.addEventListener('click', () => panel.remove());

      panel.querySelector('#ws-save')?.addEventListener('click', async () => {
        const newConfig = {
          enabled: panel.querySelector('#ws-enabled')?.checked ?? true,
          model: panel.querySelector('#ws-model')?.value || 'qwen-turbo-latest',
          temperature: parseFloat(panel.querySelector('#ws-temperature')?.value || '0.4'),
          maxTokens: parseInt(panel.querySelector('#ws-max-tokens')?.value || '100'),
        };

        try {
          const res = await fetch(`${BRIDGE_URL}/writing/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig),
          });
          if (res.ok) {
            const wsStatus = panel.querySelector('#ws-status');
            if (wsStatus) { wsStatus.textContent = '已保存'; wsStatus.style.color = '#4caf50'; }
            assistantClient.setEnabled(newConfig.enabled);
            const toggleBtn = document.getElementById('writing-ai-toggle');
            if (toggleBtn) toggleBtn.classList.toggle('active', newConfig.enabled);
            setTimeout(() => panel.remove(), 800);
          }
        } catch (e) {
          const wsStatus = panel.querySelector('#ws-status');
          if (wsStatus) { wsStatus.textContent = '保存失败'; wsStatus.style.color = '#e74c3c'; }
        }
      });
    });
  }

  function updateToolbarStatus() {
    const statusEl = document.getElementById('writing-ai-status');
    const toggleBtn = document.getElementById('writing-ai-toggle');
    if (!statusEl) return;

    if (assistantClient.isBridgeAvailable() === false) {
      statusEl.textContent = 'Bridge 未连接';
      statusEl.className = 'writing-ai-status error';
    } else if (assistantClient.isBridgeAvailable() === true) {
      if (toggleBtn) toggleBtn.classList.add('connected');
    }
  }

  const observer = new MutationObserver(() => {
    tryAttachToEditor();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  tryAttachToEditor();

  window.WritingAssistant = assistantClient;
})();
