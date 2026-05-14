/**
 * Whitebox Observability — Agent 白盒可观测性前端
 * 5 种视图：时间线、决策日志、角色视角、因果图、回放模式
 */
(function () {
    'use strict';

    const BRIDGE_URL = 'http://127.0.0.1:19840';

    const ROLE_COLORS = {
        'operations': '#ef4444',
        'product_manager': '#f97316',
        'project_manager': '#eab308',
        'architect': '#8b5cf6',
        'senior_developer': '#3b82f6',
        'developer': '#06b6d4',
        'qa_engineer': '#22c55e',
        'devops_engineer': '#14b8a6',
        'tech_lead': '#ec4899',
        'system': '#6b7280',
        '': '#9ca3af',
    };

    const TYPE_ICONS = {
        'thinking': 'fa-brain',
        'tool_call': 'fa-wrench',
        'tool_result': 'fa-check-circle',
        'decision': 'fa-gavel',
        'opinion': 'fa-comment',
        'agreement': 'fa-thumbs-up',
        'objection': 'fa-thumbs-down',
        'reference': 'fa-link',
        'delegation': 'fa-share',
        'escalation': 'fa-arrow-up',
        'phase_enter': 'fa-sign-in-alt',
        'phase_exit': 'fa-sign-out-alt',
        'approval': 'fa-check',
        'veto': 'fa-ban',
        'bug_report': 'fa-bug',
        'bug_fix': 'fa-hammer',
        'quality_gate': 'fa-shield-alt',
        'system': 'fa-cog',
    };

    class WhiteboxViewer {
        constructor() {
            this._panel = null;
            this._currentTask = null;
            this._currentView = 'timeline';
            this._traces = [];
            this._decisions = [];
            this._replayIndex = 0;
            this._replayTimer = null;
            this._replaySpeed = 1;
        }

        async open(taskId) {
            this._currentTask = taskId;
            this._createPanel();
            await this._loadData();
            this._renderCurrentView();
        }

        close() {
            this._stopReplay();
            this._panel?.remove();
            this._panel = null;
        }

        _createPanel() {
            if (this._panel) this._panel.remove();

            const panel = document.createElement('div');
            panel.className = 'wb-panel';
            panel.innerHTML = `
                <div class="wb-header">
                    <div class="wb-title">
                        <i class="fas fa-eye"></i>
                        <span>Agent 白盒可观测性</span>
                        <span class="wb-task-id">${this._esc(this._currentTask || '')}</span>
                    </div>
                    <div class="wb-tabs">
                        <button class="wb-tab active" data-view="timeline">
                            <i class="fas fa-stream"></i> 时间线
                        </button>
                        <button class="wb-tab" data-view="decisions">
                            <i class="fas fa-gavel"></i> 决策日志
                        </button>
                        <button class="wb-tab" data-view="role">
                            <i class="fas fa-user-circle"></i> 角色视角
                        </button>
                        <button class="wb-tab" data-view="causal">
                            <i class="fas fa-project-diagram"></i> 因果图
                        </button>
                        <button class="wb-tab" data-view="replay">
                            <i class="fas fa-play-circle"></i> 回放
                        </button>
                    </div>
                    <button class="wb-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="wb-toolbar"></div>
                <div class="wb-body"></div>
                <div class="wb-stats"></div>
            `;

            panel.querySelector('.wb-close').addEventListener('click', () => this.close());
            panel.querySelectorAll('.wb-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    panel.querySelectorAll('.wb-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this._currentView = tab.dataset.view;
                    this._renderCurrentView();
                });
            });

            document.body.appendChild(panel);
            this._panel = panel;
        }

        async _loadData() {
            if (!this._currentTask) return;
            try {
                const [tracesRes, decisionsRes, statsRes] = await Promise.all([
                    fetch(`${BRIDGE_URL}/tasks/${this._currentTask}/traces`),
                    fetch(`${BRIDGE_URL}/tasks/${this._currentTask}/decisions`),
                    fetch(`${BRIDGE_URL}/tasks/${this._currentTask}/traces/stats`),
                ]);
                this._traces = await tracesRes.json();
                this._decisions = await decisionsRes.json();
                this._stats = await statsRes.json();
            } catch (e) {
                console.warn('[Whitebox] Load failed:', e);
                this._traces = [];
                this._decisions = [];
                this._stats = { total: 0, byType: {}, byRole: {}, byPhase: {}, decisions: 0, causalLinks: 0 };
            }
        }

        _renderCurrentView() {
            const body = this._panel?.querySelector('.wb-body');
            const toolbar = this._panel?.querySelector('.wb-toolbar');
            const stats = this._panel?.querySelector('.wb-stats');
            if (!body || !toolbar || !stats) return;

            this._stopReplay();

            stats.innerHTML = this._renderStats();

            switch (this._currentView) {
                case 'timeline':
                    toolbar.innerHTML = this._renderTimelineToolbar();
                    body.innerHTML = this._renderTimeline();
                    break;
                case 'decisions':
                    toolbar.innerHTML = '';
                    body.innerHTML = this._renderDecisions();
                    break;
                case 'role':
                    toolbar.innerHTML = this._renderRoleToolbar();
                    body.innerHTML = this._renderRoleView();
                    break;
                case 'causal':
                    toolbar.innerHTML = '';
                    body.innerHTML = this._renderCausalGraph();
                    break;
                case 'replay':
                    toolbar.innerHTML = this._renderReplayToolbar();
                    body.innerHTML = this._renderReplay();
                    this._bindReplayControls();
                    break;
            }

            this._bindToolbarEvents();
        }

        // ─── View 1: Timeline ───

        _renderTimelineToolbar() {
            const phases = [...new Set(this._traces.map(t => t.phase).filter(Boolean))];
            const types = [...new Set(this._traces.map(t => t.type))];
            return `
                <div class="wb-filters">
                    <select class="wb-filter-phase">
                        <option value="">所有阶段</option>
                        ${phases.map(p => `<option value="${this._esc(p)}">${this._esc(p)}</option>`).join('')}
                    </select>
                    <select class="wb-filter-type">
                        <option value="">所有类型</option>
                        ${types.map(t => `<option value="${this._esc(t)}">${this._esc(t)}</option>`).join('')}
                    </select>
                    <span class="wb-count">${this._traces.length} 条事件</span>
                </div>
            `;
        }

        _renderTimeline(filterPhase = '', filterType = '') {
            let filtered = this._traces;
            if (filterPhase) filtered = filtered.filter(t => t.phase === filterPhase);
            if (filterType) filtered = filtered.filter(t => t.type === filterType);

            if (filtered.length === 0) {
                return '<div class="wb-empty">暂无 Trace 事件</div>';
            }

            return `<div class="wb-timeline">${filtered.map(t => this._renderTraceItem(t)).join('')}</div>`;
        }

        _renderTraceItem(trace) {
            const color = ROLE_COLORS[trace.roleId] || ROLE_COLORS[''];
            const icon = TYPE_ICONS[trace.type] || 'fa-circle';
            const time = new Date(trace.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
            const meta = trace.metadata || {};

            let extraHtml = '';
            if (trace.type === 'decision' && meta.options) {
                extraHtml = `<div class="wb-meta-decision">
                    <span class="wb-chosen">${this._esc(meta.chosen)}</span>
                    <span class="wb-reason">${this._esc(meta.reason)}</span>
                </div>`;
            }
            if (trace.type === 'tool_call' && meta.toolName) {
                extraHtml = `<div class="wb-meta-tool">
                    <code>${this._esc(meta.toolName)}</code>
                    ${meta.durationMs ? `<span class="wb-duration">${meta.durationMs}ms</span>` : ''}
                </div>`;
            }
            if ((trace.type === 'agreement' || trace.type === 'objection') && meta.targetRoleId) {
                const stanceLabel = meta.stance === 'agree' ? '赞同' : meta.stance === 'disagree' ? '反对' : meta.stance;
                extraHtml = `<div class="wb-meta-stance">
                    <span class="wb-stance wb-stance-${meta.stance}">${stanceLabel}</span>
                    <span>@${this._esc(meta.targetRoleId)}</span>
                </div>`;
            }

            return `
                <div class="wb-trace-item" data-type="${trace.type}" data-trace-id="${trace.id}">
                    <div class="wb-trace-line" style="border-left-color: ${color}"></div>
                    <div class="wb-trace-dot" style="background: ${color}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="wb-trace-content">
                        <div class="wb-trace-header">
                            <span class="wb-trace-time">${time}</span>
                            <span class="wb-trace-role" style="color: ${color}">${this._esc(trace.roleId || 'unknown')}</span>
                            <span class="wb-trace-type">${this._esc(trace.type)}</span>
                            ${trace.phase ? `<span class="wb-trace-phase">${this._esc(trace.phase)}</span>` : ''}
                        </div>
                        <div class="wb-trace-body">${this._esc(trace.content).substring(0, 500)}</div>
                        ${extraHtml}
                    </div>
                </div>
            `;
        }

        // ─── View 2: Decisions ───

        _renderDecisions() {
            if (this._decisions.length === 0) {
                return '<div class="wb-empty">暂无决策记录</div>';
            }

            return `<div class="wb-decisions">${this._decisions.map((d, i) => `
                <div class="wb-decision-card">
                    <div class="wb-decision-header">
                        <span class="wb-decision-num">Decision #${i + 1}</span>
                        <span class="wb-decision-phase">${this._esc(d.phase)}</span>
                        <span class="wb-decision-by">决策者: ${this._esc(d.decidedBy)}</span>
                    </div>
                    <div class="wb-decision-topic">${this._esc(d.topic)}</div>
                    <div class="wb-decision-result">
                        <i class="fas fa-check-circle"></i> ${this._esc(d.chosen)}
                    </div>
                    <div class="wb-decision-reason">${this._esc(d.reason)}</div>
                    <div class="wb-decision-options">
                        <div class="wb-decision-label">可选方案:</div>
                        ${d.options.map(o => `<span class="wb-option ${o === d.chosen ? 'wb-option-chosen' : ''}">${this._esc(o)}</span>`).join('')}
                    </div>
                    ${d.supportingTraces.length > 0 ? `
                        <div class="wb-decision-support">
                            <div class="wb-decision-label"><i class="fas fa-thumbs-up"></i> 支持 (${d.supportingTraces.length})</div>
                        </div>` : ''}
                    ${d.dissentingTraces.length > 0 ? `
                        <div class="wb-decision-dissent">
                            <div class="wb-decision-label"><i class="fas fa-thumbs-down"></i> 反对 (${d.dissentingTraces.length})</div>
                        </div>` : ''}
                </div>
            `).join('')}</div>`;
        }

        // ─── View 3: Role Perspective ───

        _renderRoleToolbar() {
            const roles = [...new Set(this._traces.map(t => t.roleId).filter(Boolean))];
            return `
                <div class="wb-filters">
                    <select class="wb-filter-role">
                        <option value="">选择角色...</option>
                        ${roles.map(r => `<option value="${this._esc(r)}">${this._esc(r)}</option>`).join('')}
                    </select>
                </div>
            `;
        }

        _renderRoleView(selectedRole = '') {
            if (!selectedRole) {
                const roles = [...new Set(this._traces.map(t => t.roleId).filter(Boolean))];
                if (roles.length === 0) return '<div class="wb-empty">暂无角色数据</div>';
                return `<div class="wb-role-grid">${roles.map(r => {
                    const color = ROLE_COLORS[r] || ROLE_COLORS[''];
                    const count = this._traces.filter(t => t.roleId === r).length;
                    const types = {};
                    this._traces.filter(t => t.roleId === r).forEach(t => { types[t.type] = (types[t.type] || 0) + 1; });
                    return `
                        <div class="wb-role-card" data-role="${this._esc(r)}" style="border-left-color: ${color}">
                            <div class="wb-role-name" style="color: ${color}">${this._esc(r)}</div>
                            <div class="wb-role-count">${count} 条事件</div>
                            <div class="wb-role-types">
                                ${Object.entries(types).map(([k, v]) => `<span class="wb-role-type-badge">${k}: ${v}</span>`).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}</div>`;
            }

            const roleTraces = this._traces.filter(t => t.roleId === selectedRole);
            const color = ROLE_COLORS[selectedRole] || ROLE_COLORS[''];
            const opinions = roleTraces.filter(t => t.type === 'opinion').length;
            const decisions = roleTraces.filter(t => t.type === 'decision').length;
            const tools = roleTraces.filter(t => t.type === 'tool_call').length;
            const referenced = this._traces.filter(t => t.metadata?.targetRoleId === selectedRole).length;

            return `
                <div class="wb-role-detail">
                    <div class="wb-role-header" style="border-left-color: ${color}">
                        <h3 style="color: ${color}">${this._esc(selectedRole)}</h3>
                        <div class="wb-role-metrics">
                            <span>发言 ${opinions}</span>
                            <span>决策 ${decisions}</span>
                            <span>工具调用 ${tools}</span>
                            <span>被引用 ${referenced} 次</span>
                        </div>
                    </div>
                    <div class="wb-timeline">
                        ${roleTraces.map(t => this._renderTraceItem(t)).join('')}
                    </div>
                </div>
            `;
        }

        // ─── View 4: Causal Graph ───

        _renderCausalGraph() {
            const decisionTraces = this._traces.filter(t =>
                ['decision', 'delegation', 'bug_report', 'bug_fix', 'quality_gate', 'phase_enter', 'phase_exit'].includes(t.type)
            );

            if (decisionTraces.length === 0) {
                return '<div class="wb-empty">暂无因果链数据</div>';
            }

            const causalPairs = [];
            for (const t of decisionTraces) {
                if (t.causedBy) {
                    const parent = this._traces.find(p => p.id === t.causedBy);
                    if (parent) causalPairs.push({ from: parent, to: t });
                }
            }

            return `
                <div class="wb-causal">
                    <div class="wb-causal-legend">
                        <span><i class="fas fa-gavel"></i> 决策</span>
                        <span><i class="fas fa-share"></i> 委派</span>
                        <span><i class="fas fa-bug"></i> Bug</span>
                        <span><i class="fas fa-hammer"></i> 修复</span>
                        <span><i class="fas fa-shield-alt"></i> 质量门</span>
                    </div>
                    <div class="wb-causal-nodes">
                        ${decisionTraces.map(t => {
                            const color = ROLE_COLORS[t.roleId] || ROLE_COLORS[''];
                            const icon = TYPE_ICONS[t.type] || 'fa-circle';
                            const hasParent = t.causedBy ? 'has-parent' : '';
                            const hasChildren = decisionTraces.some(c => c.causedBy === t.id) ? 'has-children' : '';
                            return `
                                <div class="wb-causal-node ${hasParent} ${hasChildren}" style="border-color: ${color}">
                                    <div class="wb-causal-icon" style="color: ${color}"><i class="fas ${icon}"></i></div>
                                    <div class="wb-causal-info">
                                        <span class="wb-causal-role">${this._esc(t.roleId)}</span>
                                        <span class="wb-causal-text">${this._esc(t.content).substring(0, 100)}</span>
                                    </div>
                                    ${t.causedBy ? `<div class="wb-causal-arrow"><i class="fas fa-long-arrow-alt-up"></i></div>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${causalPairs.length > 0 ? `
                        <div class="wb-causal-links-list">
                            <h4>因果关系链 (${causalPairs.length})</h4>
                            ${causalPairs.map(p => `
                                <div class="wb-causal-link-item">
                                    <span style="color: ${ROLE_COLORS[p.from.roleId] || '#999'}">${this._esc(p.from.roleId)}:${this._esc(p.from.type)}</span>
                                    <i class="fas fa-arrow-right"></i>
                                    <span style="color: ${ROLE_COLORS[p.to.roleId] || '#999'}">${this._esc(p.to.roleId)}:${this._esc(p.to.type)}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // ─── View 5: Replay ───

        _renderReplayToolbar() {
            return `
                <div class="wb-replay-controls">
                    <button class="wb-replay-btn" data-action="start"><i class="fas fa-step-backward"></i></button>
                    <button class="wb-replay-btn" data-action="prev"><i class="fas fa-backward"></i></button>
                    <button class="wb-replay-btn wb-replay-play" data-action="play"><i class="fas fa-play"></i></button>
                    <button class="wb-replay-btn" data-action="next"><i class="fas fa-forward"></i></button>
                    <button class="wb-replay-btn" data-action="end"><i class="fas fa-step-forward"></i></button>
                    <select class="wb-replay-speed">
                        <option value="0.5">0.5x</option>
                        <option value="1" selected>1x</option>
                        <option value="2">2x</option>
                        <option value="5">5x</option>
                    </select>
                    <div class="wb-replay-progress">
                        <input type="range" class="wb-replay-slider" min="0" max="${Math.max(0, this._traces.length - 1)}" value="0">
                        <span class="wb-replay-position">0 / ${this._traces.length}</span>
                    </div>
                </div>
            `;
        }

        _renderReplay() {
            if (this._traces.length === 0) {
                return '<div class="wb-empty">暂无可回放数据</div>';
            }

            const visible = this._traces.slice(0, this._replayIndex + 1);
            const current = visible[visible.length - 1];
            const roles = [...new Set(this._traces.map(t => t.roleId).filter(Boolean))];

            const roleStates = roles.map(r => {
                const lastTrace = visible.filter(t => t.roleId === r).pop();
                const isActive = lastTrace && (this._replayIndex - this._traces.indexOf(lastTrace)) < 3;
                return { role: r, active: isActive, lastAction: lastTrace?.type || 'idle' };
            });

            return `
                <div class="wb-replay-view">
                    <div class="wb-replay-agents">
                        ${roleStates.map(rs => {
                            const color = ROLE_COLORS[rs.role] || ROLE_COLORS[''];
                            return `
                                <div class="wb-replay-agent ${rs.active ? 'active' : ''}" style="border-color: ${color}">
                                    <div class="wb-replay-agent-name" style="color: ${color}">${this._esc(rs.role)}</div>
                                    <div class="wb-replay-agent-status">${rs.active ? this._esc(rs.lastAction) : '待命'}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${current ? `
                        <div class="wb-replay-current">
                            <div class="wb-replay-current-header">
                                <span class="wb-replay-time">${new Date(current.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                                <span class="wb-replay-current-role" style="color: ${ROLE_COLORS[current.roleId] || '#999'}">${this._esc(current.roleId)}</span>
                                <span class="wb-replay-current-type">${this._esc(current.type)}</span>
                            </div>
                            <div class="wb-replay-current-content">${this._esc(current.content).substring(0, 1000)}</div>
                        </div>
                    ` : ''}
                    <div class="wb-replay-timeline wb-timeline">
                        ${visible.slice(-20).map(t => this._renderTraceItem(t)).join('')}
                    </div>
                </div>
            `;
        }

        _bindReplayControls() {
            const panel = this._panel;
            if (!panel) return;

            panel.querySelectorAll('.wb-replay-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    if (action === 'start') { this._replayIndex = 0; this._renderCurrentView(); }
                    else if (action === 'prev') { this._replayIndex = Math.max(0, this._replayIndex - 1); this._renderCurrentView(); }
                    else if (action === 'next') { this._replayIndex = Math.min(this._traces.length - 1, this._replayIndex + 1); this._renderCurrentView(); }
                    else if (action === 'end') { this._replayIndex = this._traces.length - 1; this._renderCurrentView(); }
                    else if (action === 'play') { this._toggleReplay(); }
                });
            });

            const slider = panel.querySelector('.wb-replay-slider');
            if (slider) {
                slider.addEventListener('input', () => {
                    this._replayIndex = parseInt(slider.value);
                    this._updateReplayBody();
                });
            }

            const speedSel = panel.querySelector('.wb-replay-speed');
            if (speedSel) {
                speedSel.addEventListener('change', () => {
                    this._replaySpeed = parseFloat(speedSel.value);
                });
            }
        }

        _toggleReplay() {
            if (this._replayTimer) {
                this._stopReplay();
            } else {
                this._startReplay();
            }
        }

        _startReplay() {
            if (this._replayIndex >= this._traces.length - 1) this._replayIndex = 0;
            const playBtn = this._panel?.querySelector('.wb-replay-play i');
            if (playBtn) playBtn.className = 'fas fa-pause';

            this._replayTimer = setInterval(() => {
                this._replayIndex++;
                if (this._replayIndex >= this._traces.length) {
                    this._stopReplay();
                    return;
                }
                this._updateReplayBody();
            }, 1000 / this._replaySpeed);
        }

        _stopReplay() {
            if (this._replayTimer) {
                clearInterval(this._replayTimer);
                this._replayTimer = null;
            }
            const playBtn = this._panel?.querySelector('.wb-replay-play i');
            if (playBtn) playBtn.className = 'fas fa-play';
        }

        _updateReplayBody() {
            const body = this._panel?.querySelector('.wb-body');
            const slider = this._panel?.querySelector('.wb-replay-slider');
            const position = this._panel?.querySelector('.wb-replay-position');
            if (body) body.innerHTML = this._renderReplay();
            if (slider) slider.value = this._replayIndex;
            if (position) position.textContent = `${this._replayIndex + 1} / ${this._traces.length}`;
            this._bindReplayControls();
        }

        // ─── Stats Footer ───

        _renderStats() {
            const s = this._stats || {};
            return `
                <div class="wb-stats-inner">
                    <span>事件: ${s.total || 0}</span>
                    <span>决策: ${s.decisions || 0}</span>
                    <span>因果链: ${s.causalLinks || 0}</span>
                    <span>角色: ${Object.keys(s.byRole || {}).length}</span>
                    <span>阶段: ${Object.keys(s.byPhase || {}).length}</span>
                </div>
            `;
        }

        // ─── Event Binding ───

        _bindToolbarEvents() {
            const panel = this._panel;
            if (!panel) return;

            const phaseFilter = panel.querySelector('.wb-filter-phase');
            const typeFilter = panel.querySelector('.wb-filter-type');
            if (phaseFilter || typeFilter) {
                const update = () => {
                    const body = panel.querySelector('.wb-body');
                    if (body) body.innerHTML = this._renderTimeline(
                        phaseFilter?.value || '', typeFilter?.value || ''
                    );
                };
                phaseFilter?.addEventListener('change', update);
                typeFilter?.addEventListener('change', update);
            }

            const roleFilter = panel.querySelector('.wb-filter-role');
            if (roleFilter) {
                roleFilter.addEventListener('change', () => {
                    const body = panel.querySelector('.wb-body');
                    if (body) body.innerHTML = this._renderRoleView(roleFilter.value);
                });
            }

            panel.querySelectorAll('.wb-role-card').forEach(card => {
                card.addEventListener('click', () => {
                    const role = card.dataset.role;
                    const roleSel = panel.querySelector('.wb-filter-role');
                    if (roleSel) roleSel.value = role;
                    const body = panel.querySelector('.wb-body');
                    if (body) body.innerHTML = this._renderRoleView(role);
                });
            });
        }

        // ─── Util ───

        _esc(s) {
            if (!s) return '';
            const d = document.createElement('div');
            d.textContent = String(s);
            return d.innerHTML;
        }
    }

    window.WhiteboxViewer = WhiteboxViewer;
})();
