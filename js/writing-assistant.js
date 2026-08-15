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
      this._enabled = false;
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

      const postAiConfig = _getCurrentPostAiConfig();

      const ctx = {
        text,
        cursorPosition,
        title: titleEl?.value || '',
        category: catEl?.value || '',
        triggerType: triggerType || 'typing',
        systemPrompt: postAiConfig?.systemPrompt || undefined,
        completionPrompt: postAiConfig?.completionPrompt || undefined,
        model: postAiConfig?.model || undefined,
        temperature: postAiConfig?.temperature || undefined,
        maxTokens: postAiConfig?.maxTokens || undefined,
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

  function _getCurrentPostId() {
    const blogMgr = window.blogManager || window._blogManager;
    return blogMgr?._editingPost?.id || null;
  }

  function _getCurrentPostAiConfig() {
    const blogMgr = window.blogManager || window._blogManager;
    const postId = blogMgr?._editingPost?.id;
    if (!postId || !blogMgr?.getPostAiConfig) return null;
    return blogMgr.getPostAiConfig(postId);
  }

  function _saveCurrentPostAiConfig(aiConfig) {
    const blogMgr = window.blogManager || window._blogManager;
    const postId = blogMgr?._editingPost?.id;
    if (!postId || !blogMgr?.updatePostAiConfig) return false;
    blogMgr.updatePostAiConfig(postId, aiConfig);
    return true;
  }

  function bindSettingsPanel() {
    const settingsBtn = document.getElementById('writing-ai-settings-btn');
    if (!settingsBtn || settingsBtn.dataset.bound) return;
    settingsBtn.dataset.bound = '1';

    settingsBtn.addEventListener('click', async () => {
      const settingsReturnFocus = document.activeElement;
      let panel = document.getElementById('writing-ai-settings-panel');
      if (panel) {
        panel.remove();
        window.blogManager?._restoreProductPage?.();
        settingsBtn.focus({ preventScroll: true });
        return;
      }

      window.blogManager?._setProductPage?.('ai-assistant');

      let config = {};
      let ragConfig = {};
      try {
        const [configRes, ragRes] = await Promise.all([
          fetch(`${BRIDGE_URL}/writing/config`, { signal: AbortSignal.timeout(2000) }),
          fetch(`${BRIDGE_URL}/writing/rag/config`, { signal: AbortSignal.timeout(2000) }).catch(() => null),
        ]);
        if (configRes.ok) config = await configRes.json();
        if (ragRes?.ok) ragConfig = await ragRes.json();
      } catch { /* use defaults */ }

      const postAiConfig = _getCurrentPostAiConfig();
      const hasPost = !!_getCurrentPostId();
      const effectiveSystemPrompt = postAiConfig?.systemPrompt || config.systemPrompt || config.defaultSystemPrompt || '';
      const effectiveCompletionPrompt = postAiConfig?.completionPrompt || '';

      const DEFAULT_SYSTEM_PROMPT = config.defaultSystemPrompt || `你是一个专业的中文写作助手，擅长产品文档、技术文档和商业文案的撰写。

核心能力：
- 续写：基于上下文自然续写1-2句，保持文风连贯
- 补全：在用户停顿时预测下一段合理内容
- 风格适配：根据文档类型（PRD/技术方案/日报等）调整用词和结构

约束：
- 直接输出续写内容，不重复已有文本
- 不加引号、不添加前缀标注
- 保持与上文语气和行文风格一致
- 优先中文，遇英文术语保留原文`;

      const DEFAULT_COMPLETION_PROMPT = `参考当前文章的写作风格和主题方向，续写时保持一致的语气和深度。如果是技术文档，注重准确性；如果是随笔，注重文采和流畅度。`;

      panel = document.createElement('div');
      panel.id = 'writing-ai-settings-panel';
      panel.className = 'writing-ai-settings-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'writing-ai-settings-title');
      panel.innerHTML = `
        <div class="writing-ai-settings-header">
          <span id="writing-ai-settings-title">写作 AI 设置</span>
          ${hasPost ? '<span style="font-size:0.65rem;opacity:0.6;margin-left:8px;">仅影响当前文章</span>' : ''}
          <button type="button" class="writing-ai-settings-close" aria-label="关闭写作 AI 设置">&times;</button>
        </div>
        <div class="writing-ai-settings-body">
          <label class="writing-ai-field">
            <span class="writing-ai-label">启用 AI 补全</span>
            <input type="checkbox" id="ws-enabled" ${config.enabled ? 'checked' : ''}>
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
            <span class="writing-ai-label">温度 <small id="ws-temp-val">${config.temperature ?? 0.3}</small></span>
            <input type="range" id="ws-temperature" min="0" max="1.5" step="0.1" value="${config.temperature ?? 0.3}">
          </label>
          <label class="writing-ai-field">
            <span class="writing-ai-label">最大 Token</span>
            <input type="number" id="ws-max-tokens" min="50" max="4096" step="50" value="${config.maxTokens ?? 80}">
          </label>

          <div class="writing-ai-divider" style="border-top:1px solid rgba(255,255,255,0.1);margin:12px 0;"></div>
          <div class="writing-ai-label" style="font-weight:600;margin-bottom:8px;">系统提示词 ${hasPost ? '<small style="opacity:0.5;font-weight:normal;">（与当前文章绑定）</small>' : ''}</div>
          <div class="writing-ai-field">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <span class="writing-ai-label" style="margin:0;">系统提示词 <small style="opacity:0.5">（定义 AI 角色和能力边界）</small></span>
              <button id="ws-prompt-reset" style="font-size:0.7rem;padding:2px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.5);cursor:pointer;">恢复默认</button>
            </div>
            <textarea id="ws-system-prompt" rows="5" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:8px;color:rgba(255,255,255,0.85);font-size:0.75rem;resize:vertical;font-family:monospace;line-height:1.5;">${effectiveSystemPrompt}</textarea>
          </div>
          <div class="writing-ai-field" style="margin-top:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
              <span class="writing-ai-label" style="margin:0;">补全提示词 <small style="opacity:0.5">（影响当前文章的AI续写风格）</small></span>
              <button id="ws-completion-prompt-reset" style="font-size:0.7rem;padding:2px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.5);cursor:pointer;">恢复默认</button>
            </div>
            <textarea id="ws-completion-prompt" rows="4" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:8px;color:rgba(255,255,255,0.85);font-size:0.75rem;resize:vertical;font-family:monospace;line-height:1.5;" placeholder="描述当前文章的续写风格偏好...">${effectiveCompletionPrompt}</textarea>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:4px;">${hasPost ? '提示词与当前文章绑定，切换文章时自动加载对应设置' : '当前未打开文章，修改将影响全局默认设置'}</div>
          </div>

          <div class="writing-ai-divider" style="border-top:1px solid rgba(255,255,255,0.1);margin:12px 0;"></div>
          <div class="writing-ai-label" style="font-weight:600;margin-bottom:8px;">RAG 文档联想</div>
          <label class="writing-ai-field">
            <span class="writing-ai-label">启用联想（基于历史文档）</span>
            <input type="checkbox" id="ws-rag-enabled" ${ragConfig.enabled ? 'checked' : ''}>
          </label>
          <label class="writing-ai-field">
            <span class="writing-ai-label">检索条数 (Top-K)</span>
            <input type="number" id="ws-rag-topk" min="1" max="10" value="${ragConfig.topK ?? 3}" style="width:60px">
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
      requestAnimationFrame(() => panel.querySelector('.writing-ai-settings-close')?.focus({ preventScroll: true }));

      const tempInput = panel.querySelector('#ws-temperature');
      const tempVal = panel.querySelector('#ws-temp-val');
      tempInput?.addEventListener('input', () => { tempVal.textContent = tempInput.value; });

      const closeSettings = () => {
        panel.inert = true;
        panel.remove();
        window.blogManager?._restoreProductPage?.();
        settingsReturnFocus?.focus?.({ preventScroll: true });
      };

      panel.querySelector('.writing-ai-settings-close')?.addEventListener('click', closeSettings);

      panel.querySelector('#ws-prompt-reset')?.addEventListener('click', () => {
        const promptArea = panel.querySelector('#ws-system-prompt');
        if (promptArea) promptArea.value = DEFAULT_SYSTEM_PROMPT;
      });

      panel.querySelector('#ws-completion-prompt-reset')?.addEventListener('click', () => {
        const promptArea = panel.querySelector('#ws-completion-prompt');
        if (promptArea) promptArea.value = DEFAULT_COMPLETION_PROMPT;
      });

      panel.querySelector('#ws-save')?.addEventListener('click', async () => {
        const newSystemPrompt = panel.querySelector('#ws-system-prompt')?.value || '';
        const newCompletionPrompt = panel.querySelector('#ws-completion-prompt')?.value || '';

        const newConfig = {
          enabled: panel.querySelector('#ws-enabled')?.checked ?? false,
          model: panel.querySelector('#ws-model')?.value || 'qwen-turbo-latest',
          temperature: parseFloat(panel.querySelector('#ws-temperature')?.value || '0.3'),
          maxTokens: parseInt(panel.querySelector('#ws-max-tokens')?.value || '80'),
          systemPrompt: newSystemPrompt,
        };

        const newRagConfig = {
          enabled: panel.querySelector('#ws-rag-enabled')?.checked ?? false,
          topK: parseInt(panel.querySelector('#ws-rag-topk')?.value || '3'),
        };

        if (hasPost) {
          _saveCurrentPostAiConfig({
            systemPrompt: newSystemPrompt,
            completionPrompt: newCompletionPrompt,
            model: newConfig.model,
            temperature: newConfig.temperature,
            maxTokens: newConfig.maxTokens,
          });
        }

        try {
          const [res, ragRes] = await Promise.all([
            fetch(`${BRIDGE_URL}/writing/config`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newConfig),
            }),
            fetch(`${BRIDGE_URL}/writing/rag/config`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newRagConfig),
            }).catch(() => null),
          ]);

          if (res.ok) {
            const wsStatus = panel.querySelector('#ws-status');
            if (wsStatus) { wsStatus.textContent = '已保存'; wsStatus.style.color = '#4caf50'; }
            assistantClient.setEnabled(newConfig.enabled);
            const toggleBtn = document.getElementById('writing-ai-toggle');
            if (toggleBtn) toggleBtn.classList.toggle('active', newConfig.enabled);
            setTimeout(() => {
              panel.remove();
              window.blogManager?._restoreProductPage?.();
            }, 800);
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
