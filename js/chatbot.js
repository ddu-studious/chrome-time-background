/**
 * Chatbot — 对接 VIP Brain 智能体平台 (AG-UI 协议)
 *
 * 协议: AG-UI (https://docs.ag-ui.com/)
 * 后端: VIP Brain API — POST /agui/run/{agentId} (SSE 流式)
 * 认证: X-Vip-Brain-Api-Token 请求头
 *
 * 与 Agent 矩阵(cursor-bridge)完全独立，各自对接不同后端。
 */
(function () {
    'use strict';

    const STORAGE_KEY_CONFIG = 'chatbotVipBrainConfig';
    const STORAGE_KEY_AGENTS = 'chatbotAgentsConfig';
    const HISTORY_KEY = 'chatbotHistory';
    const MAX_HISTORY = 200;

    const DEFAULT_CONFIG = {
        apiUrl: '',
        userId: '',
        model: '',
    };

    const DEFAULT_AGENTS = [
        { id: 'general', name: '通用', icon: 'fas fa-robot', color: '#58a6ff', desc: '日常问答', agentId: '', token: '' },
        { id: 'code', name: '代码', icon: 'fas fa-code', color: '#7ee787', desc: '编程', agentId: '', token: '' },
        { id: 'writer', name: '写作', icon: 'fas fa-pen', color: '#d2a8ff', desc: '文案', agentId: '', token: '' },
        { id: 'analyst', name: '分析', icon: 'fas fa-chart-bar', color: '#ffa657', desc: '数据', agentId: '', token: '' },
    ];

    let config = { ...DEFAULT_CONFIG };
    let agents = [];
    let currentAgentId = 'general';
    let isOpen = false;
    let messageHistory = [];
    let threadId = null;
    let isStreaming = false;
    let currentAbortController = null;

    let overlay, panel, body, input, tabs, titleLabel, configOverlay;

    // ─── Storage ───

    function loadConfig() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
            if (saved) Object.assign(config, JSON.parse(saved));
        } catch {}
    }

    function saveConfig() {
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    }

    function loadAgents() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_AGENTS);
            agents = saved ? JSON.parse(saved) : [...DEFAULT_AGENTS];
        } catch { agents = [...DEFAULT_AGENTS]; }
    }

    function saveAgents() {
        localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(agents));
    }

    function loadHistory() {
        try {
            const saved = localStorage.getItem(HISTORY_KEY);
            messageHistory = saved ? JSON.parse(saved) : [];
        } catch { messageHistory = []; }
    }

    function saveHistory() {
        if (messageHistory.length > MAX_HISTORY) messageHistory = messageHistory.slice(-MAX_HISTORY);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(messageHistory));
    }

    function genId(prefix = 'msg') {
        return `${prefix}-${Date.now()}`;
    }

    function getThreadId() {
        if (!threadId) {
            const userId = config.userId || 'anonymous';
            threadId = `user_${userId}_${Date.now()}`;
        }
        return threadId;
    }

    // ─── UI Build ───

    function buildUI() {
        overlay = document.createElement('div');
        overlay.className = 'chatbot-overlay';
        overlay.addEventListener('click', closePanel);

        panel = document.createElement('div');
        panel.className = 'chatbot-panel';
        panel.innerHTML = `
            <div class="chatbot-titlebar">
                <div class="chatbot-titlebar-dots"><span></span><span></span><span></span></div>
                <div class="chatbot-titlebar-title">AI Chat — <span id="chatbot-agent-label">${currentAgentId}</span></div>
                <button class="chatbot-titlebar-close" id="chatbot-clear-btn" title="清空记录"><i class="fas fa-trash-alt"></i></button>
                <button class="chatbot-titlebar-close" id="chatbot-newchat-btn" title="新会话"><i class="fas fa-plus"></i></button>
                <button class="chatbot-titlebar-close" id="chatbot-config-btn" title="配置"><i class="fas fa-cog"></i></button>
                <button class="chatbot-titlebar-close" id="chatbot-close-btn" title="关闭 (ESC)"><i class="fas fa-times"></i></button>
            </div>
            <div class="chatbot-tabs" id="chatbot-tabs"></div>
            <div class="chatbot-body" id="chatbot-body">
                <div class="chatbot-line chatbot-system">// 终端就绪。输入消息对话，/help 查看命令</div>
            </div>
            <div class="chatbot-config-overlay" id="chatbot-config-overlay">
                <div class="chatbot-config-header">
                    <h4><i class="fas fa-cog" style="margin-right:6px"></i>VIP Brain 配置</h4>
                    <button class="chatbot-config-close" id="chatbot-config-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="chatbot-config-section">
                    <div class="chatbot-config-section-title">全局设置</div>
                    <div class="chatbot-config-row">
                        <label>API URL</label>
                        <input type="text" id="chatbot-cfg-url" class="chatbot-config-input" placeholder="http://vip-brain.qiyi.domain">
                    </div>
                    <div class="chatbot-config-row">
                        <label>User ID</label>
                        <input type="text" id="chatbot-cfg-userid" class="chatbot-config-input" placeholder="OA 邮箱前缀">
                    </div>
                    <div class="chatbot-config-row">
                        <label>模型</label>
                        <input type="text" id="chatbot-cfg-model" class="chatbot-config-input" placeholder="留空使用平台默认">
                    </div>
                    <button id="chatbot-cfg-save" class="chatbot-config-action-btn"><i class="fas fa-save"></i> 保存全局配置</button>
                </div>
                <div class="chatbot-config-section">
                    <div class="chatbot-config-section-title">Agent 列表 (每个 Agent 独立配置 agentId 和 Token)</div>
                    <div class="chatbot-config-list" id="chatbot-config-list"></div>
                    <div class="chatbot-add-form">
                        <input type="text" id="chatbot-add-name" placeholder="显示名称" style="flex:1">
                        <input type="text" id="chatbot-add-agentid" placeholder="agentId" style="flex:1">
                        <input type="password" id="chatbot-add-token" placeholder="Token" style="flex:1">
                        <button id="chatbot-add-btn"><i class="fas fa-plus"></i></button>
                    </div>
                    <button id="chatbot-cfg-test" class="chatbot-config-action-btn" style="margin-top:6px"><i class="fas fa-plug"></i> 测试当前 Agent 连接</button>
                </div>
            </div>
            <div class="chatbot-input">
                <span class="chatbot-input-prefix">you ▸</span>
                <input type="text" id="chatbot-input" placeholder="输入消息或 /help 查看命令..." autocomplete="off">
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        body = panel.querySelector('#chatbot-body');
        input = panel.querySelector('#chatbot-input');
        tabs = panel.querySelector('#chatbot-tabs');
        titleLabel = panel.querySelector('#chatbot-agent-label');
        configOverlay = panel.querySelector('#chatbot-config-overlay');

        panel.querySelector('#chatbot-close-btn').addEventListener('click', closePanel);
        panel.querySelector('#chatbot-config-btn').addEventListener('click', toggleConfig);
        panel.querySelector('#chatbot-clear-btn').addEventListener('click', clearChat);
        panel.querySelector('#chatbot-newchat-btn').addEventListener('click', newChat);
        panel.querySelector('#chatbot-config-close').addEventListener('click', () => configOverlay.classList.remove('visible'));
        panel.querySelector('#chatbot-cfg-save').addEventListener('click', saveConfigFromUI);
        panel.querySelector('#chatbot-cfg-test').addEventListener('click', testConnection);
        panel.querySelector('#chatbot-add-btn').addEventListener('click', addAgent);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && isOpen) closePanel();
        });

        renderTabs();
        restoreHistory();
        populateConfigUI();
        checkConfigStatus();
    }

    function populateConfigUI() {
        const $ = (id) => panel.querySelector(`#${id}`);
        $('chatbot-cfg-url').value = config.apiUrl || '';
        $('chatbot-cfg-userid').value = config.userId || '';
        $('chatbot-cfg-model').value = config.model || '';
    }

    function saveConfigFromUI() {
        const $ = (id) => panel.querySelector(`#${id}`).value.trim();
        config.apiUrl = $('chatbot-cfg-url').replace(/\/$/, '');
        config.userId = $('chatbot-cfg-userid');
        config.model = $('chatbot-cfg-model');
        saveConfig();
        addLine(`<span class="chatbot-system">// 全局配置已保存</span>`);
    }

    function getActiveAgentConfig() {
        return agents.find(a => a.id === currentAgentId) || {};
    }

    function checkConfigStatus() {
        const missing = [];
        if (!config.apiUrl) missing.push('API URL');
        if (!config.userId) missing.push('User ID');
        const agentCfg = getActiveAgentConfig();
        if (!agentCfg.agentId) missing.push(`当前Agent(${currentAgentId})的 agentId`);
        if (!agentCfg.token) missing.push(`当前Agent(${currentAgentId})的 Token`);

        if (missing.length > 0) {
            addLine(`<span class="chatbot-error">✗ 缺少配置: ${missing.join(', ')}</span>`);
            addLine(`<span class="chatbot-system">// 点击右上角 ⚙ 进行配置，或输入 /config</span>`);
        } else {
            addLine(`<span class="chatbot-system">// VIP Brain 已配置 ✓ | Agent: ${agentCfg.agentId} (${currentAgentId})</span>`);
            addLine(`<span class="chatbot-prompt">agent@${currentAgentId} ▸</span> 你好，有什么可以帮你的？`);
        }
    }

    async function testConnection() {
        const agentCfg = getActiveAgentConfig();
        if (!config.apiUrl || !agentCfg.token || !agentCfg.agentId) {
            addLine(`<span class="chatbot-error">✗ 请先完成配置: 全局 API URL + 当前 Agent 的 agentId 和 Token</span>`);
            return;
        }

        addLine(`<span class="chatbot-system">// 正在测试 ${agentCfg.name || currentAgentId} (${agentCfg.agentId}) 连接...</span>`);

        try {
            const url = `${config.apiUrl}/vipbrain/run-json/${agentCfg.agentId}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Vip-Brain-Api-Token': agentCfg.token,
                },
                body: JSON.stringify({
                    threadId: `test_${Date.now()}`,
                    runId: `run-test-${Date.now()}`,
                    forwardedProps: { userId: config.userId || 'test' },
                    messages: [{
                        id: genId(),
                        role: 'user',
                        content: [{ type: 'text', text: '你好' }],
                    }],
                }),
                signal: AbortSignal.timeout(15000),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.code === 'A00000') {
                    addLine(`<span style="color:#7ee787">✓ ${agentCfg.name} 连接成功! 回复: "${(data.data?.content || '').substring(0, 50)}..."</span>`);
                } else {
                    addLine(`<span class="chatbot-error">✗ 业务错误: ${data.msg} (${data.code})</span>`);
                }
            } else {
                addLine(`<span class="chatbot-error">✗ HTTP ${res.status}: ${await res.text().catch(() => '')}</span>`);
            }
        } catch (err) {
            addLine(`<span class="chatbot-error">✗ 连接失败: ${err.message}</span>`);
        }
    }

    function clearChat() {
        body.innerHTML = '<div class="chatbot-line chatbot-system">// 已清空</div>';
        messageHistory = messageHistory.filter(m => m.agentId !== currentAgentId);
        saveHistory();
    }

    function newChat() {
        threadId = null;
        addLine(`<span class="chatbot-system">// ─── 新会话 ───</span>`);
    }

    // ─── Panel Controls ───

    function openPanel() {
        isOpen = true;
        overlay.classList.add('open');
        panel.classList.add('open');
        setTimeout(() => input.focus(), 100);
    }

    function closePanel() {
        isOpen = false;
        overlay.classList.remove('open');
        panel.classList.remove('open');
        configOverlay.classList.remove('visible');
    }

    function toggleConfig() {
        configOverlay.classList.toggle('visible');
        if (configOverlay.classList.contains('visible')) {
            populateConfigUI();
            renderConfigList();
        }
    }

    // ─── Tabs & Agents ───

    function renderTabs() {
        tabs.innerHTML = agents.map(a => `
            <div class="chatbot-tab ${a.id === currentAgentId ? 'active' : ''}" data-id="${a.id}">
                <i class="${a.icon}"></i> ${a.name}
            </div>
        `).join('');
        tabs.querySelectorAll('.chatbot-tab').forEach(el => {
            el.addEventListener('click', () => switchAgent(el.dataset.id));
        });
        titleLabel.textContent = currentAgentId;
    }

    function renderConfigList() {
        const list = panel.querySelector('#chatbot-config-list');
        list.innerHTML = agents.map(a => {
            const isActive = a.id === currentAgentId;
            const statusDot = (a.agentId && a.token) ? '🟢' : '🔴';
            return `
            <div class="chatbot-config-item ${isActive ? 'active' : ''}" data-id="${a.id}">
                <div class="chatbot-config-item-icon" style="background:${a.color}"><i class="${a.icon}"></i></div>
                <div class="chatbot-config-item-info" style="flex:1">
                    <div class="chatbot-config-item-name">${statusDot} ${a.name} ${isActive ? '← 当前' : ''}</div>
                    <div class="chatbot-config-item-fields">
                        <input type="text" class="chatbot-config-input chatbot-agent-field" data-id="${a.id}" data-field="agentId" value="${a.agentId || ''}" placeholder="agentId (必填)">
                        <input type="password" class="chatbot-config-input chatbot-agent-field" data-id="${a.id}" data-field="token" value="${a.token || ''}" placeholder="Token (必填)">
                    </div>
                </div>
                <div class="chatbot-config-item-actions">
                    <button class="chatbot-config-item-btn save" data-id="${a.id}" title="保存"><i class="fas fa-check"></i></button>
                    <button class="chatbot-config-item-btn delete" data-id="${a.id}" title="删除"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('.chatbot-config-item-btn.save').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); saveAgentField(btn.dataset.id); });
        });
        list.querySelectorAll('.chatbot-config-item-btn.delete').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); removeAgent(btn.dataset.id); });
        });
    }

    function saveAgentField(agentLocalId) {
        const agent = agents.find(a => a.id === agentLocalId);
        if (!agent) return;
        const fields = panel.querySelectorAll(`.chatbot-agent-field[data-id="${agentLocalId}"]`);
        fields.forEach(f => { agent[f.dataset.field] = f.value.trim(); });
        saveAgents();
        renderConfigList();
        addLine(`<span class="chatbot-system">// ${agent.name} 配置已保存: agentId=${agent.agentId || '(空)'}</span>`);
    }

    function addAgent() {
        const name = panel.querySelector('#chatbot-add-name').value.trim();
        const agentId = panel.querySelector('#chatbot-add-agentid').value.trim();
        const token = panel.querySelector('#chatbot-add-token').value.trim();
        if (!name || !agentId) {
            addLine(`<span class="chatbot-error">✗ 名称和 agentId 为必填</span>`);
            return;
        }
        const localId = agentId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 20) || `agent_${Date.now()}`;
        if (agents.find(a => a.id === localId)) {
            addLine(`<span class="chatbot-error">✗ ID "${localId}" 已存在，请换个 agentId</span>`);
            return;
        }
        const colors = ['#58a6ff', '#7ee787', '#d2a8ff', '#ffa657', '#f97316', '#ec4899'];
        agents.push({ id: localId, name, icon: 'fas fa-robot', color: colors[agents.length % colors.length], desc: '', agentId, token });
        saveAgents();
        renderTabs();
        renderConfigList();
        panel.querySelector('#chatbot-add-name').value = '';
        panel.querySelector('#chatbot-add-agentid').value = '';
        panel.querySelector('#chatbot-add-token').value = '';
        addLine(`<span class="chatbot-system">// 已添加: ${name} → ${agentId} ${token ? '(Token ✓)' : '(Token 未配置)'}</span>`);
    }

    function removeAgent(id) {
        if (agents.length <= 1) return;
        agents = agents.filter(a => a.id !== id);
        saveAgents();
        if (currentAgentId === id) switchAgent(agents[0].id);
        renderTabs();
        renderConfigList();
    }

    function switchAgent(id) {
        if (id === currentAgentId) return;
        const agent = agents.find(a => a.id === id);
        if (!agent) return;
        currentAgentId = id;
        threadId = null;
        renderTabs();
        addLine(`<span class="chatbot-system">// 已切换: ${agent.name} (${id})${agent.agentId ? ' → agentId: ' + agent.agentId : ''}</span>`);
    }

    // ─── Message Handling ───

    function handleSend() {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';

        if (text.startsWith('/')) { handleCommand(text); return; }

        addLine(`<span class="chatbot-prompt-user">you ▸</span> ${escapeHtml(text)}`);
        recordMessage('user', text);
        sendToVipBrain(text);
    }

    function handleCommand(cmd) {
        const parts = cmd.slice(1).split(/\s+/);
        const action = parts[0];
        switch (action) {
            case 'help':
                addLine(`<span class="chatbot-system">// 命令:</span>`);
                addLine(`<span class="chatbot-system">//   /config   — 打开配置</span>`);
                addLine(`<span class="chatbot-system">//   /status   — 查看状态</span>`);
                addLine(`<span class="chatbot-system">//   /switch &lt;id&gt; — 切换 Agent</span>`);
                addLine(`<span class="chatbot-system">//   /list     — 列表</span>`);
                addLine(`<span class="chatbot-system">//   /new      — 新会话</span>`);
                addLine(`<span class="chatbot-system">//   /clear    — 清空</span>`);
                addLine(`<span class="chatbot-system">//   /stop     — 中断当前流</span>`);
                addLine(`<span class="chatbot-system">//   /test     — 测试连接</span>`);
                break;
            case 'config': toggleConfig(); break;
            case 'status': {
                const aCfg = getActiveAgentConfig();
                addLine(`<span class="chatbot-system">// [全局] API: ${config.apiUrl || '未配置'} | User: ${config.userId || '未配置'}</span>`);
                addLine(`<span class="chatbot-system">// [Agent] ${aCfg.name || currentAgentId}: agentId=${aCfg.agentId || '未配置'} | Token=${aCfg.token ? '✓' : '✗'}</span>`);
                addLine(`<span class="chatbot-system">// Thread: ${threadId || '未开始'}</span>`);
                break;
            }
            case 'switch':
                if (parts[1] && agents.find(a => a.id === parts[1])) switchAgent(parts[1]);
                else addLine(`<span class="chatbot-error">✗ 可用: ${agents.map(a => a.id).join(', ')}</span>`);
                break;
            case 'list':
                agents.forEach(a => {
                    const mark = a.id === currentAgentId ? ' ← 当前' : '';
                    addLine(`<span class="chatbot-highlight">  ${a.id}</span> — ${a.name}${a.agentId ? ' (' + a.agentId + ')' : ''}${mark}`);
                });
                break;
            case 'new': newChat(); break;
            case 'clear': clearChat(); break;
            case 'stop':
                if (currentAbortController) { currentAbortController.abort(); addLine(`<span class="chatbot-system">// 已中断</span>`); }
                break;
            case 'test': testConnection(); break;
            default:
                addLine(`<span class="chatbot-error">✗ 未知: /${action}. /help 查看</span>`);
        }
    }

    // ─── Core: VIP Brain AG-UI SSE 流式请求 ───

    async function sendToVipBrain(text) {
        const agentCfg = getActiveAgentConfig();

        if (!config.apiUrl || !agentCfg.token || !agentCfg.agentId) {
            addLine(`<span class="chatbot-error">✗ 配置不完整: 需要全局 API URL + 当前 Agent(${currentAgentId}) 的 agentId 和 Token</span>`);
            addLine(`<span class="chatbot-system">// 输入 /config 进行设置</span>`);
            return;
        }

        if (isStreaming) {
            addLine(`<span class="chatbot-error">✗ 正在响应中，输入 /stop 可中断</span>`);
            return;
        }

        isStreaming = true;
        showThinking();

        const tid = getThreadId();
        const runId = genId('run');
        const msgId = genId('msg');

        const requestBody = {
            threadId: tid,
            runId: runId,
            forwardedProps: { userId: config.userId },
            messages: [{
                id: msgId,
                role: 'user',
                content: [{ type: 'text', text }],
            }],
        };

        if (config.model) {
            requestBody.forwardedProps['agent.model.name'] = config.model;
        }

        const url = `${config.apiUrl}/agui/run/${agentCfg.agentId}`;
        currentAbortController = new AbortController();

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                    'X-Vip-Brain-Api-Token': agentCfg.token,
                },
                body: JSON.stringify(requestBody),
                signal: currentAbortController.signal,
            });

            removeThinking();

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                addLine(`<span class="chatbot-error">✗ HTTP ${res.status}: ${errText.substring(0, 100)}</span>`);
                isStreaming = false;
                return;
            }

            await processSSEStream(res.body);
        } catch (err) {
            removeThinking();
            if (err.name === 'AbortError') {
                addLine(`<span class="chatbot-system">// 请求已中断</span>`);
            } else {
                console.error('[Chatbot] VIP Brain error:', err);
                addLine(`<span class="chatbot-error">✗ 请求失败: ${err.message}</span>`);
            }
        } finally {
            isStreaming = false;
            currentAbortController = null;
        }
    }

    // ─── AG-UI SSE Event Parser ───

    async function processSSEStream(readableStream) {
        const reader = readableStream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let responseText = '';
        let responseDiv = null;
        let currentMessageId = null;

        let renderTimer = null;
        let lastRenderTime = 0;
        const RENDER_THROTTLE = 80;

        function ensureResponseDiv() {
            if (!responseDiv) {
                addLine(`<span class="chatbot-prompt">agent@${currentAgentId} ▸</span>`);
                responseDiv = document.createElement('div');
                responseDiv.className = 'chatbot-line';
                const inner = document.createElement('div');
                inner.className = 'chatbot-response chatbot-response-streaming';
                responseDiv.appendChild(inner);
                body.appendChild(responseDiv);
            }
        }

        function updateResponseUI() {
            if (!responseDiv) return;
            const now = Date.now();
            if (now - lastRenderTime < RENDER_THROTTLE) {
                if (!renderTimer) {
                    renderTimer = setTimeout(() => { renderTimer = null; doRender(); }, RENDER_THROTTLE);
                }
                return;
            }
            doRender();
        }

        function doRender() {
            if (!responseDiv) return;
            lastRenderTime = Date.now();
            const el = responseDiv.querySelector('.chatbot-response');
            el.innerHTML = formatResponse(responseText);
            requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
        }

        function finalRender() {
            if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
            if (!responseDiv) return;
            const el = responseDiv.querySelector('.chatbot-response');
            el.classList.remove('chatbot-response-streaming');
            el.innerHTML = formatResponse(responseText);
            requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
        }

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let eventType = '';
                let eventData = '';

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        eventType = line.slice(6).trim();
                    } else if (line.startsWith('data:')) {
                        eventData = line.slice(5).trim();
                    } else if (line === '' && eventData) {
                        handleSSEEvent(eventType, eventData);
                        eventType = '';
                        eventData = '';
                    } else if (!line.startsWith('event:') && !line.startsWith('data:') && !line.startsWith(':') && line.trim()) {
                        try {
                            handleSSEEvent('', line.trim());
                        } catch {}
                    }
                }

                if (eventData && !buffer) {
                    handleSSEEvent(eventType, eventData);
                    eventType = '';
                    eventData = '';
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('[Chatbot] SSE read error:', err);
            }
        }

        finalRender();

        if (responseText) {
            recordMessage('bot', responseText);
        } else if (!responseDiv) {
            addLine(`<span class="chatbot-error">✗ 未收到回复</span>`);
        }

        function handleSSEEvent(type, dataStr) {
            let data;
            try { data = JSON.parse(dataStr); } catch { return; }

            const evtType = data.type || type;

            switch (evtType) {
                case 'TEXT_MESSAGE_START':
                case 'TextMessageStart':
                    currentMessageId = data.messageId;
                    break;

                case 'TEXT_MESSAGE_CONTENT':
                case 'TextMessageContent':
                    if (data.delta) {
                        ensureResponseDiv();
                        responseText += data.delta;
                        updateResponseUI();
                    }
                    break;

                case 'TEXT_MESSAGE_END':
                case 'TextMessageEnd':
                    currentMessageId = null;
                    break;

                case 'TEXT_MESSAGE_CHUNK':
                case 'TextMessageChunk':
                    if (data.delta) {
                        ensureResponseDiv();
                        responseText += data.delta;
                        updateResponseUI();
                    }
                    break;

                case 'TOOL_CALL_START':
                case 'ToolCallStart':
                    addLine(`<span class="chatbot-system">// ⚙ 调用工具: ${data.name || data.toolName || '...'}</span>`);
                    break;

                case 'TOOL_CALL_END':
                case 'ToolCallEnd':
                    break;

                case 'RUN_STARTED':
                case 'RunStarted':
                    break;

                case 'RUN_FINISHED':
                case 'RunFinished':
                    break;

                case 'RUN_ERROR':
                case 'RunError':
                    addLine(`<span class="chatbot-error">✗ Agent 错误: ${data.message || data.error || '未知'}</span>`);
                    break;

                case 'CUSTOM':
                case 'Custom':
                    handleCustomEvent(data);
                    break;

                case 'STATE_DELTA':
                case 'StateDelta':
                    break;

                default:
                    if (data.delta) {
                        ensureResponseDiv();
                        responseText += data.delta;
                        updateResponseUI();
                    } else if (data.content && typeof data.content === 'string') {
                        ensureResponseDiv();
                        responseText += data.content;
                        updateResponseUI();
                    }
                    break;
            }
        }
    }

    function handleCustomEvent(data) {
        if (data.name === 'HITL_WAIT_CONFIRM') {
            const tools = data.value?.pendingTools || [];
            addLine(`<span style="color:#fbbf24">⚠ 需要人工确认:</span>`);
            tools.forEach(t => {
                addLine(`<span class="chatbot-system">//   工具: ${t.name} ${t.dangerous ? '(危险操作)' : ''}</span>`);
            });
            addLine(`<span class="chatbot-system">// HITL 确认功能待集成，请在平台端操作</span>`);
        }
    }

    // ─── UI Helpers ───

    function addLine(html) {
        const div = document.createElement('div');
        div.className = 'chatbot-line';
        div.innerHTML = html;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function showThinking() {
        const div = document.createElement('div');
        div.className = 'chatbot-line chatbot-thinking';
        div.id = 'chatbot-thinking';
        div.innerHTML = `<span class="chatbot-prompt">agent@${currentAgentId}</span> <span class="chatbot-thinking-dots"><span></span><span></span><span></span></span>`;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function removeThinking() {
        const el = document.getElementById('chatbot-thinking');
        if (el) el.remove();
    }

    function recordMessage(role, content) {
        messageHistory.push({ agentId: currentAgentId, role, content, ts: Date.now() });
        saveHistory();
    }

    function restoreHistory() {
        const recent = messageHistory.filter(m => m.agentId === currentAgentId).slice(-20);
        if (recent.length > 0) {
            addLine(`<span class="chatbot-system">// 恢复最近 ${recent.length} 条记录</span>`);
            recent.forEach(m => {
                if (m.role === 'user') {
                    addLine(`<span class="chatbot-prompt-user">you ▸</span> ${escapeHtml(m.content)}`);
                } else {
                    addLine(`<span class="chatbot-prompt">agent@${m.agentId} ▸</span>`);
                    addLine(`<div class="chatbot-response">${formatResponse(m.content)}</div>`);
                }
            });
        }
    }

    function formatResponse(text) {
        return renderMarkdown(text);
    }

    function renderMarkdown(src) {
        let html = '';
        const lines = src.split('\n');
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Code block
            if (line.trimStart().startsWith('```')) {
                let code = '';
                i++;
                while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
                    code += escapeHtml(lines[i]) + '\n';
                    i++;
                }
                i++; // skip closing ```
                html += `<pre><code>${code}</code></pre>`;
                continue;
            }

            // Table
            if (line.includes('|') && line.trim().startsWith('|')) {
                const tableLines = [];
                while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
                    tableLines.push(lines[i]);
                    i++;
                }
                html += renderTable(tableLines);
                continue;
            }

            // Heading
            const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                html += `<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`;
                i++;
                continue;
            }

            // Blockquote
            if (line.trimStart().startsWith('>')) {
                let quote = '';
                while (i < lines.length && lines[i].trimStart().startsWith('>')) {
                    quote += lines[i].replace(/^>\s?/, '') + '\n';
                    i++;
                }
                html += `<blockquote>${inlineFormat(quote.trim())}</blockquote>`;
                continue;
            }

            // Unordered list
            if (/^\s*[-*+]\s/.test(line)) {
                let items = '';
                while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
                    items += `<li>${inlineFormat(lines[i].replace(/^\s*[-*+]\s/, ''))}</li>`;
                    i++;
                }
                html += `<ul>${items}</ul>`;
                continue;
            }

            // Ordered list
            if (/^\s*\d+\.\s/.test(line)) {
                let items = '';
                while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
                    items += `<li>${inlineFormat(lines[i].replace(/^\s*\d+\.\s/, ''))}</li>`;
                    i++;
                }
                html += `<ol>${items}</ol>`;
                continue;
            }

            // HR
            if (/^[-*_]{3,}\s*$/.test(line.trim())) {
                html += '<hr>';
                i++;
                continue;
            }

            // Empty line
            if (line.trim() === '') {
                i++;
                continue;
            }

            // Paragraph
            let para = '';
            while (i < lines.length && lines[i].trim() !== '' && !lines[i].trimStart().startsWith('#') && !lines[i].trimStart().startsWith('```') && !lines[i].trimStart().startsWith('>') && !/^\s*[-*+]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i]) && !(lines[i].includes('|') && lines[i].trim().startsWith('|'))) {
                para += (para ? ' ' : '') + lines[i];
                i++;
            }
            html += `<p>${inlineFormat(para)}</p>`;
        }

        return html;
    }

    function renderTable(lines) {
        if (lines.length < 2) return lines.map(l => `<p>${inlineFormat(l)}</p>`).join('');

        const parseRow = (line) => line.split('|').slice(1, -1).map(c => c.trim());
        const headers = parseRow(lines[0]);

        // skip separator line (|---|---|)
        const startRow = /^[\s|:-]+$/.test(lines[1]) ? 2 : 1;

        let table = '<table><thead><tr>';
        headers.forEach(h => { table += `<th>${inlineFormat(h)}</th>`; });
        table += '</tr></thead><tbody>';

        for (let r = startRow; r < lines.length; r++) {
            const cells = parseRow(lines[r]);
            if (cells.length === 0 || cells.every(c => /^[-:]+$/.test(c))) continue;
            table += '<tr>';
            cells.forEach(c => { table += `<td>${inlineFormat(c)}</td>`; });
            table += '</tr>';
        }

        table += '</tbody></table>';
        return table;
    }

    function inlineFormat(text) {
        return escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            .replace(/~~(.+?)~~/g, '<del>$1</del>');
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ─── Public API ───

    window.Chatbot = {
        open: () => { if (!isOpen) openPanel(); },
        close: closePanel,
        toggle: () => { isOpen ? closePanel() : openPanel(); },
        isOpen: () => isOpen,
        switchAgent: (id) => switchAgent(id),
        getAgents: () => [...agents],
    };

    // ─── Init ───

    function init() {
        loadConfig();
        loadAgents();
        loadHistory();
        buildUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
