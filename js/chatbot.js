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
    const HISTORY_ARCHIVE_KEY = 'chatbotHistoryArchived';
    const MAX_HISTORY = 200;
    const CHAT_SESSION_TITLE = '网易云 UI 评审';
    const CHAT_WORKSPACE = 'chrome-time-background';
    const CHAT_ATTACHMENTS = ['music-controller.js', 'music-view.js'];
    const DISPLAY_DEFAULT_MODEL = 'GPT-5.6';

    const DEFAULT_CONFIG = {
        apiUrl: '',
        userId: '',
        model: '',
        temperature: 0.2,
        systemPrompt: '你是产品体验评审官。先引用证据，再给出可验证的 UI 建议。',
        contextLimit: '64K',
        toolReadMode: 'allow',
        toolBrowserMode: 'ask',
        toolWriteMode: 'ask',
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
    let archivedHistoryKeys = new Set();
    let threadId = null;
    let isStreaming = false;
    let currentAbortController = null;
    let returnFocus = null;
    let configReturnFocus = null;
    let viewReturnFocus = null;
    let backgroundInertSiblings = [];
    let lastFailedInput = '';
    let lastFailureStage = '';
    let lastPartialResponse = '';
    let historyQuery = '';
    let historyShowArchived = false;
    let selectedEvidenceIds = new Set(['structure', 'identity']);

    let overlay, panel, body, input, tabs, titleLabel, configOverlay, viewOverlay;

    function setProductPage(page) {
        window.ProductUIV5?.setBusinessPage?.('ai-chat', page);
    }

    function baseProductPage() {
        const latest = [...messageHistory].reverse().find(message => message.agentId === currentAgentId && (message.role === 'assistant' || message.role === 'bot'));
        return latest?.content?.includes('```') ? 'code-answer' : 'default';
    }

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
            const archived = localStorage.getItem(HISTORY_ARCHIVE_KEY);
            archivedHistoryKeys = new Set(archived ? JSON.parse(archived) : []);
        } catch { messageHistory = []; }
    }

    function saveHistory() {
        if (messageHistory.length > MAX_HISTORY) messageHistory = messageHistory.slice(-MAX_HISTORY);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(messageHistory));
        localStorage.setItem(HISTORY_ARCHIVE_KEY, JSON.stringify([...archivedHistoryKeys]));
    }

    function effectiveModel() {
        return config.model || DISPLAY_DEFAULT_MODEL;
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
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'chatbot-dialog-title');
        panel.setAttribute('aria-hidden', 'true');
        panel.tabIndex = -1;
        panel.inert = true;
        panel.innerHTML = `
            <div class="chatbot-titlebar">
                <div class="chatbot-titlebar-dots"><span></span><span></span><span></span></div>
                <div class="chatbot-titlebar-title" id="chatbot-dialog-title"><strong>${CHAT_SESSION_TITLE}</strong><span>${CHAT_WORKSPACE} · <b id="chatbot-model-label">${DISPLAY_DEFAULT_MODEL}</b> · <i id="chatbot-agent-label">${currentAgentId}</i></span></div>
                <button class="chatbot-titlebar-close" id="chatbot-clear-btn" title="清空记录" aria-label="清空当前对话"><i class="fas fa-trash-alt" aria-hidden="true"></i></button>
                <button class="chatbot-titlebar-close" id="chatbot-newchat-btn" title="新会话" aria-label="新建会话"><i class="fas fa-plus" aria-hidden="true"></i></button>
                <button class="chatbot-titlebar-close" id="chatbot-history-btn" title="历史会话" aria-label="打开历史会话"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i></button>
                <button class="chatbot-titlebar-close" id="chatbot-multi-btn" title="多 Agent" aria-label="打开多 Agent 协作"><i class="fas fa-users-gear" aria-hidden="true"></i></button>
                <button class="chatbot-titlebar-close" id="chatbot-config-btn" title="配置" aria-label="打开 AI 对话配置"><i class="fas fa-cog" aria-hidden="true"></i></button>
                <button class="chatbot-titlebar-close" id="chatbot-close-btn" title="关闭 (ESC)" aria-label="关闭 AI 对话"><i class="fas fa-times" aria-hidden="true"></i></button>
            </div>
            <div class="chatbot-tabs" id="chatbot-tabs"></div>
            <div class="chatbot-contextbar" aria-label="当前会话上下文">
                <div class="chatbot-context-copy"><strong>评审上下文</strong><span>附件只作为当前会话引用，不会自动外传</span></div>
                <div class="chatbot-attachments">${CHAT_ATTACHMENTS.map(file => `<span><i class="fas fa-file-code" aria-hidden="true"></i>${file}</span>`).join('')}</div>
                <div class="chatbot-context-meter" title="上下文额度"><span id="chatbot-context-used">0</span><small>/ ${config.contextLimit || '64K'}</small></div>
            </div>
            <div class="chatbot-body" id="chatbot-body">
                <section class="chatbot-welcome" aria-label="会话建议">
                    <div><span class="chatbot-eyebrow">设计评审工作台</span><h2>${CHAT_SESSION_TITLE}</h2><p>围绕播放器、队列和底栏的歌曲身份一致性，保留证据后再形成结论。</p></div>
                    <div class="chatbot-suggestions" role="group" aria-label="建议问题">
                        <button type="button" data-chatbot-suggest="检查播放器、队列与底栏的歌曲身份是否一致">检查歌曲身份</button>
                        <button type="button" data-chatbot-suggest="根据 music-view.js 给出三条可验证的 UI 改进建议">评审 UI 层级</button>
                        <button type="button" data-chatbot-suggest="分析当前代码变更的风险，并给出最小验证清单">生成验证清单</button>
                    </div>
                </section>
                <div class="chatbot-line chatbot-system">// 终端就绪。输入消息对话，/help 查看命令</div>
            </div>
            <div class="chatbot-config-overlay" id="chatbot-config-overlay" role="dialog" aria-modal="true" aria-labelledby="chatbot-config-title" aria-hidden="true" tabindex="-1">
                <div class="chatbot-config-header">
                    <h4 id="chatbot-config-title"><i class="fas fa-cog" style="margin-right:6px"></i>VIP Brain 配置</h4>
                    <button class="chatbot-config-close" id="chatbot-config-close" aria-label="关闭 AI 对话配置"><i class="fas fa-times" aria-hidden="true"></i></button>
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
                        <input type="text" id="chatbot-cfg-model" class="chatbot-config-input" placeholder="${DISPLAY_DEFAULT_MODEL}">
                    </div>
                    <div class="chatbot-config-row"><label for="chatbot-cfg-temperature">温度</label><input type="range" id="chatbot-cfg-temperature" min="0" max="1" step="0.1"><output id="chatbot-cfg-temperature-output">0.2</output></div>
                    <div class="chatbot-config-row"><label for="chatbot-cfg-context">上下文</label><select id="chatbot-cfg-context" class="chatbot-config-input"><option>32K</option><option>64K</option><option>128K</option></select></div>
                    <div class="chatbot-config-row chatbot-config-row-stack"><label for="chatbot-cfg-system">系统提示</label><textarea id="chatbot-cfg-system" class="chatbot-config-input" rows="4"></textarea></div>
                    <fieldset class="chatbot-tool-permissions"><legend>工具权限</legend><label><span>读取工作区</span><select id="chatbot-tool-read"><option value="allow">允许</option><option value="ask">每次询问</option><option value="deny">禁止</option></select></label><label><span>浏览器操作</span><select id="chatbot-tool-browser"><option value="ask">每次询问</option><option value="allow">允许</option><option value="deny">禁止</option></select></label><label><span>修改文件</span><select id="chatbot-tool-write"><option value="ask">每次询问</option><option value="deny">禁止</option></select></label></fieldset>
                    <aside class="chatbot-config-preview" aria-live="polite"><span>即时预览</span><strong id="chatbot-config-preview-model">${DISPLAY_DEFAULT_MODEL} · 0.2</strong><small id="chatbot-config-preview-scope">读取允许 · 浏览器询问 · 写入询问</small></aside>
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
            <div class="chatbot-v5-view" id="chatbot-v5-view" role="dialog" aria-modal="true" aria-hidden="true" tabindex="-1"></div>
            <div class="chatbot-input">
                <span class="chatbot-input-prefix">you ▸</span>
                <input type="text" id="chatbot-input" placeholder="输入消息或 /help 查看命令..." autocomplete="off">
                <button type="button" id="chatbot-stop-btn" class="chatbot-stop-btn" aria-label="停止生成" hidden><i class="fas fa-stop" aria-hidden="true"></i><span>停止</span></button>
                <button type="button" id="chatbot-send-btn" class="chatbot-send-btn" aria-label="发送消息"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        body = panel.querySelector('#chatbot-body');
        input = panel.querySelector('#chatbot-input');
        tabs = panel.querySelector('#chatbot-tabs');
        titleLabel = panel.querySelector('#chatbot-agent-label');
        configOverlay = panel.querySelector('#chatbot-config-overlay');
        viewOverlay = panel.querySelector('#chatbot-v5-view');

        panel.querySelector('#chatbot-close-btn').addEventListener('click', closePanel);
        panel.querySelector('#chatbot-config-btn').addEventListener('click', toggleConfig);
        panel.querySelector('#chatbot-history-btn').addEventListener('click', showHistoryView);
        panel.querySelector('#chatbot-multi-btn').addEventListener('click', showMultiAgentView);
        panel.querySelector('#chatbot-clear-btn').addEventListener('click', clearChat);
        panel.querySelector('#chatbot-newchat-btn').addEventListener('click', newChat);
        panel.querySelector('#chatbot-config-close').addEventListener('click', closeConfig);
        panel.querySelector('#chatbot-cfg-save').addEventListener('click', saveConfigFromUI);
        panel.querySelector('#chatbot-cfg-test').addEventListener('click', testConnection);
        panel.querySelector('#chatbot-add-btn').addEventListener('click', addAgent);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });
        panel.querySelector('#chatbot-send-btn').addEventListener('click', handleSend);
        panel.querySelector('#chatbot-stop-btn').addEventListener('click', stopStreaming);
        panel.querySelectorAll('[data-chatbot-suggest]').forEach(button => button.addEventListener('click', () => {
            input.value = button.dataset.chatbotSuggest;
            input.focus();
        }));
        ['chatbot-cfg-model','chatbot-cfg-temperature','chatbot-cfg-context','chatbot-cfg-system','chatbot-tool-read','chatbot-tool-browser','chatbot-tool-write'].forEach(id => panel.querySelector(`#${id}`)?.addEventListener('input', updateConfigPreview));
        document.addEventListener('keydown', handlePanelKeydown);

        renderTabs();
        restoreHistory();
        populateConfigUI();
        updateSessionMeta();
        checkConfigStatus();
    }

    function populateConfigUI() {
        const $ = (id) => panel.querySelector(`#${id}`);
        $('chatbot-cfg-url').value = config.apiUrl || '';
        $('chatbot-cfg-userid').value = config.userId || '';
        $('chatbot-cfg-model').value = config.model || '';
        $('chatbot-cfg-temperature').value = config.temperature ?? 0.2;
        $('chatbot-cfg-context').value = config.contextLimit || '64K';
        $('chatbot-cfg-system').value = config.systemPrompt || '';
        $('chatbot-tool-read').value = config.toolReadMode || 'allow';
        $('chatbot-tool-browser').value = config.toolBrowserMode || 'ask';
        $('chatbot-tool-write').value = config.toolWriteMode || 'ask';
        updateConfigPreview();
    }

    function saveConfigFromUI() {
        const $ = (id) => panel.querySelector(`#${id}`).value.trim();
        config.apiUrl = $('chatbot-cfg-url').replace(/\/$/, '');
        config.userId = $('chatbot-cfg-userid');
        config.model = $('chatbot-cfg-model');
        config.temperature = Number(panel.querySelector('#chatbot-cfg-temperature').value);
        config.contextLimit = panel.querySelector('#chatbot-cfg-context').value;
        config.systemPrompt = panel.querySelector('#chatbot-cfg-system').value.trim();
        config.toolReadMode = panel.querySelector('#chatbot-tool-read').value;
        config.toolBrowserMode = panel.querySelector('#chatbot-tool-browser').value;
        config.toolWriteMode = panel.querySelector('#chatbot-tool-write').value;
        saveConfig();
        updateSessionMeta();
        addLine(`<span class="chatbot-system">// 全局配置已保存</span>`);
    }

    function permissionLabel(mode) {
        return ({ allow: '允许', ask: '询问', deny: '禁止' })[mode] || '询问';
    }

    function updateConfigPreview() {
        const temperature = panel.querySelector('#chatbot-cfg-temperature')?.value || '0.2';
        const model = panel.querySelector('#chatbot-cfg-model')?.value.trim() || DISPLAY_DEFAULT_MODEL;
        const output = panel.querySelector('#chatbot-cfg-temperature-output');
        if (output) output.value = temperature;
        const preview = panel.querySelector('#chatbot-config-preview-model');
        if (preview) preview.textContent = `${model} · ${temperature} · ${panel.querySelector('#chatbot-cfg-context')?.value || '64K'}`;
        const scope = panel.querySelector('#chatbot-config-preview-scope');
        if (scope) scope.textContent = `读取${permissionLabel(panel.querySelector('#chatbot-tool-read')?.value)} · 浏览器${permissionLabel(panel.querySelector('#chatbot-tool-browser')?.value)} · 写入${permissionLabel(panel.querySelector('#chatbot-tool-write')?.value)}`;
    }

    function updateSessionMeta() {
        const model = panel.querySelector('#chatbot-model-label');
        if (model) model.textContent = effectiveModel();
        const used = panel.querySelector('#chatbot-context-used');
        if (used) used.textContent = `${Math.min(99, Math.round(messageHistory.reduce((sum, message) => sum + (message.content?.length || 0), 0) / 640))}K`;
        const limit = panel.querySelector('.chatbot-context-meter small');
        if (limit) limit.textContent = `/ ${config.contextLimit || '64K'}`;
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
        returnFocus = document.activeElement;
        isOpen = true;
        overlay.classList.add('open');
        panel.classList.add('open');
        panel.inert = false;
        panel.setAttribute('aria-hidden', 'false');
        setBackgroundInert(true);
        setProductPage(baseProductPage());
        updateSessionMeta();
        bindResponseActions(body);
        setTimeout(() => input.focus(), 100);
    }

    function closePanel() {
        isOpen = false;
        overlay.classList.remove('open');
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        panel.inert = true;
        configOverlay.classList.remove('visible');
        configOverlay.setAttribute('aria-hidden', 'true');
        viewOverlay?.classList.remove('visible');
        viewOverlay?.setAttribute('aria-hidden', 'true');
        setBackgroundInert(false);
        window.ProductUIV5?.setShellPage?.('home');
        const trigger = document.getElementById('chatbot-dock-btn');
        const insideLaunchpad = returnFocus?.closest?.('#dock-launchpad');
        const usableReturn = returnFocus?.isConnected
            && returnFocus.matches?.('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            && !insideLaunchpad;
        const returnTarget = usableReturn ? returnFocus : (trigger && getComputedStyle(trigger).display !== 'none'
            ? trigger
            : document.getElementById('dock-launchpad-btn'));
        returnTarget?.focus?.({ preventScroll: true });
        returnFocus = null;
    }

    function setBackgroundInert(active) {
        if (active) {
            if (backgroundInertSiblings.length) return;
            backgroundInertSiblings = [...document.body.children]
                .filter(child => child !== panel && child !== overlay && !child.inert);
            backgroundInertSiblings.forEach(child => { child.inert = true; });
            return;
        }
        backgroundInertSiblings.forEach(child => { child.inert = false; });
        backgroundInertSiblings = [];
    }

    function activeFocusSurface() {
        if (configOverlay?.classList.contains('visible')) return configOverlay;
        if (viewOverlay?.classList.contains('visible')) return viewOverlay;
        return panel;
    }

    function handlePanelKeydown(event) {
        if (!isOpen) return;
        if (event.key === 'Escape') {
            if (configOverlay?.classList.contains('visible')) closeConfig();
            else if (viewOverlay?.classList.contains('visible')) closeViewOverlay();
            else closePanel();
            event.preventDefault();
            return;
        }
        if (event.key !== 'Tab') return;
        const surface = activeFocusSurface();
        const focusable = [...(surface?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
            .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length);
        if (!focusable.length) { event.preventDefault(); surface?.focus?.(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!surface.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    function closeConfig() {
        configOverlay.classList.remove('visible');
        configOverlay.setAttribute('aria-hidden', 'true');
        setProductPage(baseProductPage());
        (configReturnFocus?.isConnected ? configReturnFocus : panel.querySelector('#chatbot-config-btn'))?.focus?.({ preventScroll: true });
        configReturnFocus = null;
    }

    function toggleConfig() {
        viewOverlay?.classList.remove('visible');
        viewOverlay?.setAttribute('aria-hidden', 'true');
        configOverlay.classList.toggle('visible');
        if (configOverlay.classList.contains('visible')) {
            configReturnFocus = document.activeElement;
            configOverlay.setAttribute('aria-hidden', 'false');
            setProductPage('config-drawer');
            populateConfigUI();
            renderConfigList();
            requestAnimationFrame(() => configOverlay.querySelector('#chatbot-cfg-url')?.focus({ preventScroll: true }));
        } else {
            closeConfig();
        }
    }

    function closeViewOverlay() {
        viewOverlay?.classList.remove('visible');
        viewOverlay?.setAttribute('aria-hidden', 'true');
        setProductPage(baseProductPage());
        viewReturnFocus?.focus?.({ preventScroll: true });
        viewReturnFocus = null;
    }

    function showHistoryView() {
        configOverlay.classList.remove('visible');
        configOverlay.setAttribute('aria-hidden', 'true');
        viewReturnFocus = document.activeElement;
        setProductPage('history');
        const grouped = new Map();
        messageHistory.forEach(message => {
            const day = new Date(message.ts || Date.now()).toISOString().slice(0, 10);
            const key = `${message.agentId || 'general'}|${day}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(message);
        });
        const rows = [...grouped.entries()].filter(([key, messages]) => {
            if (!historyShowArchived && archivedHistoryKeys.has(key)) return false;
            const haystack = messages.map(item => item.content || '').join(' ').toLowerCase();
            return !historyQuery || haystack.includes(historyQuery.toLowerCase());
        }).map(([key, messages]) => {
            const [agentId, day] = key.split('|');
            const last = messages[messages.length - 1];
            const agent = agents.find(item => item.id === agentId);
            const archived = archivedHistoryKeys.has(key);
            return `<article class="chatbot-v5-history-row"><button data-chatbot-agent="${escapeHtml(agentId)}"><i class="${agent?.icon || 'fas fa-robot'}"></i><div><strong>${escapeHtml(agent?.name || agentId)} · ${day}</strong><span>${escapeHtml((last?.content || '').slice(0, 90) || '暂无消息')}</span><em><b>UI 评审</b><b>${archived ? '已归档' : '本地'}</b></em></div><small>${messages.length} 条</small></button><div><button data-chatbot-history-archive="${escapeHtml(key)}">${archived ? '恢复' : '归档'}</button><button data-chatbot-history-export="${escapeHtml(key)}">导出</button></div></article>`;
        }).join('') || '<div class="chatbot-v5-empty"><i class="fas fa-clock-rotate-left"></i><strong>没有匹配的历史会话</strong><span>换个关键词，或显示已归档会话。</span></div>';
        viewOverlay.setAttribute('aria-label', '历史会话');
        viewOverlay.innerHTML = `<div class="chatbot-v5-view-head"><div><i class="fas fa-clock-rotate-left"></i><strong>历史会话</strong><span>${messageHistory.length} 条本地消息</span></div><button data-chatbot-view-close aria-label="关闭历史会话"><i class="fas fa-times" aria-hidden="true"></i></button></div><div class="chatbot-v5-history-tools"><label><i class="fas fa-search" aria-hidden="true"></i><input type="search" value="${escapeHtml(historyQuery)}" placeholder="搜索会话内容" aria-label="搜索历史会话"></label><button data-chatbot-show-archived aria-pressed="${historyShowArchived}">${historyShowArchived ? '隐藏已归档' : '显示已归档'}</button></div><div class="chatbot-v5-view-body chatbot-v5-history">${rows}</div>`;
        viewOverlay.classList.add('visible');
        viewOverlay.setAttribute('aria-hidden', 'false');
        viewOverlay.querySelector('[data-chatbot-view-close]')?.addEventListener('click', closeViewOverlay);
        viewOverlay.querySelectorAll('[data-chatbot-agent]').forEach(btn => btn.addEventListener('click', () => { switchAgent(btn.dataset.chatbotAgent); closeViewOverlay(); }));
        viewOverlay.querySelector('input[type="search"]')?.addEventListener('input', event => { historyQuery = event.target.value; showHistoryView(); requestAnimationFrame(() => { const search = viewOverlay.querySelector('input[type="search"]'); search?.focus(); search?.setSelectionRange(search.value.length, search.value.length); }); });
        viewOverlay.querySelector('[data-chatbot-show-archived]')?.addEventListener('click', () => { historyShowArchived = !historyShowArchived; showHistoryView(); });
        viewOverlay.querySelectorAll('[data-chatbot-history-archive]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.chatbotHistoryArchive; archivedHistoryKeys.has(key) ? archivedHistoryKeys.delete(key) : archivedHistoryKeys.add(key); saveHistory(); showHistoryView(); }));
        viewOverlay.querySelectorAll('[data-chatbot-history-export]').forEach(button => button.addEventListener('click', () => exportHistoryGroup(button.dataset.chatbotHistoryExport)));
        requestAnimationFrame(() => viewOverlay.querySelector('[data-chatbot-view-close]')?.focus({ preventScroll: true }));
    }

    function showMultiAgentView() {
        configOverlay.classList.remove('visible');
        configOverlay.setAttribute('aria-hidden', 'true');
        viewReturnFocus = document.activeElement;
        setProductPage('multi-agent');
        const evidence = [
            { id: 'structure', agent: '分析', title: '信息层级证据', text: '播放器主操作与发现内容同层，当前歌曲身份应成为唯一视觉主轴。', source: 'music-view.js' },
            { id: 'identity', agent: '代码', title: '状态一致性证据', text: '播放请求、队列高亮与底栏渲染需要共享 songId，避免异步错位。', source: 'music-controller.js' },
            { id: 'copy', agent: '写作', title: '交互文案证据', text: '“断开连接”和“关闭面板”必须是不同动作，危险动作需要独立分区。', source: 'UI 契约' },
        ];
        const cards = evidence.map(item => `<article class="chatbot-v5-evidence-card"><header><span>${item.agent}</span><b>证据</b></header><strong>${item.title}</strong><p>${item.text}</p><small><i class="fas fa-file-code" aria-hidden="true"></i>${item.source}</small><label><input type="checkbox" data-chatbot-evidence="${item.id}" ${selectedEvidenceIds.has(item.id) ? 'checked' : ''}>纳入汇总结论</label></article>`).join('');
        viewOverlay.setAttribute('aria-label', '多 Agent 协作');
        viewOverlay.innerHTML = `<div class="chatbot-v5-view-head"><div><i class="fas fa-users-gear"></i><strong>多 Agent 协作</strong><span>${CHAT_SESSION_TITLE} · 独立证据先保留</span></div><button data-chatbot-view-close aria-label="关闭多 Agent 协作"><i class="fas fa-times" aria-hidden="true"></i></button></div><div class="chatbot-v5-view-body"><div class="chatbot-v5-multi-note"><i class="fas fa-shield-halved"></i><div><strong>不会自动并发外发消息</strong><span>当前页使用本地评审证据；真正发送仍由输入框和当前 Agent 的明确操作触发。</span></div></div><section class="chatbot-v5-task-breakdown" aria-label="任务拆解"><span class="done">1 读取界面结构</span><span class="done">2 检查歌曲身份</span><span>3 选择独立证据</span><span>4 合并结论</span></section><div class="chatbot-v5-agent-grid">${cards}</div><aside class="chatbot-v5-summary"><div><span>综合结论预览</span><strong>已选择 <b data-chatbot-evidence-count>${selectedEvidenceIds.size}</b> / ${evidence.length} 条独立证据</strong><p>先统一歌曲身份，再收敛主次操作；危险连接动作单独分区。</p></div><button type="button" data-chatbot-merge ${selectedEvidenceIds.size ? '' : 'disabled'}>合并结论</button></aside></div>`;
        viewOverlay.classList.add('visible');
        viewOverlay.setAttribute('aria-hidden', 'false');
        viewOverlay.querySelector('[data-chatbot-view-close]')?.addEventListener('click', closeViewOverlay);
        viewOverlay.querySelectorAll('[data-chatbot-evidence]').forEach(input => input.addEventListener('change', () => { input.checked ? selectedEvidenceIds.add(input.dataset.chatbotEvidence) : selectedEvidenceIds.delete(input.dataset.chatbotEvidence); showMultiAgentView(); }));
        viewOverlay.querySelector('[data-chatbot-merge]')?.addEventListener('click', () => mergeEvidenceConclusion(evidence));
        requestAnimationFrame(() => viewOverlay.querySelector('[data-chatbot-view-close]')?.focus({ preventScroll: true }));
    }

    function showErrorRecovery(message) {
        setProductPage('error-recovery');
        const text = escapeHtml(message || 'AI 服务暂时不可用');
        const partial = lastPartialResponse ? escapeHtml(lastPartialResponse.slice(0, 180)) : '当前没有收到可保留的增量内容。';
        body.insertAdjacentHTML('beforeend', `<section class="chatbot-v5-error" aria-label="请求恢复"><i class="fas fa-triangle-exclamation"></i><div><strong>请求没有完成</strong><span>${text}</span><small>失败阶段：${escapeHtml(lastFailureStage || '连接或生成')} · 输入、附件和本地历史均已保留。</small><blockquote>${partial}</blockquote><div class="chatbot-v5-error-actions"><button data-chatbot-retry>从失败处重试</button><button data-chatbot-switch-model>切换模型</button><button data-chatbot-recover-config>诊断配置</button></div></div></section>`);
        const latest = body.querySelector('.chatbot-v5-error:last-of-type');
        latest?.querySelector('[data-chatbot-recover-config]')?.addEventListener('click', toggleConfig);
        latest?.querySelector('[data-chatbot-switch-model]')?.addEventListener('click', toggleConfig);
        latest?.querySelector('[data-chatbot-retry]')?.addEventListener('click', retryFailedRequest);
        body.scrollTop = body.scrollHeight;
    }

    function mergeEvidenceConclusion(evidence) {
        const chosen = evidence.filter(item => selectedEvidenceIds.has(item.id));
        const content = `## 综合结论\n\n${chosen.map(item => `- **${item.title}**：${item.text}（${item.source}）`).join('\n')}\n\n建议：先保证 songId 一致性，再调整视觉层级；连接类危险动作独立分区。`;
        recordMessage('assistant', content);
        addLine(`<span class="chatbot-prompt">agent@review ▸</span>`);
        const line = document.createElement('div');
        line.className = 'chatbot-line';
        line.innerHTML = `<div class="chatbot-response">${formatResponse(content)}</div>`;
        body.appendChild(line);
        closeViewOverlay();
        bindResponseActions(line);
    }

    function exportHistoryGroup(key) {
        const [agentId, day] = key.split('|');
        const messages = messageHistory.filter(message => (message.agentId || 'general') === agentId && new Date(message.ts || Date.now()).toISOString().slice(0, 10) === day);
        const blob = new Blob([JSON.stringify({ session: CHAT_SESSION_TITLE, workspace: CHAT_WORKSPACE, agentId, day, messages }, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ai-chat-${agentId}-${day}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    // ─── Tabs & Agents ───

    function renderTabs() {
        tabs.innerHTML = agents.map(a => `
            <button type="button" class="chatbot-tab ${a.id === currentAgentId ? 'active' : ''}" data-id="${a.id}" aria-selected="${a.id === currentAgentId}">
                <i class="${a.icon}"></i> ${a.name}
            </button>
        `).join('');
        tabs.querySelectorAll('.chatbot-tab').forEach(el => {
            el.addEventListener('click', () => switchAgent(el.dataset.id));
        });
        titleLabel.textContent = currentAgentId;
        updateSessionMeta();
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
        lastFailedInput = text;
        sendToVipBrain(text);
    }

    function stopStreaming() {
        if (!isStreaming && !currentAbortController) return;
        currentAbortController?.abort();
        if (!currentAbortController) {
            isStreaming = false;
            setStreamingUI(false);
        }
        addLine(`<span class="chatbot-system">// 已停止生成，已输出内容会保留</span>`);
    }

    function setStreamingUI(active) {
        const stopButton = panel.querySelector('#chatbot-stop-btn');
        const sendButton = panel.querySelector('#chatbot-send-btn');
        if (stopButton) stopButton.hidden = !active;
        if (sendButton) sendButton.hidden = active;
        input.setAttribute('aria-busy', String(active));
    }

    function retryFailedRequest() {
        if (!lastFailedInput || isStreaming) return;
        sendToVipBrain(lastFailedInput);
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
                stopStreaming();
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
            showErrorRecovery('配置不完整：需要 API URL、当前 Agent ID 与 Token。');
            return;
        }

        if (isStreaming) {
            addLine(`<span class="chatbot-error">✗ 正在响应中，输入 /stop 可中断</span>`);
            return;
        }

        isStreaming = true;
        setStreamingUI(true);
        lastFailureStage = '建立连接';
        lastPartialResponse = '';
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

        requestBody.forwardedProps['agent.model.name'] = effectiveModel();
        requestBody.forwardedProps['agent.model.temperature'] = config.temperature;
        requestBody.forwardedProps['agent.system.prompt'] = config.systemPrompt;
        requestBody.forwardedProps['agent.context.limit'] = config.contextLimit;
        requestBody.forwardedProps['review.workspace'] = CHAT_WORKSPACE;
        requestBody.forwardedProps['review.attachments'] = CHAT_ATTACHMENTS;

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
                showErrorRecovery(`HTTP ${res.status}：${errText.substring(0, 100)}`);
                isStreaming = false;
                return;
            }

            lastFailureStage = '流式生成';
            await processSSEStream(res.body);
        } catch (err) {
            removeThinking();
            if (err.name === 'AbortError') {
                addLine(`<span class="chatbot-system">// 请求已中断</span>`);
            } else {
                console.error('[Chatbot] VIP Brain error:', err);
                addLine(`<span class="chatbot-error">✗ 请求失败: ${err.message}</span>`);
                showErrorRecovery(err.message);
            }
        } finally {
            isStreaming = false;
            currentAbortController = null;
            setStreamingUI(false);
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
            lastPartialResponse = responseText;
            bindResponseActions(responseDiv);
            requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
        }

        function finalRender() {
            if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
            if (!responseDiv) return;
            const el = responseDiv.querySelector('.chatbot-response');
            el.classList.remove('chatbot-response-streaming');
            el.innerHTML = formatResponse(responseText);
            lastPartialResponse = responseText;
            bindResponseActions(responseDiv);
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
                    showToolPermission(data.name || data.toolName || '未命名工具', data.arguments || data.args || {});
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

    function showToolPermission(name, args) {
        const mode = /write|edit|patch|delete/i.test(name) ? config.toolWriteMode : (/browser|chrome|navigate|click/i.test(name) ? config.toolBrowserMode : config.toolReadMode);
        const card = document.createElement('section');
        card.className = 'chatbot-tool-permission';
        card.setAttribute('aria-label', `工具权限：${name}`);
        card.innerHTML = `<i class="fas fa-shield-halved" aria-hidden="true"></i><div><strong>工具请求 · ${escapeHtml(name)}</strong><span>${escapeHtml(JSON.stringify(args).slice(0, 140) || '无参数')}</span><small>当前策略：${permissionLabel(mode)}。真实执行仍由后端确认链路决定。</small></div><b>${mode === 'allow' ? '策略允许' : (mode === 'deny' ? '策略禁止' : '待确认')}</b>`;
        body.appendChild(card);
        body.scrollTop = body.scrollHeight;
    }

    function enhanceCodeBlocks(root) {
        root.querySelectorAll('.chatbot-response pre:not([data-chatbot-enhanced])').forEach((pre, index) => {
            pre.dataset.chatbotEnhanced = 'true';
            const code = pre.querySelector('code')?.textContent || '';
            const header = document.createElement('div');
            header.className = 'chatbot-code-head';
            header.innerHTML = `<span><i class="fas fa-file-code" aria-hidden="true"></i>${CHAT_ATTACHMENTS[index % CHAT_ATTACHMENTS.length]}</span><div><button type="button" data-chatbot-copy-code>复制代码</button><button type="button" data-chatbot-apply-code>应用补丁</button></div>`;
            pre.before(header);
            const result = document.createElement('div');
            result.className = 'chatbot-code-result';
            result.innerHTML = '<span>运行结果</span><strong>尚未应用</strong><small>风险：应用前需确认目标文件、补丁范围和本地 Agent 连接。</small>';
            pre.after(result);
            header.querySelector('[data-chatbot-copy-code]')?.addEventListener('click', async event => {
                try {
                    await navigator.clipboard.writeText(code);
                    event.currentTarget.textContent = '已复制';
                } catch {
                    event.currentTarget.textContent = '复制失败';
                }
            });
            header.querySelector('[data-chatbot-apply-code]')?.addEventListener('click', () => showApplyReview(code, result));
        });
    }

    function bindResponseActions(root) {
        enhanceCodeBlocks(root);
    }

    function showApplyReview(code, result) {
        viewReturnFocus = document.activeElement;
        setProductPage('code-answer');
        const bridgeReady = !!window.cursorBridge?.connected;
        viewOverlay.setAttribute('aria-label', '应用补丁检查');
        viewOverlay.innerHTML = `<div class="chatbot-v5-view-head"><div><i class="fas fa-code-branch"></i><strong>应用补丁前检查</strong><span>复制与应用是两个独立动作</span></div><button data-chatbot-view-close aria-label="关闭应用补丁检查"><i class="fas fa-times" aria-hidden="true"></i></button></div><div class="chatbot-v5-view-body chatbot-apply-review"><div class="chatbot-apply-target"><span>候选目标文件</span><strong>${CHAT_ATTACHMENTS[0]}</strong><small>工作区：${CHAT_WORKSPACE}</small></div><pre><code>${escapeHtml(code)}</code></pre><div class="chatbot-apply-risk"><strong>${bridgeReady ? '本地 Agent 已连接' : '尚未连接本地 Agent'}</strong><p>${bridgeReady ? '仍需在真实补丁接口中确认范围后才能写入；当前页面不会伪造成功。' : '无法安全确定补丁行号和目标范围，因此已阻止写入。你仍可复制代码手动审阅。'}</p></div><button type="button" data-chatbot-apply-confirm ${bridgeReady ? '' : 'disabled'}>确认交给本地 Agent</button></div>`;
        viewOverlay.classList.add('visible');
        viewOverlay.setAttribute('aria-hidden', 'false');
        viewOverlay.querySelector('[data-chatbot-view-close]')?.addEventListener('click', closeViewOverlay);
        viewOverlay.querySelector('[data-chatbot-apply-confirm]')?.addEventListener('click', () => {
            result.querySelector('strong').textContent = '等待真实补丁接口';
            result.querySelector('small').textContent = '当前 Bridge 未暴露安全的补丁应用合同，未修改文件。';
            closeViewOverlay();
        });
        requestAnimationFrame(() => viewOverlay.querySelector('[data-chatbot-view-close]')?.focus({ preventScroll: true }));
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
        updateSessionMeta();
        if ((role === 'assistant' || role === 'bot') && content.includes('```')) setProductPage('code-answer');
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
            bindResponseActions(body);
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
        showHistory: showHistoryView,
        showMultiAgent: showMultiAgentView,
        toggleConfig,
        showErrorRecovery,
        setPreviewStreaming: active => { isStreaming = !!active; setStreamingUI(isStreaming); if (isStreaming) lastPartialResponse = '已生成的内容会在停止后保留。'; },
        addLocalMessage: (role, content) => {
            if (role === 'user') lastFailedInput = content;
            recordMessage(role, content);
            if (role === 'user') addLine(`<span class="chatbot-prompt-user">you ▸</span> ${escapeHtml(content)}`);
            else {
                addLine(`<span class="chatbot-prompt">agent@${currentAgentId} ▸</span>`);
                const line = document.createElement('div');
                line.className = 'chatbot-line';
                line.innerHTML = `<div class="chatbot-response">${formatResponse(content)}</div>`;
                body.appendChild(line);
                bindResponseActions(line);
            }
        },
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
