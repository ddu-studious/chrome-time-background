/**
 * Session Aggregation Panel — serves an HTML UI for viewing multi-agent sessions
 *
 * GET /sessions/panel — returns self-contained HTML page for session management
 */

import type { FastifyInstance } from 'fastify';

export async function sessionPanelUIRoutes(app: FastifyInstance) {
  app.get('/sessions/panel', async (req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return SESSION_PANEL_HTML;
  });
}

const SESSION_PANEL_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Sessions</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f23; color: #e2e8f0; min-height: 100vh; }
.container { max-width: 1000px; margin: 0 auto; padding: 24px; }
h1 { font-size: 1.4rem; margin-bottom: 20px; }
.session-list { display: flex; flex-direction: column; gap: 12px; }
.session-card { background: #1e1e3f; border: 1px solid #2d2d5f; border-radius: 10px; padding: 16px; cursor: pointer; transition: all 0.2s; }
.session-card:hover { border-color: #6366f1; }
.session-card.expanded { border-color: #6366f1; background: #252560; }
.session-header { display: flex; justify-content: space-between; align-items: center; }
.session-title { font-weight: 600; font-size: 0.95rem; }
.session-meta { font-size: 0.75rem; color: #94a3b8; display: flex; gap: 12px; margin-top: 6px; }
.session-roles { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
.role-tag { font-size: 0.7rem; background: #374151; padding: 2px 8px; border-radius: 10px; color: #a5b4fc; }
.session-status { font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; }
.status-running { background: #064e3b; color: #6ee7b7; }
.status-completed { background: #1e3a5f; color: #93c5fd; }
.status-failed { background: #3b1515; color: #fca5a5; }
.timeline { margin-top: 16px; padding-top: 16px; border-top: 1px solid #374151; }
.timeline-item { display: flex; gap: 12px; padding: 8px 0; border-left: 2px solid #374151; margin-left: 8px; padding-left: 16px; }
.timeline-item .time { font-size: 0.7rem; color: #64748b; min-width: 50px; }
.timeline-item .role-name { font-size: 0.8rem; color: #a5b4fc; font-weight: 500; }
.timeline-item .msg-preview { font-size: 0.8rem; color: #94a3b8; margin-top: 2px; }
.empty-state { text-align: center; padding: 60px 20px; color: #64748b; }
.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; }
.filter-btn { background: transparent; border: 1px solid #374151; color: #94a3b8; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
.filter-btn.active { border-color: #6366f1; color: #e2e8f0; background: #252560; }
.refresh-btn { background: #6366f1; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; margin-left: auto; }
</style>
</head>
<body>
<div class="container">
  <h1>Agent Sessions</h1>
  <div class="filter-bar">
    <button class="filter-btn active" onclick="filterSessions('')">全部</button>
    <button class="filter-btn" onclick="filterSessions('running')">进行中</button>
    <button class="filter-btn" onclick="filterSessions('completed')">已完成</button>
    <button class="filter-btn" onclick="filterSessions('failed')">失败</button>
    <button class="refresh-btn" onclick="loadSessions()">刷新</button>
  </div>
  <div class="session-list" id="sessionList">
    <div class="empty-state">加载中...</div>
  </div>
</div>
<script>
const API = location.origin;
let sessions = [];
let expandedId = null;
let currentFilter = '';

async function loadSessions() {
  const url = currentFilter ? API + '/sessions?status=' + currentFilter : API + '/sessions';
  const res = await fetch(url);
  sessions = await res.json();
  renderSessions();
}

function renderSessions() {
  const el = document.getElementById('sessionList');
  if (!sessions.length) {
    el.innerHTML = '<div class="empty-state">暂无 Session 记录</div>';
    return;
  }
  el.innerHTML = sessions.map(s => \`
    <div class="session-card \${expandedId === s.id ? 'expanded' : ''}" onclick="toggleSession('\${s.id}')">
      <div class="session-header">
        <div>
          <div class="session-title">\${s.title || 'Untitled Session'}</div>
          <div class="session-meta">
            <span>🕐 \${formatTime(s.created_at)}</span>
            <span>💬 \${s.message_count || 0} 条消息</span>
          </div>
        </div>
        <span class="session-status status-\${s.status || 'running'}">\${statusText(s.status)}</span>
      </div>
      <div class="session-roles">
        \${(s.participantRoles || []).map(r => '<span class="role-tag">' + r + '</span>').join('')}
      </div>
      \${expandedId === s.id ? '<div class="timeline" id="timeline-' + s.id + '">加载中...</div>' : ''}
    </div>
  \`).join('');

  if (expandedId) loadTimeline(expandedId);
}

async function toggleSession(id) {
  expandedId = expandedId === id ? null : id;
  renderSessions();
}

async function loadTimeline(id) {
  const res = await fetch(API + '/sessions/' + id);
  const data = await res.json();
  const el = document.getElementById('timeline-' + id);
  if (!el) return;

  const conversations = data.conversations || [];
  if (!conversations.length) {
    el.innerHTML = '<div style="color:#64748b;font-size:0.8rem">暂无对话记录</div>';
    return;
  }

  el.innerHTML = conversations.slice(0, 20).map(c => \`
    <div class="timeline-item">
      <span class="time">\${formatTimeShort(c.created_at)}</span>
      <div>
        <div class="role-name">\${c.agent_name || c.role || 'Agent'}</div>
        <div class="msg-preview">\${(c.last_message || '').slice(0, 100)}</div>
      </div>
    </div>
  \`).join('');
}

function filterSessions(status) {
  currentFilter = status;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  loadSessions();
}

function statusText(s) {
  return { running: '进行中', completed: '已完成', failed: '失败', cancelled: '已取消' }[s] || '进行中';
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(typeof ts === 'number' ? ts : parseInt(ts));
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTimeShort(ts) {
  if (!ts) return '-';
  const d = new Date(typeof ts === 'number' ? ts : parseInt(ts));
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

loadSessions();
</script>
</body>
</html>`;
