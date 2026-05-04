import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function uiRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(getIndexHTML());
  });
}

function getIndexHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cursor Bridge — Agent 控制台</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #0f1117;
  --surface: #1a1d27;
  --surface-2: #252833;
  --border: #2e3140;
  --text: #e4e4e7;
  --text-dim: #9ca3af;
  --primary: #6366f1;
  --primary-hover: #818cf8;
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --running: #3b82f6;
  --radius: 8px;
}
body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
.header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.header h1 { font-size: 18px; font-weight: 600; }
.header h1 span { color: var(--primary); }
.header .meta { display: flex; gap: 16px; font-size: 13px; color: var(--text-dim); }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--success); margin-right: 6px; animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.container { max-width: 1200px; margin: 0 auto; padding: 24px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.btn { padding: 8px 16px; border: none; border-radius: var(--radius); cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-hover); }
.btn-secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
.btn-secondary:hover { border-color: var(--primary); }
.btn-danger { background: transparent; color: var(--error); border: 1px solid var(--error); }
.btn-danger:hover { background: var(--error); color: white; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.agent-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: border-color 0.2s; }
.agent-card:hover { border-color: var(--primary); }
.agent-card.running { border-color: var(--running); }
.card-header { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
.card-header .name { font-weight: 600; font-size: 14px; }
.card-header .model { font-size: 11px; color: var(--text-dim); background: var(--surface-2); padding: 2px 8px; border-radius: 10px; }
.status-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
.status-idle { background: rgba(34,197,94,0.15); color: var(--success); }
.status-running { background: rgba(59,130,246,0.15); color: var(--running); }
.status-error { background: rgba(239,68,68,0.15); color: var(--error); }
.card-body { padding: 12px 16px; }
.card-body .cwd { font-size: 12px; color: var(--text-dim); font-family: 'SF Mono', monospace; word-break: break-all; }
.card-body .desc { font-size: 13px; margin-top: 6px; color: var(--text-dim); }
.prompt-area { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
.prompt-area input { flex: 1; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; color: var(--text); font-size: 13px; outline: none; }
.prompt-area input:focus { border-color: var(--primary); }
.output-area { max-height: 300px; overflow-y: auto; padding: 12px 16px; font-family: 'SF Mono', monospace; font-size: 12px; line-height: 1.6; background: var(--bg); margin: 0 12px 12px; border-radius: var(--radius); }
.output-area:empty { display: none; }
.output-area .text { color: var(--text); }
.output-area .tool { color: var(--warning); }
.output-area .thinking { color: var(--text-dim); font-style: italic; }
.output-area .error { color: var(--error); }
.output-area .status { color: var(--success); font-weight: 500; }
.card-actions { padding: 8px 16px 14px; display: flex; gap: 8px; }
.empty-state { text-align: center; padding: 80px 20px; color: var(--text-dim); }
.empty-state h2 { font-size: 20px; margin-bottom: 8px; color: var(--text); }
.empty-state p { font-size: 14px; margin-bottom: 24px; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; align-items: center; justify-content: center; }
.modal-overlay.active { display: flex; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 440px; max-width: 90vw; }
.modal h3 { margin-bottom: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 13px; color: var(--text-dim); margin-bottom: 4px; }
.form-group input, .form-group select { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; color: var(--text); font-size: 13px; outline: none; }
.form-group input:focus, .form-group select:focus { border-color: var(--primary); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
</style>
</head>
<body>
<div class="header">
  <h1><span>Cursor</span> Bridge</h1>
  <div class="meta">
    <span><span class="status-dot"></span>Running</span>
    <span id="agent-count">0 Agents</span>
    <span>v0.1.0</span>
  </div>
</div>

<div class="container">
  <div class="toolbar">
    <button class="btn btn-primary" onclick="showCreateModal()">+ 新建 Agent</button>
    <button class="btn btn-secondary" onclick="refreshAgents()">刷新</button>
  </div>
  <div id="agents-grid" class="agents-grid"></div>
  <div id="empty-state" class="empty-state">
    <h2>尚无活跃 Agent</h2>
    <p>点击「+ 新建 Agent」创建你的第一个 AI Agent</p>
    <button class="btn btn-primary" onclick="showCreateModal()">创建 Agent</button>
  </div>
</div>

<div class="modal-overlay" id="create-modal">
  <div class="modal">
    <h3>创建新 Agent</h3>
    <div class="form-group">
      <label>名称</label>
      <input id="agent-name" placeholder="例如: 代码审查员" />
    </div>
    <div class="form-group">
      <label>工作目录 (cwd)</label>
      <input id="agent-cwd" placeholder="/path/to/project" />
    </div>
    <div class="form-group">
      <label>模型</label>
      <select id="agent-model"><option value="">默认 (${config.defaultModel})</option></select>
    </div>
    <div class="form-group">
      <label>描述 (可选)</label>
      <input id="agent-desc" placeholder="Agent 的职责描述" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideCreateModal()">取消</button>
      <button class="btn btn-primary" onclick="createAgent()">创建</button>
    </div>
  </div>
</div>

<script>
const BASE = '';
const agentStreams = {};
const agentOutputs = {};

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 204) return null;
  return res.json();
}

async function refreshAgents() {
  const data = await api('/agents');
  renderAgents(data.agents);
  document.getElementById('agent-count').textContent = data.agents.length + ' Agents';
}

const renderedAgents = new Set();

function renderAgents(agents) {
  const grid = document.getElementById('agents-grid');
  const empty = document.getElementById('empty-state');
  if (!agents.length) {
    grid.innerHTML = '';
    empty.style.display = '';
    renderedAgents.clear();
    return;
  }
  empty.style.display = 'none';

  const currentIds = new Set(agents.map(a => a.id));
  for (const id of renderedAgents) {
    if (!currentIds.has(id)) {
      const el = document.getElementById('card-' + id);
      if (el) el.remove();
      renderedAgents.delete(id);
    }
  }

  for (const a of agents) {
    const existing = document.getElementById('card-' + a.id);
    if (existing) {
      updateCardMeta(existing, a);
    } else {
      grid.insertAdjacentHTML('beforeend', renderCard(a));
      renderedAgents.add(a.id);
      connectSSE(a.id);
    }
  }
}

function updateCardMeta(el, a) {
  el.className = 'agent-card ' + a.status;
  const badge = el.querySelector('.status-badge');
  if (badge) { badge.className = 'status-badge status-' + a.status; badge.textContent = a.status; }
  const runs = el.querySelector('.run-count');
  if (runs) runs.textContent = 'runs: ' + a.runCount;
}

function renderCard(a) {
  const statusCls = 'status-' + a.status;
  return \`<div class="agent-card \${a.status}" id="card-\${a.id}">
    <div class="card-header">
      <span class="name">\${esc(a.name)}</span>
      <span class="model">\${a.model}</span>
    </div>
    <div class="card-body">
      <div class="cwd">\${esc(a.cwd)}</div>
      \${a.description ? '<div class="desc">' + esc(a.description) + '</div>' : ''}
      <div style="margin-top:8px"><span class="status-badge \${statusCls}">\${a.status}</span> <span class="run-count" style="font-size:11px;color:var(--text-dim)">runs: \${a.runCount}</span></div>
    </div>
    <div class="output-area" id="output-\${a.id}"></div>
    <div class="prompt-area">
      <input id="prompt-\${a.id}" placeholder="输入 prompt..." onkeydown="if(event.key==='Enter')sendPrompt('\${a.id}')" />
      <button class="btn btn-primary btn-sm" onclick="sendPrompt('\${a.id}')">发送</button>
    </div>
    <div class="card-actions">
      <button class="btn btn-secondary btn-sm" onclick="cancelRun('\${a.id}')">取消</button>
      <button class="btn btn-danger btn-sm" onclick="deleteAgent('\${a.id}')">销毁</button>
    </div>
  </div>\`;
}

function connectSSE(agentId) {
  if (agentStreams[agentId]) return;
  const es = new EventSource(BASE + '/agents/' + agentId + '/stream');
  agentStreams[agentId] = es;
  if (!agentOutputs[agentId]) agentOutputs[agentId] = [];

  es.addEventListener('text', e => appendOutput(agentId, 'text', JSON.parse(e.data).content));
  es.addEventListener('tool_call', e => {
    const d = JSON.parse(e.data);
    appendOutput(agentId, 'tool', '⚙ ' + d.tool + (d.status ? ' [' + d.status + ']' : ''));
  });
  es.addEventListener('thinking', e => appendOutput(agentId, 'thinking', JSON.parse(e.data).text));
  es.addEventListener('status', e => {
    const d = JSON.parse(e.data);
    appendOutput(agentId, 'status', '✓ ' + d.status + (d.durationMs ? ' (' + (d.durationMs/1000).toFixed(1) + 's)' : ''));
    refreshAgents();
  });
  es.addEventListener('error', e => {
    appendOutput(agentId, 'error', '✗ ' + JSON.parse(e.data).message);
    refreshAgents();
  });
  es.addEventListener('agent_status', e => {
    const d = JSON.parse(e.data);
    if (d.status === 'RUNNING') updateCardStatus(agentId, 'running');
  });
}

function appendOutput(agentId, cls, text) {
  const el = document.getElementById('output-' + agentId);
  if (!el) return;
  if (cls === 'text') {
    let last = el.lastElementChild;
    if (last && last.classList.contains('text')) {
      last.textContent += text;
    } else {
      const span = document.createElement('div');
      span.className = cls;
      span.textContent = text;
      el.appendChild(span);
    }
  } else {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    el.appendChild(div);
  }
  el.scrollTop = el.scrollHeight;
}

function updateCardStatus(agentId, status) {
  const card = document.getElementById('card-' + agentId);
  if (card) { card.className = 'agent-card ' + status; }
}

async function sendPrompt(agentId) {
  const input = document.getElementById('prompt-' + agentId);
  const prompt = input.value.trim();
  if (!prompt) return;
  input.value = '';
  const el = document.getElementById('output-' + agentId);
  if (el) { el.innerHTML = ''; }
  appendOutput(agentId, 'text', '> ' + prompt + '\\n');
  try {
    await api('/agents/' + agentId + '/send', { method: 'POST', body: JSON.stringify({ prompt }) });
    updateCardStatus(agentId, 'running');
  } catch (err) {
    appendOutput(agentId, 'error', err.message);
  }
}

async function cancelRun(agentId) {
  await api('/agents/' + agentId + '/cancel', { method: 'POST' });
  refreshAgents();
}

async function deleteAgent(agentId) {
  if (!confirm('确定要销毁这个 Agent？')) return;
  if (agentStreams[agentId]) { agentStreams[agentId].close(); delete agentStreams[agentId]; }
  await api('/agents/' + agentId, { method: 'DELETE' });
  refreshAgents();
}

function showCreateModal() { document.getElementById('create-modal').classList.add('active'); }
function hideCreateModal() { document.getElementById('create-modal').classList.remove('active'); }

async function createAgent() {
  const name = document.getElementById('agent-name').value.trim();
  const cwd = document.getElementById('agent-cwd').value.trim();
  const model = document.getElementById('agent-model').value;
  const description = document.getElementById('agent-desc').value.trim();
  if (!name || !cwd) { alert('名称和工作目录是必填项'); return; }
  hideCreateModal();
  try {
    await api('/agents', { method: 'POST', body: JSON.stringify({ name, cwd, model: model || undefined, description: description || undefined }) });
    refreshAgents();
  } catch (err) { alert('创建失败: ' + err.message); }
}

async function loadModels() {
  try {
    const data = await api('/models');
    const sel = document.getElementById('agent-model');
    data.models.forEach(m => {
      if (m.id === 'default') return;
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.displayName || m.id;
      sel.appendChild(opt);
    });
  } catch {}
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

refreshAgents();
loadModels();
setInterval(refreshAgents, 10000);
</script>
</body>
</html>`;
}
