/**
 * Prompt Visual Editor — serves an HTML UI for managing role prompts
 *
 * GET /prompts/editor — returns self-contained HTML page for prompt editing
 */

import type { FastifyInstance } from 'fastify';

export async function promptEditorUIRoutes(app: FastifyInstance) {
  app.get('/prompts/editor', async (req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return EDITOR_HTML;
  });
}

const EDITOR_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prompt 可视化编辑器</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f23; color: #e2e8f0; min-height: 100vh; }
.container { max-width: 1400px; margin: 0 auto; padding: 24px; }
h1 { font-size: 1.5rem; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
h1 .badge { font-size: 0.75rem; background: #6366f1; padding: 2px 8px; border-radius: 10px; }
.grid { display: grid; grid-template-columns: 280px 1fr; gap: 24px; }
.role-list { display: flex; flex-direction: column; gap: 8px; max-height: 80vh; overflow-y: auto; }
.role-card { background: #1e1e3f; border: 1px solid #2d2d5f; border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.2s; }
.role-card:hover { border-color: #6366f1; transform: translateX(4px); }
.role-card.active { border-color: #6366f1; background: #252560; }
.role-card .name { font-weight: 600; font-size: 0.9rem; }
.role-card .meta { font-size: 0.75rem; color: #94a3b8; margin-top: 4px; }
.role-card .icon { font-size: 1.2rem; margin-right: 8px; }
.editor-panel { background: #1e1e3f; border: 1px solid #2d2d5f; border-radius: 12px; padding: 24px; }
.editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.editor-title { font-size: 1.1rem; font-weight: 600; }
.version-badge { font-size: 0.75rem; background: #374151; padding: 2px 8px; border-radius: 10px; }
.field-group { margin-bottom: 16px; }
.field-label { font-size: 0.8rem; color: #94a3b8; margin-bottom: 6px; font-weight: 500; }
.field-input { width: 100%; background: #0f0f23; border: 1px solid #374151; border-radius: 6px; padding: 10px 12px; color: #e2e8f0; font-size: 0.85rem; resize: vertical; }
.field-input:focus { outline: none; border-color: #6366f1; }
textarea.field-input { min-height: 120px; font-family: 'JetBrains Mono', monospace; line-height: 1.5; }
.btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: all 0.2s; }
.btn-primary { background: #6366f1; color: white; }
.btn-primary:hover { background: #4f46e5; }
.btn-ghost { background: transparent; color: #94a3b8; border: 1px solid #374151; }
.btn-ghost:hover { border-color: #6366f1; color: #e2e8f0; }
.btn-danger { background: #dc2626; color: white; }
.actions { display: flex; gap: 8px; margin-top: 20px; }
.versions-list { margin-top: 20px; border-top: 1px solid #374151; padding-top: 16px; }
.version-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #1a1a3a; }
.version-row .ver-id { font-family: monospace; font-size: 0.8rem; color: #94a3b8; }
.version-row .ver-active { color: #22c55e; font-size: 0.75rem; }
.version-row .ver-score { color: #eab308; font-size: 0.8rem; }
.toast { position: fixed; bottom: 24px; right: 24px; background: #22c55e; color: white; padding: 12px 20px; border-radius: 8px; font-size: 0.85rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
.toast.show { opacity: 1; }
.system-prompt-preview { background: #0a0a1a; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 0.8rem; line-height: 1.6; white-space: pre-wrap; max-height: 200px; overflow-y: auto; color: #a5b4fc; margin-top: 8px; }
.empty-state { text-align: center; padding: 60px 20px; color: #64748b; }
</style>
</head>
<body>
<div class="container">
  <h1>Prompt 可视化编辑器 <span class="badge">Multi-Role</span></h1>
  <div class="grid">
    <div class="role-list" id="roleList"></div>
    <div class="editor-panel" id="editorPanel">
      <div class="empty-state">← 选择一个角色开始编辑</div>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const API = location.origin;
let roles = [];
let currentRole = null;

async function fetchRoles() {
  const res = await fetch(API + '/prompts/roles');
  roles = await res.json();
  renderRoleList();
}

function renderRoleList() {
  const el = document.getElementById('roleList');
  el.innerHTML = roles.map(r => \`
    <div class="role-card \${currentRole?.id === r.id ? 'active' : ''}" onclick="selectRole('\${r.id}')">
      <div class="name"><span class="icon">\${r.icon || '🤖'}</span>\${r.name}</div>
      <div class="meta">\${r.nameEn} · \${r.phase} · v\${r.activeVersion?.version || '0'}</div>
    </div>
  \`).join('');
}

async function selectRole(roleId) {
  const res = await fetch(API + '/prompts/roles/' + roleId);
  const data = await res.json();
  currentRole = data;
  renderRoleList();
  renderEditor(data);
}

function renderEditor(data) {
  const panel = document.getElementById('editorPanel');
  const skill = data.role?.skill || {};
  const activePrompt = data.versions?.find(v => v.isActive);

  panel.innerHTML = \`
    <div class="editor-header">
      <div class="editor-title">\${data.role?.name || ''} — \${data.role?.nameEn || ''}</div>
      <span class="version-badge">v\${activePrompt?.version || 'N/A'}</span>
    </div>
    <div class="field-group">
      <div class="field-label">角色定义 (Role)</div>
      <input class="field-input" id="ed-role" value="\${escapeAttr(skill.role || '')}" />
    </div>
    <div class="field-group">
      <div class="field-label">系统提示词 (System Prompt)</div>
      <textarea class="field-input" id="ed-system" rows="8">\${activePrompt?.systemPrompt || skill.backstory || ''}</textarea>
    </div>
    <div class="field-group">
      <div class="field-label">行为规则 (Behavior)</div>
      <textarea class="field-input" id="ed-behavior" rows="5">\${(skill.behavior || []).join('\\n')}</textarea>
    </div>
    <div class="field-group">
      <div class="field-label">输出格式 (Output Format)</div>
      <textarea class="field-input" id="ed-output" rows="4">\${skill.outputFormat || ''}</textarea>
    </div>
    <div class="field-group">
      <div class="field-label">约束 (Constraints)</div>
      <textarea class="field-input" id="ed-constraints" rows="3">\${(skill.constraints || []).join('\\n')}</textarea>
    </div>
    <div class="field-group">
      <div class="field-label">组合预览</div>
      <div class="system-prompt-preview" id="ed-preview"></div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" onclick="saveVersion()">保存新版本</button>
      <button class="btn btn-ghost" onclick="previewPrompt()">刷新预览</button>
    </div>
    <div class="versions-list">
      <div class="field-label">历史版本</div>
      \${(data.versions || []).map(v => \`
        <div class="version-row">
          <span class="ver-id">v\${v.version}</span>
          \${v.isActive ? '<span class="ver-active">● 当前活跃</span>' : ''}
          <span class="ver-score">⭐ \${v.score ?? '-'}</span>
          \${!v.isActive ? \`<button class="btn btn-ghost" style="font-size:0.7rem;padding:4px 8px" onclick="activateVer('\${v.id}')">激活</button>\` : ''}
        </div>
      \`).join('')}
    </div>
  \`;
  previewPrompt();
}

function previewPrompt() {
  const role = document.getElementById('ed-role')?.value || '';
  const system = document.getElementById('ed-system')?.value || '';
  const behavior = document.getElementById('ed-behavior')?.value || '';
  const output = document.getElementById('ed-output')?.value || '';
  const constraints = document.getElementById('ed-constraints')?.value || '';

  const preview = [
    '## Role: ' + role,
    '',
    system,
    '',
    behavior ? '## Behavior:\\n' + behavior : '',
    output ? '\\n## Output Format:\\n' + output : '',
    constraints ? '\\n## Constraints:\\n' + constraints : '',
  ].filter(Boolean).join('\\n');

  const el = document.getElementById('ed-preview');
  if (el) el.textContent = preview;
}

async function saveVersion() {
  if (!currentRole?.role?.id) return;
  const system = document.getElementById('ed-system')?.value || '';
  const behavior = document.getElementById('ed-behavior')?.value || '';
  const output = document.getElementById('ed-output')?.value || '';
  const constraints = document.getElementById('ed-constraints')?.value || '';

  const body = {
    systemPrompt: system,
    userPromptTemplate: '## Behavior:\\n' + behavior + '\\n## Output:\\n' + output + '\\n## Constraints:\\n' + constraints,
    notes: 'Visual Editor save @ ' + new Date().toLocaleString(),
  };

  const res = await fetch(API + '/prompts/roles/' + currentRole.role.id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    showToast('版本已保存');
    selectRole(currentRole.role.id);
  } else {
    showToast('保存失败', true);
  }
}

async function activateVer(verId) {
  const res = await fetch(API + '/prompts/versions/' + verId + '/activate', { method: 'PATCH' });
  if (res.ok) {
    showToast('已激活');
    selectRole(currentRole.role.id);
  }
}

function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function showToast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = err ? '#dc2626' : '#22c55e';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

document.querySelectorAll('.field-input')?.forEach(el => el.addEventListener('input', previewPrompt));
fetchRoles();
</script>
</body>
</html>`;
