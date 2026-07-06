/**
 * Bridge SDK — cursor-bridge 统一客户端通信层
 *
 * 所有需要与 cursor-bridge 后端通信的模块（Agent 矩阵、Chatbot、Prompt 管理等）
 * 都通过此 SDK 访问，确保：
 *   - 单一连接管理入口（健康检查、自动重连）
 *   - SSE 流式响应的正确使用
 *   - Agent 生命周期的标准化操作
 *   - 配置与诊断信息的统一获取
 *
 * 架构位置:
 *   UI Modules (chatbot, agent-matrix, etc.)
 *       ↓ 调用
 *   BridgeSDK (本文件)
 *       ↓ HTTP / SSE
 *   cursor-bridge (Node.js 后端)
 *       ↓ Cursor SDK
 *   Cursor Cloud API
 */
(function () {
    'use strict';

    const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:19840';
    const HEALTH_INTERVAL = 15000;
    const RECONNECT_DELAY = 5000;
    const STORAGE_KEY_CONFIG = 'bridgeSdkConfig';

    class BridgeSDK {
        constructor() {
            this._url = DEFAULT_BRIDGE_URL;
            this._connected = false;
            this._healthTimer = null;
            this._sseConnections = new Map();
            this._listeners = new Map();
            this._models = [];
            this._diagnostics = { lastHealthCheck: null, lastError: null, upSince: null };

            this._loadConfig();
        }

        // ─── Configuration ───

        get url() { return this._url; }
        get connected() { return this._connected; }
        get models() { return [...this._models]; }
        get diagnostics() { return { ...this._diagnostics }; }

        configure(opts = {}) {
            if (opts.url) this._url = opts.url.replace(/\/$/, '');
            this._saveConfig();
        }

        _loadConfig() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
                if (saved) {
                    const cfg = JSON.parse(saved);
                    if (cfg.url) this._url = cfg.url;
                }
            } catch {}
        }

        _saveConfig() {
            try {
                localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ url: this._url }));
            } catch {}
        }

        // ─── Connection Management ───

        async connect() {
            await this._checkHealth();
            this._startHealthLoop();
            return this._connected;
        }

        disconnect() {
            this._stopHealthLoop();
            this._closeAllSSE();
            this._connected = false;
            this._emit('disconnect');
        }

        async _checkHealth() {
            try {
                const res = await fetch(`${this._url}/health`, {
                    signal: AbortSignal.timeout(3000)
                });
                const wasConnected = this._connected;
                this._connected = res.ok;
                this._diagnostics.lastHealthCheck = Date.now();

                if (res.ok) {
                    this._diagnostics.lastError = null;
                    if (!wasConnected) {
                        this._diagnostics.upSince = Date.now();
                        this._emit('connect');
                        console.log('[BridgeSDK] Connected to', this._url);
                    }
                }
                return this._connected;
            } catch (err) {
                const wasConnected = this._connected;
                this._connected = false;
                this._diagnostics.lastError = err.message;
                this._diagnostics.lastHealthCheck = Date.now();
                if (wasConnected) {
                    this._emit('disconnect');
                    console.warn('[BridgeSDK] Connection lost:', err.message);
                }
                return false;
            }
        }

        _startHealthLoop() {
            this._stopHealthLoop();
            this._healthTimer = setInterval(() => this._checkHealth(), HEALTH_INTERVAL);
        }

        _stopHealthLoop() {
            if (this._healthTimer) {
                clearInterval(this._healthTimer);
                this._healthTimer = null;
            }
        }

        // ─── Event Bus ───

        on(event, fn) {
            if (!this._listeners.has(event)) this._listeners.set(event, new Set());
            this._listeners.get(event).add(fn);
            return () => this._listeners.get(event)?.delete(fn);
        }

        _emit(event, data) {
            const fns = this._listeners.get(event);
            if (fns) fns.forEach(fn => { try { fn(data); } catch {} });
        }

        // ─── API Helpers ───

        async _api(path, opts = {}) {
            const url = `${this._url}${path}`;
            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json', ...opts.headers },
                signal: AbortSignal.timeout(opts.timeout || 30000),
                ...opts,
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                const err = new Error(`API ${opts.method || 'GET'} ${path} → ${res.status}: ${text}`);
                err.status = res.status;
                err.body = text;
                throw err;
            }
            const contentType = res.headers.get('content-type');
            if (contentType?.includes('application/json')) return res.json();
            return res.text();
        }

        // ─── Agent Lifecycle ───

        async listAgents() {
            const data = await this._api('/agents');
            return data.agents || [];
        }

        async createAgent({ name, cwd = '/tmp', model, description, mcpServers }) {
            const body = { name, cwd, description };
            if (model) body.model = model;
            if (mcpServers) body.mcpServers = mcpServers;

            return this._api('/agents', {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        async getAgent(agentId) {
            return this._api(`/agents/${agentId}`);
        }

        async sendPrompt(agentId, prompt, images) {
            const body = { prompt };
            if (images?.length) body.images = images;

            return this._api(`/agents/${agentId}/send`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        async getHistory(agentId) {
            const data = await this._api(`/agents/${agentId}/history`);
            return data.history || [];
        }

        async getConversation(agentId) {
            const data = await this._api(`/agents/${agentId}/conversation`);
            return data.turns || [];
        }

        async cancelAgent(agentId) {
            return this._api(`/agents/${agentId}/cancel`, { method: 'POST' });
        }

        async disposeAgent(agentId) {
            return this._api(`/agents/${agentId}`, { method: 'DELETE' });
        }

        async oneShot(prompt, opts = {}) {
            return this._api('/agents/prompt', {
                method: 'POST',
                body: JSON.stringify({ prompt, ...opts }),
            });
        }

        // ─── SSE Streaming ───

        /**
         * 订阅 Agent 的 SSE 流。返回 StreamSubscription 对象。
         *
         * @param {string} agentId - Bridge Agent ID
         * @param {object} handlers - 事件处理器
         *   - onText(content, runId): 文本增量
         *   - onDelta(data): 原始 delta 事件 (text-delta, thinking-delta, tool-call-started, etc.)
         *   - onToolCall(data): 工具调用事件
         *   - onThinking(text, runId): 思考内容
         *   - onStatus(data): 运行状态变化 (finished, error, cancelled)
         *   - onAgentStatus(data): Agent 生命周期状态 (idle, running, error)
         *   - onError(message): 错误事件
         *   - onConnect(): 连接建立
         * @returns {StreamSubscription} 具有 close() 方法的订阅对象
         */
        subscribe(agentId, handlers = {}) {
            const key = agentId;

            if (this._sseConnections.has(key)) {
                this._sseConnections.get(key).close();
            }

            const es = new EventSource(`${this._url}/agents/${agentId}/stream`);
            const subscription = {
                agentId,
                eventSource: es,
                textBuffer: '',
                closed: false,
                close: () => {
                    if (subscription.closed) return;
                    subscription.closed = true;
                    es.close();
                    this._sseConnections.delete(key);
                }
            };

            this._sseConnections.set(key, subscription);

            es.addEventListener('connected', () => {
                handlers.onConnect?.();
            });

            es.addEventListener('text', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    subscription.textBuffer += (data.content || '');
                    handlers.onText?.(data.content, data.runId);
                } catch {}
            });

            es.addEventListener('delta', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'text-delta' && data.text) {
                        subscription.textBuffer += data.text;
                        handlers.onText?.(data.text, data.runId);
                    }
                    handlers.onDelta?.(data);
                } catch {}
            });

            es.addEventListener('tool_call', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    handlers.onToolCall?.(data);
                } catch {}
            });

            es.addEventListener('thinking', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    handlers.onThinking?.(data.text, data.runId);
                } catch {}
            });

            es.addEventListener('status', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    handlers.onStatus?.(data);
                } catch {}
            });

            es.addEventListener('agent_status', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    handlers.onAgentStatus?.(data);
                } catch {}
            });

            es.addEventListener('error', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    handlers.onError?.(data.message || 'Unknown error');
                } catch {
                    handlers.onError?.('SSE connection error');
                }
            });

            es.onerror = () => {
                if (!subscription.closed) {
                    handlers.onError?.('SSE connection lost');
                }
            };

            return subscription;
        }

        _closeAllSSE() {
            for (const [, sub] of this._sseConnections) {
                sub.close();
            }
        }

        // ─── Model & Config Discovery ───

        async fetchModels() {
            try {
                const data = await this._api('/models');
                this._models = data.models || [];
                return this._models;
            } catch {
                return [];
            }
        }

        async getDashboard() {
            return this._api('/dashboard');
        }

        async getAuthStatus() {
            return this._api('/dashboard/auth-status');
        }

        // ─── Diagnostic Info ───

        async runDiagnostics() {
            const report = {
                url: this._url,
                connected: this._connected,
                timestamp: Date.now(),
                checks: {},
            };

            try {
                const health = await fetch(`${this._url}/health`, { signal: AbortSignal.timeout(3000) });
                report.checks.health = { ok: health.ok, status: health.status };
            } catch (e) {
                report.checks.health = { ok: false, error: e.message };
            }

            try {
                const auth = await this.getAuthStatus();
                report.checks.auth = { ok: true, ...auth };
            } catch (e) {
                report.checks.auth = { ok: false, error: e.message };
            }

            try {
                const agents = await this.listAgents();
                report.checks.agents = { ok: true, count: agents.length };
            } catch (e) {
                report.checks.agents = { ok: false, error: e.message };
            }

            try {
                const models = await this.fetchModels();
                report.checks.models = { ok: true, count: models.length };
            } catch (e) {
                report.checks.models = { ok: false, error: e.message };
            }

            return report;
        }

        // ─── Agent 矩阵互通 ───

        /**
         * 获取或创建一个命名 Agent（用于 chatbot 等模块复用已有 Agent）
         */
        async getOrCreateAgent({ name, cwd = '/tmp', model, description }) {
            const agents = await this.listAgents();
            const existing = agents.find(a => a.name === name && a.status !== 'disposed');
            if (existing) return existing;
            return this.createAgent({ name, cwd, model, description });
        }

        /**
         * 发送消息并通过 SSE 流式获取响应（高级封装）
         *
         * @returns {Promise<string>} 完整的响应文本
         */
        sendAndStream(agentId, prompt, {
            onText, onThinking, onToolCall, onStatus, onError, timeout = 180000
        } = {}) {
            return new Promise(async (resolve, reject) => {
                let responseText = '';
                let finished = false;
                let timer = null;
                let sub = null;

                function finish(text) {
                    if (finished) return;
                    finished = true;
                    if (timer) clearTimeout(timer);
                    if (sub) sub.close();
                    resolve(text);
                }

                function resetTimer() {
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => {
                        if (!finished) {
                            if (sub) sub.close();
                            if (responseText) {
                                resolve(responseText);
                            } else {
                                reject(new Error(`Response timeout (${timeout / 1000}s)`));
                            }
                        }
                    }, timeout);
                }

                try {
                    const { runId } = await this.sendPrompt(agentId, prompt);

                    sub = this.subscribe(agentId, {
                        onText: (content, rid) => {
                            if (rid && rid !== runId) return;
                            resetTimer();
                            responseText += content;
                            onText?.(content, responseText);
                        },
                        onThinking: (text, rid) => {
                            if (rid && rid !== runId) return;
                            resetTimer();
                            onThinking?.(text);
                        },
                        onToolCall: (data) => {
                            if (data.runId && data.runId !== runId) return;
                            resetTimer();
                            onToolCall?.(data);
                        },
                        onStatus: (data) => {
                            if (data.runId && data.runId !== runId) return;
                            if (data.status === 'finished' || data.status === 'error' || data.status === 'cancelled') {
                                if (!responseText && data.result) {
                                    responseText = data.result;
                                    onText?.(data.result, data.result);
                                }
                                onStatus?.(data);
                                finish(responseText);
                            }
                        },
                        onAgentStatus: (data) => {
                            if (data.status === 'idle' || data.status === 'error') {
                                if (!responseText) {
                                    this.getHistory(agentId).then(history => {
                                        const last = history[history.length - 1];
                                        if (last?.resultSummary) {
                                            responseText = last.resultSummary;
                                            onText?.(last.resultSummary, last.resultSummary);
                                        }
                                        finish(responseText);
                                    }).catch(() => finish(responseText));
                                } else {
                                    finish(responseText);
                                }
                            }
                        },
                        onError: (msg) => {
                            onError?.(msg);
                        },
                    });

                    resetTimer();
                } catch (err) {
                    reject(err);
                }
            });
        }
    }

    window.BridgeSDK = new BridgeSDK();
})();
