/**
 * Prompt Manager — Multi-Role Prompt Dashboard
 * Dashboard 仪表盘式管理界面，左侧角色列表 / 中间编辑器 / 右侧版本+统计
 */
(function () {
  'use strict';

  const BRIDGE_URL = 'http://127.0.0.1:19840';
  const DYNAMIC_VARS = [
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
    panelEl.innerHTML = `
      <div class="pm-header">
        <h2><i class="fas fa-magic" style="color:#a78bfa"></i> Multi-Role Prompt Manager</h2>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="pm-badge" id="pm-status-badge">Loading...</span>
          <button class="pm-close-btn" id="pm-close-btn"><i class="fas fa-times"></i></button>
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
          <h3>版本历史</h3>
          <div id="pm-timeline" class="pm-timeline"></div>
          <h3 style="margin-top:20px">效果统计</h3>
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelEl.classList.contains('open')) close();
    });
  }

  async function open() {
    overlayEl.classList.add('open');
    panelEl.classList.add('open');
    await loadRoles();
  }

  function close() {
    overlayEl.classList.remove('open');
    panelEl.classList.remove('open');
  }

  function isOpen() {
    return panelEl && panelEl.classList.contains('open');
  }

  async function loadRoles() {
    try {
      const res = await fetch(`${BRIDGE_URL}/prompts/roles`);
      if (res.ok) {
        roles = await res.json();
        panelEl.querySelector('#pm-status-badge').textContent = `${roles.length} Roles`;
        panelEl.querySelector('#pm-status-badge').style.background = '#4CAF50';
      } else {
        useFallbackRoles();
      }
    } catch {
      useFallbackRoles();
    }
    renderSidebar();
    if (roles.length && !selectedRoleId) {
      selectRole(roles[0].id);
    }
  }

  function useFallbackRoles() {
    roles = [
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

    let html = '';
    for (const [phase, label] of Object.entries(phaseLabels)) {
      const group = groups[phase];
      if (!group?.length) continue;
      html += `<div class="pm-phase-label">${label}</div>`;
      for (const role of group) {
        const isActive = role.id === selectedRoleId;
        const phases = Array.isArray(role.phase) ? role.phase : [role.phase];
        const phaseMeta = phases.join('+');
        const version = role.activeVersion ? `v${role.activeVersion.version}` : 'v0';
        const score = role.activeVersion?.score ?? '-';
        const bg = PHASE_BG[phases[0]] || '#e8eaf6';
        html += `
          <div class="pm-role-card ${isActive ? 'active' : ''}" data-role="${role.id}">
            <div class="pm-role-icon" style="background:${bg}">${role.icon}</div>
            <div class="pm-role-info">
              <div class="pm-role-name">${role.name}</div>
              <div class="pm-role-meta">${version} · ${phaseMeta}</div>
            </div>
            <div class="pm-role-score">⭐ ${score}</div>
          </div>
        `;
      }
    }
    sidebar.innerHTML = html;

    sidebar.querySelectorAll('.pm-role-card').forEach(card => {
      card.addEventListener('click', () => selectRole(card.dataset.role));
    });
  }

  async function selectRole(roleId) {
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
    versions = [];
  }

  function renderEditor(role) {
    const skill = role.skill || {};
    const editor = panelEl.querySelector('#pm-editor');

    editor.innerHTML = `
      <div class="pm-editor-title">${role.icon} ${role.name} Prompt 配置</div>
      ${field('Role', skill.role || '', 'role', true)}
      ${field('Goal', skill.goal || '', 'goal', true)}
      ${field('Backstory', skill.backstory || '', 'backstory')}
      ${fieldMulti('Behavior Rules', skill.behavior, 'behavior')}
      ${field('Output Format', skill.outputFormat || '', 'outputFormat')}
      ${fieldMulti('Constraints', skill.constraints, 'constraints')}
      ${fieldMulti('Focus Areas', skill.focusAreas, 'focusAreas')}

      <div class="pm-dynamic-vars">
        <h4>🔌 动态变量 (执行时注入)</h4>
        ${DYNAMIC_VARS.map(v => `<span class="pm-var-item" data-var="${v}">${v}</span>`).join('')}
      </div>

      <div class="pm-toolbar">
        <button class="pm-btn-primary" id="pm-save-btn"><i class="fas fa-save"></i> 保存新版本</button>
        <button id="pm-preview-full-btn"><i class="fas fa-eye"></i> 预览完整 Prompt</button>
        <button id="pm-export-btn"><i class="fas fa-file-export"></i> 导出 JSON</button>
        <button id="pm-rollback-btn"><i class="fas fa-undo"></i> 回滚</button>
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

    editor.querySelector('#pm-save-btn')?.addEventListener('click', () => saveVersion(role));
    editor.querySelector('#pm-preview-full-btn')?.addEventListener('click', previewPrompt);
    editor.querySelector('#pm-export-btn')?.addEventListener('click', () => exportJSON(role));
    editor.querySelector('#pm-rollback-btn')?.addEventListener('click', () => rollback(role));
  }

  function field(label, value, key, required) {
    return `
      <div class="pm-field-group">
        <div class="pm-field-label">${label} ${required ? '<span class="pm-field-tag">必填</span>' : ''}</div>
        <textarea class="pm-field-content" data-key="${key}" rows="2">${esc(value)}</textarea>
      </div>
    `;
  }

  function fieldMulti(label, arr, key) {
    const value = Array.isArray(arr) ? arr.join('\n') : (arr || '');
    return `
      <div class="pm-field-group">
        <div class="pm-field-label">${label}</div>
        <textarea class="pm-field-content" data-key="${key}" rows="${Math.max(3, (Array.isArray(arr) ? arr.length : 2))}">${esc(value)}</textarea>
      </div>
    `;
  }

  function renderRight(role) {
    const timeline = panelEl.querySelector('#pm-timeline');
    const stats = panelEl.querySelector('#pm-stats');

    if (versions.length) {
      timeline.innerHTML = versions.slice(0, 10).map((v, i) => `
        <div class="pm-version-item ${v.isActive ? 'active' : ''}" data-vid="${v.id}">
          <div class="pm-version-header">
            <span class="pm-version-label">v${v.version} ${v.isActive ? '(active)' : ''}</span>
            <span class="pm-version-date">${timeAgo(v.createdAt)}</span>
          </div>
          <div class="pm-version-desc">${esc(v.changelog || '无变更说明')}</div>
        </div>
      `).join('');
    } else {
      timeline.innerHTML = `
        <div class="pm-version-item active">
          <div class="pm-version-header">
            <span class="pm-version-label">v0 (内置)</span>
            <span class="pm-version-date">默认</span>
          </div>
          <div class="pm-version-desc">enterprise-roles.ts 内置版本</div>
        </div>
      `;
    }

    const activeV = versions.find(v => v.isActive) || role.activeVersion;
    stats.innerHTML = `
      <div class="pm-stat-card"><div class="pm-stat-value">${activeV?.score ?? '-'}</div><div class="pm-stat-label">评分</div></div>
      <div class="pm-stat-card"><div class="pm-stat-value">${activeV?.usageCount ?? 0}</div><div class="pm-stat-label">使用次数</div></div>
      <div class="pm-stat-card"><div class="pm-stat-value">${versions.length || 1}</div><div class="pm-stat-label">版本数</div></div>
      <div class="pm-stat-card"><div class="pm-stat-value">${role.modelTier || '-'}</div><div class="pm-stat-label">模型层级</div></div>
    `;
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

  async function saveVersion(role) {
    const promptConfig = collectEditorData();
    try {
      const res = await fetch(`${BRIDGE_URL}/prompts/roles/${role.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptConfig,
          changelog: `更新 ${Object.keys(promptConfig).join(', ')}`,
          activate: true,
        }),
      });
      if (res.ok) {
        toast('版本保存成功！');
        await selectRole(role.id);
      } else {
        toast('保存失败: ' + (await res.text()), true);
      }
    } catch {
      toast('无法连接 Bridge 服务', true);
    }
  }

  function previewPrompt() {
    const data = collectEditorData();
    const role = roles.find(r => r.id === selectedRoleId);
    if (!role) return;

    const prompt = buildSystemPrompt(role, data);

    let modal = document.querySelector('.pm-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'pm-preview-modal';
      modal.innerHTML = `
        <div class="pm-preview-box">
          <h3>System Prompt 预览</h3>
          <pre id="pm-preview-content"></pre>
          <div class="pm-preview-close">
            <button class="pm-toolbar" style="padding:7px 18px;background:rgba(37,37,64,0.8);border:1px solid rgba(255,255,255,0.1);color:#d0d0d0;border-radius:6px;cursor:pointer">关闭</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
      modal.querySelector('.pm-preview-close button').addEventListener('click', () => modal.classList.remove('open'));
    }
    modal.querySelector('#pm-preview-content').textContent = prompt;
    modal.classList.add('open');
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

  function exportJSON(role) {
    const data = collectEditorData();
    const json = JSON.stringify({ roleId: role.id, roleName: role.name, skill: data }, null, 2);
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

  window.PromptManager = { open, close, isOpen };
})();
