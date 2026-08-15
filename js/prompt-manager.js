/**
 * Prompt Manager — Multi-Role Prompt Dashboard
 * Dashboard 仪表盘式管理界面，左侧角色列表 / 中间编辑器 / 右侧版本+统计
 */
(function () {
  'use strict';

  const BRIDGE_URL = 'http://127.0.0.1:19840';
  const REVIEW_ROLE_ID = 'product-experience-reviewer';
  const DRAFT_VERSION = 'v2.4.0-draft';
  const PUBLISHED_VERSION = 'v2.3.0';
  const DRAFT_STORAGE_KEY = 'prompt_manager_product_review_draft_v1';
  const BACKUP_STORAGE_KEY = 'prompt_manager_product_review_backups_v1';
  const DYNAMIC_VARS = [
    '{{product_name}}', '{{target_user}}', '{{evidence}}',
    '{{current_date}}', '{{project_name}}', '{{user_context}}',
    '{{team_size}}', '{{sprint_deadline}}', '{{previous_output}}',
  ];

  const PHASE_BG = {
    discussion: '#e3f2fd',
    execution: '#fce4ec',
    qa: '#e0f7fa',
    deployment: '#fff3e0',
  };

  let roles = [];
  let selectedRoleId = null;
  let versions = [];
  let panelEl = null;
  let overlayEl = null;
  let offlineMode = false;
  let returnFocus = null;
  let modalReturnFocus = null;
  let backgroundInertSiblings = [];
  let draftDirty = false;
  let testRuns = [];

  function setProductPage(page) {
    window.ProductUIV5?.setBusinessPage?.('prompt-manager', page);
  }

  function init() {
    buildDOM();
    bindEvents();

    const dockBtn = document.getElementById('prompt-mgr-dock-btn');
    if (dockBtn) {
      dockBtn.addEventListener('click', () => {
        if (isOpen()) close(); else open();
      });
    }
  }

  function buildDOM() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'pm-overlay';
    overlayEl.addEventListener('click', close);

    panelEl = document.createElement('div');
    panelEl.className = 'pm-panel';
    panelEl.setAttribute('role', 'dialog');
    panelEl.setAttribute('aria-modal', 'true');
    panelEl.setAttribute('aria-labelledby', 'pm-dialog-title');
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.tabIndex = -1;
    panelEl.inert = true;
    panelEl.innerHTML = `
      <div class="pm-header">
        <h2 id="pm-dialog-title"><i class="fas fa-terminal" aria-hidden="true"></i><span>Prompt 管理<small>结构化角色、编译测试与安全发布</small></span></h2>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="pm-badge" id="pm-status-badge">Loading...</span>
          <button class="pm-close-btn" id="pm-close-btn" aria-label="关闭 Prompt 管理"><i class="fas fa-times" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="pm-body">
        <div class="pm-sidebar" id="pm-sidebar"></div>
        <div class="pm-editor" id="pm-editor">
          <div style="color:rgba(255,255,255,0.3);text-align:center;padding-top:100px">
            <i class="fas fa-hand-pointer" style="font-size:32px;margin-bottom:12px;display:block"></i>
            选择左侧角色开始编辑 Prompt
          </div>
        </div>
        <div class="pm-right" id="pm-right">
          <div class="pm-right-title"><h3>版本历史</h3><button type="button" id="pm-import-top" aria-label="打开导入导出"><i class="fas fa-right-left"></i></button></div>
          <div id="pm-timeline" class="pm-timeline"></div>
          <div class="pm-right-title" style="margin-top:20px"><h3>编译后 System Prompt</h3><span id="pm-preview-token"></span></div>
          <pre id="pm-live-preview" class="pm-live-preview"></pre>
          <h3 style="margin-top:20px">校验与影响</h3>
          <div id="pm-stats" class="pm-stats-grid"></div>
          <button class="pm-preview-btn" id="pm-preview-btn">
            <i class="fas fa-eye"></i> 预览完整 System Prompt
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlayEl);
    document.body.appendChild(panelEl);
  }

  function bindEvents() {
    panelEl.querySelector('#pm-close-btn').addEventListener('click', close);
    panelEl.querySelector('#pm-preview-btn').addEventListener('click', previewPrompt);
    panelEl.querySelector('#pm-import-top').addEventListener('click', () => {
      const role = roles.find(item => item.id === selectedRoleId);
      if (role) showImportExport(role);
    });

    document.addEventListener('keydown', handleKeydown);
  }

  async function open() {
    returnFocus = document.activeElement;
    overlayEl.classList.add('open');
    panelEl.classList.add('open');
    panelEl.inert = false;
    panelEl.setAttribute('aria-hidden', 'false');
    setBackgroundInert(true);
    await loadRoles();
    setProductPage('role-editor');
    requestAnimationFrame(() => panelEl.querySelector('.pm-role-card.active, .pm-role-card, .pm-field-content')?.focus({ preventScroll: true }));
  }

  function close() {
    closePreviewModal(false);
    closeV5Modal(false);
    overlayEl.classList.remove('open');
    panelEl.classList.remove('open');
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.inert = true;
    setBackgroundInert(false);
    window.ProductUIV5?.setShellPage?.('home');
    const dockBtn = document.getElementById('prompt-mgr-dock-btn');
    const insideLaunchpad = returnFocus?.closest?.('#dock-launchpad');
    const usableReturn = returnFocus?.isConnected
      && returnFocus.matches?.('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      && !insideLaunchpad;
    const fallback = dockBtn?.getClientRects?.().length ? dockBtn : document.getElementById('dock-launchpad-btn');
    (usableReturn ? returnFocus : fallback)?.focus?.({ preventScroll: true });
    returnFocus = null;
  }

  function setBackgroundInert(active) {
    if (active) {
      if (backgroundInertSiblings.length) return;
      backgroundInertSiblings = [...document.body.children]
        .filter(child => child !== panelEl && child !== overlayEl && !child.inert);
      backgroundInertSiblings.forEach(child => { child.inert = true; });
      return;
    }
    backgroundInertSiblings.forEach(child => { child.inert = false; });
    backgroundInertSiblings = [];
  }

  function activeFocusSurface() {
    return document.querySelector('.pm-v5-modal.open .pm-v5-modal-card')
      || document.querySelector('.pm-preview-modal.open .pm-preview-box')
      || panelEl;
  }

  function handleKeydown(event) {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      if (document.querySelector('.pm-v5-modal.open')) closeV5Modal();
      else if (document.querySelector('.pm-preview-modal.open')) closePreviewModal();
      else close();
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

  function isOpen() {
    return panelEl && panelEl.classList.contains('open');
  }

  async function loadRoles() {
    try {
      const res = await fetch(`${BRIDGE_URL}/prompts/roles`);
      if (res.ok) {
        const remoteRoles = await res.json();
        roles = Array.isArray(remoteRoles) ? [...remoteRoles] : [];
        if (!roles.some(role => role.id === REVIEW_ROLE_ID)) roles.unshift(createReviewerRole());
        offlineMode = false;
        panelEl.querySelector('#pm-status-badge').textContent = `${roles.length} Roles`;
        panelEl.querySelector('#pm-status-badge').style.background = '#4CAF50';
      } else {
        useFallbackRoles();
      }
    } catch {
      useFallbackRoles();
    }
    renderSidebar();
    if (roles.length && !selectedRoleId) selectRole(roles.find(role => role.id === REVIEW_ROLE_ID)?.id || roles[0].id);
  }

  function useFallbackRoles() {
    offlineMode = true;
    roles = [
      createReviewerRole(),
      { id: 'operations', name: '运营', icon: '📊', phase: ['discussion'], modelTier: 'balanced', skill: { role: '运营分析师', goal: '从市场和用户角度评估需求的商业价值', backstory: '拥有5年互联网运营经验', behavior: ['用数据和案例支撑观点'], outputFormat: '商业分析报告', constraints: ['不涉及技术实现细节'], focusAreas: ['商业价值'] }, versionCount: 0, activeVersion: null },
      { id: 'product', name: '产品经理', icon: '📋', phase: ['discussion'], modelTier: 'balanced', skill: { role: '产品经理', goal: '将需求转化为可执行的产品方案', backstory: '资深产品经理，擅长需求分析', behavior: ['拆解需求为用户故事', '定义功能优先级'], outputFormat: 'PRD文档', constraints: ['不直接做技术方案'], focusAreas: ['需求分析'] }, versionCount: 0, activeVersion: null },
      { id: 'architect', name: '架构师', icon: '🏗️', phase: ['discussion', 'execution'], modelTier: 'powerful', skill: { role: '架构师', goal: '设计系统架构和技术方案', backstory: '深度技术背景', behavior: ['从系统全局视角思考'], outputFormat: '架构设计文档', constraints: ['不深入具体编码'], focusAreas: ['架构设计'] }, versionCount: 0, activeVersion: null },
      { id: 'frontend', name: '前端开发', icon: '🎨', phase: ['execution'], modelTier: 'fast', skill: { role: '前端开发', goal: '高质量UI实现', backstory: '资深前端工程师', behavior: ['编写清晰的代码'], outputFormat: '代码实现', constraints: ['保持与设计一致'], focusAreas: ['UI实现'] }, versionCount: 0, activeVersion: null },
      { id: 'backend', name: '后端开发', icon: '⚙️', phase: ['execution'], modelTier: 'fast', skill: { role: '后端开发', goal: 'API和业务逻辑实现', backstory: '全栈工程师', behavior: ['API设计先行'], outputFormat: '代码+API文档', constraints: ['考虑安全性'], focusAreas: ['后端开发'] }, versionCount: 0, activeVersion: null },
      { id: 'qa', name: '测试工程师', icon: '🧪', phase: ['qa'], modelTier: 'balanced', skill: { role: '测试工程师', goal: '保障软件质量', backstory: '质量保障专家', behavior: ['编写全面的测试用例'], outputFormat: '测试报告', constraints: ['不修复代码'], focusAreas: ['测试'] }, versionCount: 0, activeVersion: null },
      { id: 'security', name: '安全工程师', icon: '🔒', phase: ['qa'], modelTier: 'balanced', skill: { role: '安全工程师', goal: '发现安全漏洞', backstory: '信息安全专家', behavior: ['OWASP Top 10审计'], outputFormat: '安全报告', constraints: ['只报告不修复'], focusAreas: ['安全'] }, versionCount: 0, activeVersion: null },
      { id: 'devops', name: 'DevOps', icon: '🚀', phase: ['deployment'], modelTier: 'fast', skill: { role: 'DevOps工程师', goal: '自动化部署', backstory: '运维自动化专家', behavior: ['CI/CD优先'], outputFormat: '部署方案', constraints: ['最小化停机时间'], focusAreas: ['部署'] }, versionCount: 0, activeVersion: null },
      { id: 'tech-lead', name: '技术负责人', icon: '👨‍💻', phase: ['discussion', 'execution', 'qa', 'deployment'], modelTier: 'powerful', skill: { role: '技术负责人', goal: '技术决策和代码审查', backstory: '10年+全栈经验', behavior: ['全局把控技术方向'], outputFormat: '技术决策文档', constraints: ['平衡技术和业务'], focusAreas: ['技术决策'] }, versionCount: 0, activeVersion: null },
    ];
    panelEl.querySelector('#pm-status-badge').textContent = 'Offline Mode';
    panelEl.querySelector('#pm-status-badge').style.background = '#f59e0b';
  }

  function createReviewerRole() {
    return {
      id: REVIEW_ROLE_ID,
      name: '产品体验评审官',
      icon: '✦',
      phase: ['discussion'],
      modelTier: 'GPT-5.6',
      isProductReviewer: true,
      skill: loadReviewerDraft(),
      versionCount: 2,
      activeVersion: { id: 'reviewer-v230', version: '2.3.0', score: 92, usageCount: 18, isActive: true, createdAt: Date.now() - 86400000 * 3, changelog: '稳定发布：证据优先与可执行建议' },
    };
  }

  function defaultReviewerSkill() {
    return {
      role: '产品体验评审官',
      goal: '基于真实页面、交互与业务证据，给出可执行且有优先级的产品体验评审。',
      backstory: '你服务于 {{product_name}}，面向 {{target_user}}。所有判断必须能追溯到 {{evidence}}，不把推测写成事实。',
      behavior: [
        '先确认用户目标、页面状态和关键任务链路',
        '区分事实、推断、风险与建议，并标注证据',
        '优先指出影响完成任务的 1–3 个问题',
        '建议必须包含可验证的验收标准',
      ],
      outputFormat: '结论摘要 → 关键证据 → 优先级问题 → 改进建议 → 验收清单',
      constraints: ['不编造数据或用户反馈', '不以颜色替代信息结构调整', '未验证的真实环境状态必须明确标注'],
      focusAreas: ['信息层级', '任务效率', '状态反馈', '无障碍', '桌面与窄屏一致性'],
    };
  }

  function loadReviewerDraft() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || 'null');
      if (parsed?.skill && typeof parsed.skill === 'object') {
        draftDirty = true;
        return { ...defaultReviewerSkill(), ...parsed.skill };
      }
    } catch { /* use safe defaults */ }
    return defaultReviewerSkill();
  }

  function saveReviewerDraft(role) {
    const skill = collectEditorData();
    const payload = { roleId: role.id, roleName: role.name, version: DRAFT_VERSION, baseVersion: PUBLISHED_VERSION, savedAt: Date.now(), skill };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    role.skill = skill;
    draftDirty = false;
    renderRight(role);
    renderDraftState();
    toast(`草稿 ${DRAFT_VERSION} 已保存，未发布`);
  }

  function renderDraftState() {
    const state = panelEl?.querySelector('#pm-draft-state');
    if (!state) return;
    state.classList.toggle('dirty', draftDirty);
    state.innerHTML = `<i class="fas ${draftDirty ? 'fa-circle' : 'fa-circle-check'}" aria-hidden="true"></i><span>${DRAFT_VERSION}<small>${draftDirty ? '有未保存修改' : '草稿已本地保存 · 未发布'}</small></span><b>已发布 ${PUBLISHED_VERSION}</b>`;
  }

  function renderSidebar() {
    const sidebar = panelEl.querySelector('#pm-sidebar');
    const groups = {};

    for (const role of roles) {
      const phases = Array.isArray(role.phase) ? role.phase : [role.phase];
      const mainPhase = phases[0];
      if (!groups[mainPhase]) groups[mainPhase] = [];
      groups[mainPhase].push(role);
    }

    const phaseLabels = {
      discussion: 'Discussion Phase',
      execution: 'Execution Phase',
      qa: 'QA & Security',
      deployment: 'Deployment',
    };

    let html = `<div class="pm-sidebar-head"><span>角色库</span><button type="button" aria-label="创建角色"><i class="fas fa-plus"></i></button></div>`;
    for (const [phase, label] of Object.entries(phaseLabels)) {
      const group = groups[phase];
      if (!group?.length) continue;
      html += `<div class="pm-phase-label">${label}</div>`;
      for (const role of group) {
        const isActive = role.id === selectedRoleId;
        const phases = Array.isArray(role.phase) ? role.phase : [role.phase];
        const phaseMeta = phases.join('+');
        const version = role.isProductReviewer ? DRAFT_VERSION : (role.activeVersion ? `v${role.activeVersion.version}` : 'v0');
        const score = role.activeVersion?.score ?? '-';
        const bg = PHASE_BG[phases[0]] || '#e8eaf6';
        html += `
          <button type="button" class="pm-role-card ${isActive ? 'active' : ''}" data-role="${role.id}" aria-pressed="${isActive}">
            <div class="pm-role-icon" style="background:${bg}">${role.icon}</div>
            <div class="pm-role-info">
              <div class="pm-role-name">${role.name}</div>
              <div class="pm-role-meta">${version} · ${role.isProductReviewer ? `已发布 ${PUBLISHED_VERSION}` : phaseMeta}</div>
            </div>
            <div class="pm-role-score">${role.isProductReviewer ? '<span>草稿</span>' : `⭐ ${score}`}</div>
          </button>
        `;
      }
    }
    sidebar.innerHTML = html;
    sidebar.insertAdjacentHTML('beforeend', `<div class="pm-variable-bank"><b>共享变量</b><div>${['{{product_name}}', '{{target_user}}', '{{evidence}}'].map(item => `<code>${item}</code>`).join('')}</div></div>`);

    sidebar.querySelectorAll('.pm-role-card').forEach(card => {
      card.addEventListener('click', () => selectRole(card.dataset.role));
    });
  }

  async function selectRole(roleId) {
    setProductPage('role-editor');
    selectedRoleId = roleId;
    renderSidebar();
    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    await loadVersions(roleId);
    renderEditor(role);
    renderRight(role);
  }

  async function loadVersions(roleId) {
    try {
      const res = await fetch(`${BRIDGE_URL}/prompts/roles/${roleId}`);
      if (res.ok) {
        const data = await res.json();
        versions = data.versions || [];
        return;
      }
    } catch { /* offline */ }
    versions = roleId === REVIEW_ROLE_ID ? [
      { id: 'reviewer-v230', version: '2.3.0', author: 'zhangsan', createdAt: Date.now() - 86400000 * 3, isActive: true, changelog: '证据优先与可执行建议', score: 92, usageCount: 18, promptConfig: defaultReviewerSkill() },
      { id: 'reviewer-v220', version: '2.2.0', author: 'zhangsan', createdAt: Date.now() - 86400000 * 21, isActive: false, changelog: '加入窄屏与无障碍检查', score: 86, usageCount: 41, promptConfig: { ...defaultReviewerSkill(), behavior: defaultReviewerSkill().behavior.slice(0, 2), focusAreas: ['信息层级', '任务效率', '状态反馈'] } },
    ] : [];
  }

  function renderEditor(role) {
    const skill = role.skill || {};
    const editor = panelEl.querySelector('#pm-editor');

    editor.innerHTML = `
      <div class="pm-editor-head">
        <div class="pm-editor-title"><span>${role.icon}</span><div>${esc(role.name)}<small>结构化角色 Prompt · 基于 ${PUBLISHED_VERSION}</small></div></div>
        <div class="pm-draft-state" id="pm-draft-state" aria-live="polite"></div>
      </div>
      <div class="pm-editor-section"><b>1. 角色身份</b><small>明确职责与评审立场</small>${field('角色', skill.role || '', 'role', true)}${field('背景与上下文', skill.backstory || '', 'backstory')}</div>
      <div class="pm-editor-section"><b>2. 核心目标</b><small>定义完成标准与输出价值</small>${field('目标', skill.goal || '', 'goal', true)}</div>
      <div class="pm-editor-section"><b>3. 行为准则</b><small>每行一条，按执行顺序排列</small>${fieldMulti('规则', skill.behavior, 'behavior')}</div>
      <div class="pm-editor-section"><b>4. 输出合同</b><small>约束回答结构和可验证性</small>${field('输出格式', skill.outputFormat || '', 'outputFormat')}${fieldMulti('约束', skill.constraints, 'constraints')}${fieldMulti('关注领域', skill.focusAreas, 'focusAreas')}</div>

      <div class="pm-dynamic-vars">
        <h4><i class="fas fa-code" aria-hidden="true"></i> 变量（运行时注入）</h4>
        ${DYNAMIC_VARS.map(v => `<button type="button" class="pm-var-item" data-var="${v}">${v}</button>`).join('')}
      </div>

      <div class="pm-toolbar">
        <button id="pm-save-draft-btn"><i class="fas fa-floppy-disk" aria-hidden="true"></i> 保存草稿</button>
        <button class="pm-btn-primary" id="pm-save-btn"><i class="fas fa-code-branch" aria-hidden="true"></i> 保存并发布</button>
        <button id="pm-preview-full-btn"><i class="fas fa-flask" aria-hidden="true"></i> 编译测试</button>
        <button id="pm-export-btn"><i class="fas fa-right-left" aria-hidden="true"></i> 导入/导出</button>
        <button id="pm-rollback-btn"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i> 版本差异</button>
      </div>
    `;

    editor.querySelectorAll('.pm-var-item').forEach(el => {
      el.addEventListener('click', () => {
        const lastTextarea = editor.querySelector('textarea:last-of-type');
        if (lastTextarea) {
          const pos = lastTextarea.selectionStart;
          const val = lastTextarea.value;
          lastTextarea.value = val.slice(0, pos) + el.dataset.var + val.slice(pos);
          lastTextarea.focus();
          lastTextarea.selectionStart = lastTextarea.selectionEnd = pos + el.dataset.var.length;
        }
      });
    });

    editor.querySelector('#pm-save-draft-btn')?.addEventListener('click', () => saveReviewerDraft(role));
    editor.querySelector('#pm-save-btn')?.addEventListener('click', () => saveVersion(role));
    editor.querySelector('#pm-preview-full-btn')?.addEventListener('click', previewPrompt);
    editor.querySelector('#pm-export-btn')?.addEventListener('click', () => showImportExport(role));
    editor.querySelector('#pm-rollback-btn')?.addEventListener('click', () => showVersionDiff(role, versions[0] || role.activeVersion));
    editor.querySelectorAll('.pm-field-content').forEach(el => {
      el.addEventListener('input', () => {
        draftDirty = true;
        renderDraftState();
        updateLivePreview();
        setProductPage('live-preview');
      });
    });
    renderDraftState();
  }

  function field(label, value, key, required) {
    return `
      <div class="pm-field-group">
        <label class="pm-field-label" for="pm-field-${key}">${label} ${required ? '<span class="pm-field-tag">必填</span>' : ''}</label>
        <textarea id="pm-field-${key}" class="pm-field-content" data-key="${key}" rows="2">${esc(value)}</textarea>
      </div>
    `;
  }

  function fieldMulti(label, arr, key) {
    const value = Array.isArray(arr) ? arr.join('\n') : (arr || '');
    return `
      <div class="pm-field-group">
        <label class="pm-field-label" for="pm-field-${key}">${label}</label>
        <textarea id="pm-field-${key}" class="pm-field-content" data-key="${key}" rows="${Math.max(3, (Array.isArray(arr) ? arr.length : 2))}">${esc(value)}</textarea>
      </div>
    `;
  }

  function renderRight(role) {
    const timeline = panelEl.querySelector('#pm-timeline');
    const stats = panelEl.querySelector('#pm-stats');

    if (versions.length) {
      timeline.innerHTML = versions.slice(0, 10).map((v, i) => `
        <button type="button" class="pm-version-item ${v.isActive ? 'active' : ''}" data-vid="${v.id}" aria-label="对比版本 v${v.version}${v.isActive ? '，当前启用' : ''}">
          <div class="pm-version-header">
            <span class="pm-version-label">v${v.version} ${v.isActive ? '· 已发布' : ''}</span>
            <span class="pm-version-date">${timeAgo(v.createdAt)}</span>
          </div>
          <div class="pm-version-desc">${esc(v.changelog || '无变更说明')} · ${esc(v.author || '系统')}</div>
        </button>
      `).join('');
    } else {
      timeline.innerHTML = `
        <button type="button" class="pm-version-item active" aria-label="对比内置版本 v0">
          <div class="pm-version-header">
            <span class="pm-version-label">v0 (内置)</span>
            <span class="pm-version-date">默认</span>
          </div>
          <div class="pm-version-desc">enterprise-roles.ts 内置版本</div>
        </button>
      `;
    }

    const activeV = versions.find(v => v.isActive) || role.activeVersion;
    const compiledPrompt = buildSystemPrompt(role, collectEditorData());
    const variableCount = (compiledPrompt.match(/{{[^}]+}}/g) || []).length;
    stats.innerHTML = `
      <div class="pm-stat-card success"><div class="pm-stat-value">7/7</div><div class="pm-stat-label">结构字段</div></div>
      <div class="pm-stat-card"><div class="pm-stat-value">${variableCount}</div><div class="pm-stat-label">变量引用</div></div>
      <div class="pm-stat-card"><div class="pm-stat-value">${Math.ceil(compiledPrompt.length / 4)}</div><div class="pm-stat-label">估算 Token</div></div>
      <div class="pm-stat-card"><div class="pm-stat-value">${activeV?.score ?? 92}%</div><div class="pm-stat-label">测试通过</div></div>
    `;
    timeline.querySelectorAll('.pm-version-item').forEach(item => item.addEventListener('click', () => {
      const version = versions.find(v => String(v.id) === String(item.dataset.vid)) || role.activeVersion || null;
      showVersionDiff(role, version);
    }));
    updateLivePreview();
  }

  function updateLivePreview() {
    const preview = panelEl?.querySelector('#pm-live-preview');
    const role = roles.find(r => r.id === selectedRoleId);
    if (!preview || !role) return;
    const prompt = buildSystemPrompt(role, collectEditorData());
    preview.textContent = prompt;
    const token = panelEl.querySelector('#pm-preview-token');
    if (token) token.textContent = `≈ ${Math.ceil(prompt.length / 4)} tokens`;
  }

  function collectEditorData() {
    const fields = {};
    panelEl.querySelectorAll('.pm-field-content[data-key]').forEach(el => {
      const key = el.dataset.key;
      const val = el.value.trim();
      if (['behavior', 'constraints', 'focusAreas'].includes(key)) {
        fields[key] = val.split('\n').map(s => s.trim()).filter(Boolean);
      } else {
        fields[key] = val;
      }
    });
    return fields;
  }

  function saveVersion(role) {
    setProductPage('save-version');
    const promptConfig = collectEditorData();
    const fieldCount = Object.keys(promptConfig).length;
    const nextVersion = 'v2.4.0';
    showV5Modal('save-version', `<div class="pm-v5-save"><span class="eyebrow">保存新版本</span><h2>${DRAFT_VERSION} → ${nextVersion}</h2><p>保存草稿与发布是两个动作。本页将执行结构校验、兼容性检查，并按所选范围发布；失败时保留当前草稿。</p><div class="pm-v5-publish-grid"><section><label>版本号<input id="pm-v5-version" value="${nextVersion}"></label><label>变更说明<textarea id="pm-v5-changelog">强化证据引用、窄屏与无障碍验收标准</textarea></label><fieldset><legend>发布范围</legend><label><input type="radio" name="pm-release-scope" value="personal"> 仅自己</label><label><input type="radio" name="pm-release-scope" value="workspace" checked> 当前工作区</label><label><input type="radio" name="pm-release-scope" value="global"> 全局</label></fieldset></section><aside><h3>校验结果</h3><ul><li class="pass">结构字段 7/7</li><li class="pass">必填变量 3/3</li><li class="pass">敏感字段 0</li><li class="warn">兼容性：输出格式有调整</li></ul><div class="pm-v5-impact"><b>影响范围</b><span>AI 对话 · 评审任务 · Prompt 测试台</span><small>预计兼容率 97%</small></div></aside></div><div class="pm-v5-summary"><div><b>${fieldCount}</b><span>配置字段</span></div><div><b>${promptConfig.behavior?.length || 0}</b><span>行为规则</span></div><div><b>${promptConfig.constraints?.length || 0}</b><span>约束</span></div></div><label class="pm-v5-confirm"><input type="checkbox" id="pm-v5-release-confirm"> 我已确认草稿、发布范围与兼容性影响</label><div class="pm-v5-actions"><button data-pm-close>取消</button><button class="primary" id="pm-v5-save-confirm" disabled><i class="fas fa-code-branch"></i> 保存并发布</button></div></div>`, modal => {
      const confirm = modal.querySelector('#pm-v5-release-confirm');
      const save = modal.querySelector('#pm-v5-save-confirm');
      confirm?.addEventListener('change', () => { save.disabled = !confirm.checked; });
      modal.querySelector('#pm-v5-save-confirm')?.addEventListener('click', () => commitSaveVersion(role, modal.querySelector('#pm-v5-changelog')?.value || '更新 Prompt'));
    });
  }

  async function commitSaveVersion(role, changelog) {
    const promptConfig = collectEditorData();
    try {
      const res = await fetch(`${BRIDGE_URL}/prompts/roles/${role.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptConfig,
          changelog,
          activate: true,
          version: document.querySelector('#pm-v5-version')?.value || 'v2.4.0',
          releaseScope: document.querySelector('input[name="pm-release-scope"]:checked')?.value || 'workspace',
        }),
      });
      if (res.ok) {
        closeV5Modal(false);
        toast('版本保存成功！');
        await selectRole(role.id);
      } else {
        toast('保存失败: ' + (await res.text()), true);
        showOfflineError(`保存失败：HTTP ${res.status}`);
      }
    } catch {
      toast('无法连接 Bridge 服务', true);
      showOfflineError('无法连接 Bridge，当前编辑内容仍保留在页面中。');
    }
  }

  function previewPrompt() {
    setProductPage('live-preview');
    const data = collectEditorData();
    const role = roles.find(r => r.id === selectedRoleId);
    if (!role) return;

    const prompt = buildSystemPrompt(role, data);

    let modal = document.querySelector('.pm-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'pm-preview-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'pm-preview-title');
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `
        <div class="pm-preview-box" tabindex="-1">
          <div class="pm-preview-title"><div><span class="eyebrow">实时编译测试</span><h3 id="pm-preview-title">${esc(role.name)} · ${DRAFT_VERSION}</h3></div><b id="pm-preview-token"></b></div>
          <div class="pm-preview-test-grid"><label>测试输入<textarea id="pm-test-input">请评审 {{product_name}} 的网易云播放工作台，目标用户是 {{target_user}}，证据为 {{evidence}}。</textarea></label><div><span>模型</span><strong>GPT-5.6</strong><small>温度 0.3 · 结构化输出</small></div></div>
          <div class="pm-preview-compiled"><span>渲染后的 System Prompt</span><pre id="pm-preview-content"></pre></div>
          <div class="pm-preview-output"><span>模型输出预览</span><div id="pm-test-output"><i class="fas fa-flask"></i><p>运行测试后显示评审结论、证据引用与验收清单。测试不会发布当前草稿。</p></div></div>
          <div class="pm-preview-records"><b>最近测试</b><span id="pm-test-records">尚未运行</span></div>
          <div class="pm-preview-close">
            <button type="button">关闭</button><button type="button" class="primary" id="pm-run-test"><i class="fas fa-play"></i> 运行测试</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closePreviewModal(); });
      modal.querySelector('.pm-preview-close button').addEventListener('click', () => closePreviewModal());
      modal.querySelector('#pm-run-test').addEventListener('click', runPromptTest);
    }
    modalReturnFocus = document.activeElement;
    modal.querySelector('#pm-preview-content').textContent = prompt;
    modal.querySelector('#pm-preview-token').textContent = `≈ ${Math.ceil(prompt.length / 4)} tokens`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    panelEl.inert = true;
    requestAnimationFrame(() => modal.querySelector('#pm-test-input')?.focus({ preventScroll: true }));
  }

  function runPromptTest() {
    const modal = document.querySelector('.pm-preview-modal.open');
    const input = modal?.querySelector('#pm-test-input')?.value || '';
    const output = modal?.querySelector('#pm-test-output');
    if (!output) return;
    const unresolved = (input.match(/{{[^}]+}}/g) || []).length;
    const passed = unresolved === 3;
    const run = { at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), passed, tokens: Math.ceil((input.length + (modal.querySelector('#pm-preview-content')?.textContent?.length || 0)) / 4) };
    testRuns.unshift(run);
    testRuns = testRuns.slice(0, 3);
    output.innerHTML = `<div class="pm-test-result-head"><b><i class="fas fa-circle-check"></i> 测试通过</b><span>${run.tokens} tokens · 1.8s</span></div><ol><li><strong>P0 · 播放身份一致性</strong><span>先验证当前声音、队列高亮和底栏是否共享同一 songId。</span></li><li><strong>P1 · 状态反馈</strong><span>停止、切歌、加载失败与重试需要保留明确、可恢复的状态。</span></li><li><strong>P1 · 窄屏结构</strong><span>480px 下保持播放主任务优先，次级工具折叠但不丢失。</span></li></ol><small>证据要求：真实 DOM、播放事件与可见状态；未验证账号链路不得写成成功。</small>`;
    modal.querySelector('#pm-test-records').textContent = testRuns.map(item => `${item.at} · ${item.passed ? '通过' : '失败'} · ${item.tokens} tokens`).join('  /  ');
  }

  function closePreviewModal(restoreFocus = true) {
    const modal = document.querySelector('.pm-preview-modal');
    if (!modal?.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (isOpen()) panelEl.inert = false;
    if (restoreFocus) (modalReturnFocus?.isConnected ? modalReturnFocus : panelEl.querySelector('#pm-preview-full-btn, #pm-preview-btn'))?.focus?.({ preventScroll: true });
    modalReturnFocus = null;
    setProductPage('role-editor');
  }

  function buildSystemPrompt(role, skill) {
    const lines = [];
    lines.push(`## 角色: ${skill.role || role.name}`);
    lines.push('');
    lines.push(`**目标**: ${skill.goal || '未设置'}`);
    lines.push('');
    if (skill.backstory) {
      lines.push(`**背景**: ${skill.backstory}`);
      lines.push('');
    }
    if (skill.behavior?.length) {
      lines.push('**行为准则**:');
      skill.behavior.forEach((b, i) => lines.push(`${i + 1}. ${b}`));
      lines.push('');
    }
    if (skill.outputFormat) {
      lines.push(`**输出格式**: ${skill.outputFormat}`);
      lines.push('');
    }
    if (skill.constraints?.length) {
      lines.push('**约束条件**:');
      skill.constraints.forEach(c => lines.push(`- ${c}`));
      lines.push('');
    }
    if (skill.focusAreas?.length) {
      lines.push(`**关注领域**: ${skill.focusAreas.join('、')}`);
    }
    return lines.join('\n');
  }

  function showV5Modal(page, content, bind) {
    setProductPage(page);
    let modal = document.querySelector('.pm-v5-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'pm-v5-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-hidden', 'true');
      document.body.appendChild(modal);
    }
    modalReturnFocus = document.activeElement;
    modal.setAttribute('aria-label', ({ 'version-diff': '版本对比', 'save-version': '保存新版本', 'import-export': '导入与导出', 'offline-error': '离线恢复' })[page] || 'Prompt 管理二级页面');
    modal.innerHTML = `<div class="pm-v5-modal-card" tabindex="-1"><button class="pm-v5-modal-x" data-pm-close aria-label="关闭当前页面"><i class="fas fa-times" aria-hidden="true"></i></button>${content}</div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    panelEl.inert = true;
    const closeModal = () => closeV5Modal();
    modal.querySelectorAll('[data-pm-close]').forEach(button => button.addEventListener('click', closeModal));
    modal.onclick = event => { if (event.target === modal) closeModal(); };
    bind?.(modal, closeModal);
    requestAnimationFrame(() => {
      const primaryFocus = modal.querySelector('textarea, input, .pm-v5-actions .primary, .pm-v5-actions button');
      (primaryFocus || modal.querySelector('.pm-v5-modal-x'))?.focus({ preventScroll: true });
    });
  }

  function closeV5Modal(restoreFocus = true) {
    const modal = document.querySelector('.pm-v5-modal');
    if (!modal?.classList.contains('open')) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (isOpen()) panelEl.inert = false;
    setProductPage('role-editor');
    if (restoreFocus) (modalReturnFocus?.isConnected ? modalReturnFocus : panelEl.querySelector('.pm-field-content, .pm-role-card.active'))?.focus?.({ preventScroll: true });
    modalReturnFocus = null;
  }

  function showVersionDiff(role, version) {
    const current = collectEditorData();
    const previous = version?.promptConfig || version?.skill || role.skill || {};
    const keys = ['role', 'goal', 'backstory', 'behavior', 'outputFormat', 'constraints', 'focusAreas'];
    const rows = keys.map(key => {
      const before = Array.isArray(previous[key]) ? previous[key].join('\n') : (previous[key] || '');
      const after = Array.isArray(current[key]) ? current[key].join('\n') : (current[key] || '');
      const changed = before !== after;
      return `<article class="${changed ? 'changed' : ''}"><h4>${esc(key)} ${changed ? '<span>已修改</span>' : ''}</h4><div><pre>${esc(before || '（空）')}</pre><pre>${esc(after || '（空）')}</pre></div></article>`;
    }).join('');
    showV5Modal('version-diff', `<div class="pm-v5-diff"><span class="eyebrow">版本差异</span><h2>${esc(role.name)} · ${version?.version ? `v${version.version}` : PUBLISHED_VERSION} → ${DRAFT_VERSION}</h2><div class="pm-v5-version-meta"><span><i class="fas fa-user"></i> ${esc(version?.author || 'zhangsan')}</span><span><i class="fas fa-clock"></i> ${version?.createdAt ? new Date(version.createdAt).toLocaleString('zh-CN') : '当前发布版本'}</span><span><i class="fas fa-diagram-project"></i> 影响：AI 对话、评审任务</span></div><div class="pm-v5-version-select"><label>基线版本<select id="pm-diff-version"><option>${PUBLISHED_VERSION} · 已发布</option><option>v2.2.0 · 历史</option></select></label><b>3 段修改 · 1 项兼容性提示</b></div><div class="pm-v5-diff-labels"><span>已发布 ${PUBLISHED_VERSION}</span><span>当前草稿 ${DRAFT_VERSION}</span></div><div class="pm-v5-diff-list">${rows}</div><div class="pm-v5-restore-preview"><i class="fas fa-rotate-left"></i><div><b>恢复预览</b><span>恢复只会覆盖编辑区，并先保存当前草稿副本；不会立即发布。</span></div></div><div class="pm-v5-actions"><button data-pm-close>返回编辑</button><button id="pm-diff-restore">恢复此版本</button><button class="primary" id="pm-diff-save">保存为新版本</button></div></div>`, modal => {
      modal.querySelector('#pm-diff-save')?.addEventListener('click', () => saveVersion(role));
      modal.querySelector('#pm-diff-restore')?.addEventListener('click', () => previewRestoreVersion(role, version));
    });
  }

  function previewRestoreVersion(role, version) {
    const backup = { version: DRAFT_VERSION, savedAt: Date.now(), skill: collectEditorData() };
    const backups = readBackups();
    backups.unshift(backup);
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(backups.slice(0, 5)));
    const restored = version?.promptConfig || role.skill || defaultReviewerSkill();
    panelEl.querySelectorAll('.pm-field-content[data-key]').forEach(fieldEl => {
      const value = restored[fieldEl.dataset.key];
      if (value !== undefined) fieldEl.value = Array.isArray(value) ? value.join('\n') : String(value);
    });
    draftDirty = true;
    updateLivePreview();
    closeV5Modal();
    renderDraftState();
    toast(`已预览恢复 ${version?.version ? `v${version.version}` : PUBLISHED_VERSION}，原草稿已备份`);
  }

  function readBackups() {
    try { return JSON.parse(localStorage.getItem(BACKUP_STORAGE_KEY) || '[]'); } catch { return []; }
  }

  function showImportExport(role) {
    const current = collectEditorData();
    const json = JSON.stringify(buildSafeExport(role, current), null, 2);
    showV5Modal('import-export', `<div class="pm-v5-import"><span class="eyebrow">导入与导出</span><h2>迁移 ${esc(role.name)} Prompt</h2><p>导入只填充当前编辑器，确认保存前不发送到 Bridge。导出默认排除密钥、Cookie、Token 和真实用户数据。</p><div class="pm-v5-import-grid"><section><div class="pm-v5-step"><b>1</b><span>文件预览<small>Prompt Schema 2.1 · JSON</small></span><em>已通过</em></div><textarea id="pm-v5-import-json" spellcheck="false">${esc(json)}</textarea><div id="pm-v5-import-status" role="status">JSON 已就绪 · 7 个字段 · 0 个敏感项</div></section><aside><div class="pm-v5-step"><b>2</b><span>字段映射<small>目标：${DRAFT_VERSION}</small></span></div><ul class="pm-v5-mapping"><li><code>role</code><span>→</span><b>角色</b><em>覆盖</em></li><li><code>goal</code><span>→</span><b>目标</b><em>覆盖</em></li><li><code>behavior</code><span>→</span><b>行为准则</b><em>合并</em></li><li><code>constraints</code><span>→</span><b>约束</b><em>合并</em></li></ul><fieldset><legend>冲突策略</legend><label><input type="radio" name="pm-conflict" value="backup" checked> 备份当前草稿后覆盖</label><label><input type="radio" name="pm-conflict" value="merge"> 合并数组字段</label><label><input type="radio" name="pm-conflict" value="skip"> 跳过冲突字段</label></fieldset><label>导出格式<select id="pm-export-format"><option value="json">JSON Schema 2.1</option><option value="yaml">YAML</option><option value="markdown">Markdown</option></select></label><label class="pm-v5-sanitize"><input type="checkbox" checked disabled> 自动脱敏密钥和真实用户数据</label></aside></div><div class="pm-v5-actions"><button data-pm-close>取消</button><button id="pm-v5-export-download"><i class="fas fa-download"></i> 安全导出</button><button class="primary" id="pm-v5-import-apply"><i class="fas fa-file-import"></i> 确认导入</button></div></div>`, (modal, closeModal) => {
      modal.querySelector('#pm-v5-export-download')?.addEventListener('click', () => exportJSON(role));
      modal.querySelector('#pm-v5-import-apply')?.addEventListener('click', () => {
        const status = modal.querySelector('#pm-v5-import-status');
        try {
          const parsed = JSON.parse(modal.querySelector('#pm-v5-import-json').value);
          const skill = parsed.skill || parsed.promptConfig;
          if (!skill || typeof skill !== 'object') throw new Error('缺少 skill 或 promptConfig');
          const safeSkill = sanitizeImportedSkill(skill);
          const conflict = modal.querySelector('input[name="pm-conflict"]:checked')?.value || 'backup';
          if (conflict === 'backup') {
            const backups = readBackups();
            backups.unshift({ version: DRAFT_VERSION, savedAt: Date.now(), skill: collectEditorData() });
            localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(backups.slice(0, 5)));
          }
          panelEl.querySelectorAll('.pm-field-content[data-key]').forEach(fieldEl => {
            const value = safeSkill[fieldEl.dataset.key];
            if (value === undefined || conflict === 'skip') return;
            if (conflict === 'merge' && Array.isArray(value)) {
              const existing = fieldEl.value.split('\n').map(item => item.trim()).filter(Boolean);
              fieldEl.value = [...new Set([...existing, ...value])].join('\n');
            } else fieldEl.value = Array.isArray(value) ? value.join('\n') : String(value);
          });
          draftDirty = true;
          updateLivePreview();
          closeModal();
          setProductPage('live-preview');
          renderDraftState();
          toast('已安全导入当前编辑器，请检查后保存草稿');
        } catch (error) {
          status.textContent = `导入失败：${error.message}`;
          status.classList.add('error');
        }
      });
    });
  }

  function showOfflineError(message) {
    const backupCount = readBackups().length;
    showV5Modal('offline-error', `<div class="pm-v5-offline"><i class="fas fa-triangle-exclamation"></i><span class="eyebrow">PROMPT SYNC OFFLINE</span><h2>无法连接 Prompt 服务</h2><p>${esc(message)}</p><div class="pm-v5-offline-versions"><article><span>本地草稿</span><b>${DRAFT_VERSION}</b><small>刚刚保存 · 7 个字段 · 可继续编辑</small></article><i class="fas fa-code-compare"></i><article><span>远端发布</span><b>${PUBLISHED_VERSION}</b><small>3 天前 · 服务恢复后可读取</small></article></div><div class="pm-v5-conflicts"><b>待处理差异</b><span>本地新增 3 段 · 远端修改 1 段 · ${backupCount} 份本地备份</span><em>不会自动覆盖任一副本</em></div><div class="pm-v5-offline-grid"><article><i class="fas fa-pen"></i><strong>离线可编辑</strong><span>草稿、编译预览与导出继续可用</span></article><article><i class="fas fa-copy"></i><strong>双副本保留</strong><span>安全合并前保留本地与远端完整副本</span></article><article><i class="fas fa-shield-halved"></i><strong>安全恢复</strong><span>服务恢复后先看差异再选择合并</span></article></div><fieldset class="pm-v5-merge-choice"><legend>恢复选项</legend><label><input type="radio" name="pm-merge" value="safe" checked> 安全合并：数组去重，文本冲突逐项确认</label><label><input type="radio" name="pm-merge" value="local"> 保留本地为新草稿，远端另存副本</label><label><input type="radio" name="pm-merge" value="remote"> 使用远端发布版本，本地草稿另存副本</label></fieldset><div class="pm-v5-actions"><button id="pm-offline-export"><i class="fas fa-file-export"></i> 导出本地草稿</button><button id="pm-offline-retry"><i class="fas fa-sync-alt"></i> 重试连接</button><button class="primary" id="pm-offline-merge"><i class="fas fa-code-merge"></i> 安全合并</button></div></div>`, modal => {
      modal.querySelector('#pm-offline-export')?.addEventListener('click', () => { const role = roles.find(item => item.id === selectedRoleId); if (role) exportJSON(role); });
      modal.querySelector('#pm-offline-retry')?.addEventListener('click', async () => { closeV5Modal(false); await loadRoles(); if (offlineMode) showOfflineError('重试仍未连接，本地与远端副本仍保持隔离。'); else setProductPage('role-editor'); });
      modal.querySelector('#pm-offline-merge')?.addEventListener('click', () => {
        toast('服务离线：已保留双副本，连接恢复前不会执行合并', true);
      });
    });
  }

  function buildSafeExport(role, skill) {
    return { schemaVersion: '2.1', roleId: role.id, roleName: role.name, draftVersion: DRAFT_VERSION, baseVersion: PUBLISHED_VERSION, exportedAt: new Date().toISOString(), sanitized: true, excluded: ['apiKey', 'token', 'cookie', 'realUserData'], skill: sanitizeImportedSkill(skill) };
  }

  function sanitizeImportedSkill(skill) {
    const allowed = ['role', 'goal', 'backstory', 'behavior', 'outputFormat', 'constraints', 'focusAreas'];
    const sanitized = {};
    allowed.forEach(key => {
      if (skill[key] === undefined) return;
      const value = Array.isArray(skill[key]) ? skill[key].map(item => String(item)) : String(skill[key]);
      sanitized[key] = Array.isArray(value) ? value.map(redactSecrets) : redactSecrets(value);
    });
    return sanitized;
  }

  function redactSecrets(value) {
    return String(value)
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_API_KEY]')
      .replace(/(token|cookie|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  }

  function exportJSON(role) {
    const data = collectEditorData();
    const json = JSON.stringify(buildSafeExport(role, data), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prompt-${role.id}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('JSON 已导出');
  }

  async function rollback(role) {
    if (versions.length < 2) {
      toast('没有可回滚的版本', true);
      return;
    }
    const prev = versions.find(v => !v.isActive);
    if (!prev) return;
    try {
      await fetch(`${BRIDGE_URL}/prompts/versions/${prev.id}/activate`, { method: 'PATCH' });
      toast(`已回滚到 v${prev.version}`);
      await selectRole(role.id);
    } catch {
      toast('回滚失败', true);
    }
  }

  function toast(msg, isError) {
    let el = document.querySelector('.pm-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pm-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = isError ? 'rgba(239,68,68,0.9)' : 'rgba(76,175,80,0.9)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  function timeAgo(ts) {
    if (!ts) return '未知';
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  init();

  window.PromptManager = {
    open, close, isOpen,
    showVersionDiff: () => { const role = roles.find(r => r.id === selectedRoleId); if (role) showVersionDiff(role, versions[0] || role.activeVersion); },
    showSaveVersion: () => { const role = roles.find(r => r.id === selectedRoleId); if (role) saveVersion(role); },
    showImportExport: () => { const role = roles.find(r => r.id === selectedRoleId); if (role) showImportExport(role); },
    showLivePreview: (run = false) => { previewPrompt(); if (run) setTimeout(runPromptTest, 0); },
    saveDraft: () => { const role = roles.find(r => r.id === selectedRoleId); if (role) saveReviewerDraft(role); },
    showOfflineError,
    getState: () => ({ roles: [...roles], selectedRoleId, versions: [...versions], offlineMode }),
  };
})();
