import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', '..', 'data');
const DB_PATH = resolve(DATA_DIR, 'cursor-bridge.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT,
      default_model TEXT,
      agent_presets TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      last_opened_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      agent_name TEXT NOT NULL,
      model TEXT NOT NULL,
      cwd TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      event_type TEXT,
      run_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      description TEXT,
      default_prompt TEXT,
      icon TEXT,
      color TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      steps TEXT NOT NULL,
      variables TEXT,
      is_builtin INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'reference',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_run ON messages(run_id);
    CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_agent);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_from ON agent_messages(from_agent);

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      conversation_id TEXT,
      project_id TEXT,
      run_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_token_agent ON token_usage(agent_id);
    CREATE INDEX IF NOT EXISTS idx_token_project ON token_usage(project_id);
    CREATE INDEX IF NOT EXISTS idx_token_model ON token_usage(model);
    CREATE INDEX IF NOT EXISTS idx_token_time ON token_usage(created_at);

    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY,
      task_analysis_id TEXT,
      agent_id TEXT NOT NULL,
      role_id TEXT,
      run_id TEXT,
      type TEXT NOT NULL,
      phase TEXT,
      content TEXT NOT NULL,
      metadata TEXT,
      caused_by TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      task_analysis_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      topic TEXT NOT NULL,
      options TEXT NOT NULL,
      chosen TEXT NOT NULL,
      reason TEXT NOT NULL,
      decided_by TEXT NOT NULL,
      supporting_traces TEXT,
      dissenting_traces TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS causal_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_trace TEXT NOT NULL,
      to_trace TEXT NOT NULL,
      relation TEXT NOT NULL,
      description TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_traces_task ON traces(task_analysis_id);
    CREATE INDEX IF NOT EXISTS idx_traces_agent ON traces(agent_id);
    CREATE INDEX IF NOT EXISTS idx_traces_role ON traces(role_id);
    CREATE INDEX IF NOT EXISTS idx_traces_type ON traces(type);
    CREATE INDEX IF NOT EXISTS idx_traces_phase ON traces(phase);
    CREATE INDEX IF NOT EXISTS idx_traces_time ON traces(created_at);
    CREATE INDEX IF NOT EXISTS idx_decisions_task ON decisions(task_analysis_id);
    CREATE INDEX IF NOT EXISTS idx_causal_from ON causal_links(from_trace);
    CREATE INDEX IF NOT EXISTS idx_causal_to ON causal_links(to_trace);

    -- Agent Sessions: aggregation layer for multi-agent tasks
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      task_analysis_id TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      participant_roles TEXT DEFAULT '[]',
      participant_count INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      total_messages INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON agent_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON agent_sessions(created_at DESC);

    -- Prompt version management for role engineering
    CREATE TABLE IF NOT EXISTS role_prompt_versions (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      prompt_config TEXT NOT NULL,
      changelog TEXT,
      performance_score REAL,
      usage_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      created_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_versions_role ON role_prompt_versions(role_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON role_prompt_versions(is_active);

    -- AB Test experiments for prompt version comparison
    CREATE TABLE IF NOT EXISTS ab_experiments (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version_a TEXT NOT NULL,
      version_b TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      traffic_split REAL DEFAULT 0.5,
      total_runs INTEGER DEFAULT 0,
      runs_a INTEGER DEFAULT 0,
      runs_b INTEGER DEFAULT 0,
      score_a REAL DEFAULT 0,
      score_b REAL DEFAULT 0,
      winner TEXT,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS ab_run_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL REFERENCES ab_experiments(id),
      version_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      run_id TEXT,
      score REAL,
      latency_ms INTEGER,
      token_count INTEGER,
      feedback TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ab_runs_experiment ON ab_run_results(experiment_id);
  `);

  try {
    db.exec(`ALTER TABLE projects ADD COLUMN agent_presets TEXT DEFAULT '[]'`);
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN session_id TEXT REFERENCES agent_sessions(id)`);
  } catch { /* already exists */ }
  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN role_id TEXT`);
  } catch { /* already exists */ }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id)`);
  } catch { /* already exists */ }
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined!;
  }
}

// ─── Project CRUD ───

export function createProject(id: string, name: string, path: string, description?: string, defaultModel?: string) {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO projects (id, name, path, description, default_model, created_at, updated_at, last_opened_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, path, description || null, defaultModel || null, now, now, now);
}

export function listProjects() {
  return getDb().prepare('SELECT * FROM projects ORDER BY last_opened_at DESC').all();
}

export function getProject(id: string) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function getProjectByPath(path: string) {
  return getDb().prepare('SELECT * FROM projects WHERE path = ?').get(path);
}

export function updateProjectLastOpened(id: string) {
  getDb().prepare('UPDATE projects SET last_opened_at = ? WHERE id = ?').run(Date.now(), id);
}

export function updateProject(id: string, fields: { name?: string; description?: string; defaultModel?: string; agentPresets?: any[] }) {
  const sets: string[] = [];
  const vals: any[] = [];
  if (fields.name !== undefined) { sets.push('name = ?'); vals.push(fields.name); }
  if (fields.description !== undefined) { sets.push('description = ?'); vals.push(fields.description); }
  if (fields.defaultModel !== undefined) { sets.push('default_model = ?'); vals.push(fields.defaultModel); }
  if (fields.agentPresets !== undefined) { sets.push('agent_presets = ?'); vals.push(JSON.stringify(fields.agentPresets)); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(id);
  getDb().prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function getProjectPresets(projectId: string): any[] {
  const row: any = getDb().prepare('SELECT agent_presets FROM projects WHERE id = ?').get(projectId);
  if (!row?.agent_presets) return [];
  try { return JSON.parse(row.agent_presets); } catch { return []; }
}

export function deleteProject(id: string) {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ─── Conversation CRUD ───

export function createConversation(id: string, opts: {
  projectId?: string;
  agentName: string;
  model: string;
  cwd: string;
  description?: string;
}) {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO conversations (id, project_id, agent_name, model, cwd, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, opts.projectId || null, opts.agentName, opts.model, opts.cwd, opts.description || null, now, now);
}

export function listConversations(projectId?: string, limit = 50) {
  const baseQuery = `
    SELECT c.*, COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
  `;
  if (projectId) {
    return getDb().prepare(
      `${baseQuery} WHERE c.project_id = ? GROUP BY c.id ORDER BY c.updated_at DESC LIMIT ?`
    ).all(projectId, limit);
  }
  return getDb().prepare(
    `${baseQuery} GROUP BY c.id ORDER BY c.updated_at DESC LIMIT ?`
  ).all(limit);
}

export function getConversation(id: string) {
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

export function updateConversationStatus(id: string, status: string) {
  getDb().prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
}

export function deleteConversation(id: string) {
  const d = getDb();
  d.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
  d.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

// ─── Messages ───

export function addMessage(conversationId: string, role: string, content: string, eventType?: string, runId?: string) {
  getDb().prepare(`
    INSERT INTO messages (conversation_id, role, content, event_type, run_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(conversationId, role, content, eventType || null, runId || null, Date.now());

  getDb().prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), conversationId);
}

export function getMessages(conversationId: string, limit = 200) {
  return getDb().prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(conversationId, limit);
}

export function resumeConversation(id: string) {
  const now = Date.now();
  getDb().prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?').run('active', now, id);
}

export function searchConversations(keyword: string, limit = 50) {
  const pattern = `%${keyword}%`;
  return getDb().prepare(`
    SELECT c.*, COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.agent_name LIKE ? OR c.description LIKE ? OR c.model LIKE ?
    GROUP BY c.id ORDER BY c.updated_at DESC LIMIT ?
  `).all(pattern, pattern, pattern, limit);
}

export function getStats() {
  const projects = getDb().prepare('SELECT COUNT(*) as count FROM projects').get() as any;
  const conversations = getDb().prepare('SELECT COUNT(*) as count FROM conversations').get() as any;
  const messages = getDb().prepare('SELECT COUNT(*) as count FROM messages').get() as any;
  return {
    projects: projects.count,
    conversations: conversations.count,
    messages: messages.count,
  };
}

// ─── Agent Messages (Inter-Agent Communication) ───

export function sendAgentMessage(fromAgent: string, toAgent: string, content: string, type: string = 'reference') {
  const now = Date.now();
  const info = getDb().prepare(`
    INSERT INTO agent_messages (from_agent, to_agent, content, type, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(fromAgent, toAgent, content, type, now);
  return { id: info.lastInsertRowid, fromAgent, toAgent, content, type, status: 'pending', createdAt: now };
}

export function getAgentMessages(agentId: string, limit = 50) {
  return getDb().prepare(
    'SELECT * FROM agent_messages WHERE to_agent = ? ORDER BY created_at DESC LIMIT ?'
  ).all(agentId, limit);
}

export function getAgentMessagesSent(agentId: string, limit = 50) {
  return getDb().prepare(
    'SELECT * FROM agent_messages WHERE from_agent = ? ORDER BY created_at DESC LIMIT ?'
  ).all(agentId, limit);
}

export function markAgentMessageRead(id: number) {
  getDb().prepare('UPDATE agent_messages SET status = ? WHERE id = ?').run('read', id);
}

// ─── Workflow Templates ───

export function createWorkflow(id: string, name: string, description: string, steps: string, variables: string, isBuiltin: number = 0) {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO workflows (id, name, description, steps, variables, is_builtin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || null, steps, variables || '[]', isBuiltin, now);
}

export function listWorkflows() {
  return getDb().prepare('SELECT * FROM workflows ORDER BY is_builtin DESC, created_at DESC').all();
}

export function getWorkflow(id: string) {
  return getDb().prepare('SELECT * FROM workflows WHERE id = ?').get(id);
}

export function deleteWorkflow(id: string) {
  getDb().prepare('DELETE FROM workflows WHERE id = ? AND is_builtin = 0').run(id);
}

export function getTokenStats() {
  const d = getDb();
  const total = d.prepare(`
    SELECT COUNT(*) as message_count,
           COUNT(DISTINCT conversation_id) as conv_count
    FROM messages
  `).get() as any;

  const byModel = d.prepare(`
    SELECT c.model, COUNT(m.id) as message_count, COUNT(DISTINCT c.id) as conv_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    GROUP BY c.model ORDER BY message_count DESC
  `).all();

  const last24h = d.prepare(`
    SELECT COUNT(*) as message_count
    FROM messages WHERE created_at > ?
  `).get(Date.now() - 86400000) as any;

  return {
    totalMessages: total.message_count,
    totalConversations: total.conv_count,
    last24hMessages: last24h.message_count,
    byModel,
  };
}

// ─── Token Usage Tracking ───

export function recordTokenUsage(opts: {
  agentId: string;
  conversationId?: string;
  projectId?: string;
  runId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
}) {
  const total = opts.inputTokens + opts.outputTokens;
  getDb().prepare(`
    INSERT INTO token_usage (agent_id, conversation_id, project_id, run_id, model, input_tokens, output_tokens, total_tokens, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.agentId, opts.conversationId || null, opts.projectId || null,
    opts.runId, opts.model, opts.inputTokens, opts.outputTokens, total,
    opts.durationMs || null, Date.now()
  );
}

export function getTokenUsageByAgent(agentId: string) {
  return getDb().prepare(`
    SELECT SUM(input_tokens) as total_input, SUM(output_tokens) as total_output,
           SUM(total_tokens) as total, COUNT(*) as run_count
    FROM token_usage WHERE agent_id = ?
  `).get(agentId) as any;
}

export function getTokenUsageByProject(projectId: string) {
  return getDb().prepare(`
    SELECT model, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output,
           SUM(total_tokens) as total, COUNT(*) as run_count
    FROM token_usage WHERE project_id = ?
    GROUP BY model
  `).all();
}

export function getTokenUsageSummary() {
  const d = getDb();
  const overall = d.prepare(`
    SELECT SUM(input_tokens) as total_input, SUM(output_tokens) as total_output,
           SUM(total_tokens) as total, COUNT(*) as run_count,
           AVG(duration_ms) as avg_duration
    FROM token_usage
  `).get() as any;

  const byModel = d.prepare(`
    SELECT model, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output,
           SUM(total_tokens) as total, COUNT(*) as run_count
    FROM token_usage GROUP BY model ORDER BY total DESC
  `).all();

  const last24h = d.prepare(`
    SELECT SUM(total_tokens) as total, COUNT(*) as run_count
    FROM token_usage WHERE created_at > ?
  `).get(Date.now() - 86400000) as any;

  const last7d = d.prepare(`
    SELECT date(created_at / 1000, 'unixepoch', 'localtime') as day,
           SUM(total_tokens) as total, COUNT(*) as run_count
    FROM token_usage WHERE created_at > ?
    GROUP BY day ORDER BY day
  `).all(Date.now() - 7 * 86400000);

  return {
    overall: {
      totalInput: overall.total_input || 0,
      totalOutput: overall.total_output || 0,
      total: overall.total || 0,
      runCount: overall.run_count || 0,
      avgDurationMs: Math.round(overall.avg_duration || 0),
    },
    byModel,
    last24h: { total: last24h.total || 0, runCount: last24h.run_count || 0 },
    last7dTrend: last7d,
  };
}

export function getRecentTokenUsage(limit = 20) {
  return getDb().prepare(`
    SELECT * FROM token_usage ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}

// ─── Agent Sessions (multi-agent task aggregation) ───

export function createSession(id: string, opts: {
  taskAnalysisId?: string;
  title: string;
  participantRoles?: string[];
}) {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO agent_sessions (id, task_analysis_id, title, participant_roles, participant_count, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    id, opts.taskAnalysisId || null, opts.title,
    JSON.stringify(opts.participantRoles || []),
    (opts.participantRoles || []).length,
    now, now
  );
}

export function getSession(id: string) {
  return getDb().prepare('SELECT * FROM agent_sessions WHERE id = ?').get(id);
}

export function listSessions(limit = 50, status?: string) {
  if (status) {
    return getDb().prepare(
      'SELECT * FROM agent_sessions WHERE status = ? ORDER BY updated_at DESC LIMIT ?'
    ).all(status, limit);
  }
  return getDb().prepare(
    'SELECT * FROM agent_sessions ORDER BY updated_at DESC LIMIT ?'
  ).all(limit);
}

export function updateSession(id: string, fields: {
  title?: string;
  summary?: string;
  status?: string;
  participantRoles?: string[];
  totalMessages?: number;
  totalTokens?: number;
}) {
  const sets: string[] = [];
  const vals: any[] = [];
  if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
  if (fields.summary !== undefined) { sets.push('summary = ?'); vals.push(fields.summary); }
  if (fields.status !== undefined) { sets.push('status = ?'); vals.push(fields.status); }
  if (fields.participantRoles !== undefined) {
    sets.push('participant_roles = ?'); vals.push(JSON.stringify(fields.participantRoles));
    sets.push('participant_count = ?'); vals.push(fields.participantRoles.length);
  }
  if (fields.totalMessages !== undefined) { sets.push('total_messages = ?'); vals.push(fields.totalMessages); }
  if (fields.totalTokens !== undefined) { sets.push('total_tokens = ?'); vals.push(fields.totalTokens); }
  if (fields.status === 'completed' || fields.status === 'failed') {
    sets.push('completed_at = ?'); vals.push(Date.now());
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(id);
  getDb().prepare(`UPDATE agent_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function getSessionWithConversations(id: string) {
  const session = getSession(id);
  if (!session) return null;
  const conversations = getDb().prepare(
    'SELECT * FROM conversations WHERE session_id = ? ORDER BY created_at ASC'
  ).all(id);
  return { session, conversations };
}

export function deleteSession(id: string) {
  const d = getDb();
  d.prepare('UPDATE conversations SET session_id = NULL WHERE session_id = ?').run(id);
  d.prepare('DELETE FROM agent_sessions WHERE id = ?').run(id);
}

// ─── Role Prompt Versions ───

export function createPromptVersion(id: string, opts: {
  roleId: string;
  version: number;
  promptConfig: string;
  changelog?: string;
  createdBy?: string;
}) {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO role_prompt_versions (id, role_id, version, prompt_config, changelog, is_active, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, opts.roleId, opts.version, opts.promptConfig, opts.changelog || null, now, opts.createdBy || null);
}

export function activatePromptVersion(id: string, roleId: string) {
  const d = getDb();
  d.prepare('UPDATE role_prompt_versions SET is_active = 0 WHERE role_id = ?').run(roleId);
  d.prepare('UPDATE role_prompt_versions SET is_active = 1 WHERE id = ?').run(id);
}

export function getActivePromptVersion(roleId: string) {
  return getDb().prepare(
    'SELECT * FROM role_prompt_versions WHERE role_id = ? AND is_active = 1'
  ).get(roleId);
}

export function listPromptVersions(roleId: string) {
  return getDb().prepare(
    'SELECT * FROM role_prompt_versions WHERE role_id = ? ORDER BY version DESC'
  ).all(roleId);
}

export function updatePromptVersionScore(id: string, score: number) {
  getDb().prepare(
    'UPDATE role_prompt_versions SET performance_score = ? WHERE id = ?'
  ).run(score, id);
}

export function incrementPromptUsage(roleId: string) {
  getDb().prepare(`
    UPDATE role_prompt_versions SET usage_count = usage_count + 1
    WHERE role_id = ? AND is_active = 1
  `).run(roleId);
}

export function deletePromptVersion(id: string) {
  getDb().prepare('DELETE FROM role_prompt_versions WHERE id = ? AND is_active = 0').run(id);
}

// ─── AB Test Experiments ───

export function createABExperiment(id: string, opts: {
  roleId: string; name: string; versionA: string; versionB: string; trafficSplit?: number;
}) {
  getDb().prepare(`
    INSERT INTO ab_experiments (id, role_id, name, version_a, version_b, traffic_split, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
  `).run(id, opts.roleId, opts.name, opts.versionA, opts.versionB, opts.trafficSplit ?? 0.5, Date.now());
}

export function getABExperiment(id: string) {
  return getDb().prepare('SELECT * FROM ab_experiments WHERE id = ?').get(id);
}

export function listABExperiments(roleId?: string) {
  if (roleId) {
    return getDb().prepare('SELECT * FROM ab_experiments WHERE role_id = ? ORDER BY created_at DESC').all(roleId);
  }
  return getDb().prepare('SELECT * FROM ab_experiments ORDER BY created_at DESC').all();
}

export function recordABRunResult(opts: {
  experimentId: string; versionId: string; variant: 'A' | 'B';
  runId?: string; score?: number; latencyMs?: number; tokenCount?: number; feedback?: string;
}) {
  const d = getDb();
  d.prepare(`
    INSERT INTO ab_run_results (experiment_id, version_id, variant, run_id, score, latency_ms, token_count, feedback, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(opts.experimentId, opts.versionId, opts.variant, opts.runId ?? null,
    opts.score ?? null, opts.latencyMs ?? null, opts.tokenCount ?? null, opts.feedback ?? null, Date.now());

  const countCol = opts.variant === 'A' ? 'runs_a' : 'runs_b';
  d.prepare(`UPDATE ab_experiments SET total_runs = total_runs + 1, ${countCol} = ${countCol} + 1 WHERE id = ?`)
    .run(opts.experimentId);

  if (typeof opts.score === 'number') {
    const results = d.prepare(
      'SELECT AVG(score) as avg_score FROM ab_run_results WHERE experiment_id = ? AND variant = ? AND score IS NOT NULL'
    ).get(opts.experimentId, opts.variant) as any;
    const scoreCol = opts.variant === 'A' ? 'score_a' : 'score_b';
    if (results?.avg_score != null) {
      d.prepare(`UPDATE ab_experiments SET ${scoreCol} = ? WHERE id = ?`).run(results.avg_score, opts.experimentId);
    }
  }
}

export function getABRunResults(experimentId: string) {
  return getDb().prepare(
    'SELECT * FROM ab_run_results WHERE experiment_id = ? ORDER BY created_at DESC'
  ).all(experimentId);
}

export function finishABExperiment(id: string, winner?: string) {
  getDb().prepare(
    'UPDATE ab_experiments SET status = ?, winner = ?, finished_at = ? WHERE id = ?'
  ).run('finished', winner ?? null, Date.now(), id);
}

export function pickABVariant(experimentId: string): 'A' | 'B' {
  const exp = getABExperiment(experimentId) as any;
  if (!exp || exp.status !== 'running') return 'A';
  return Math.random() < (exp.traffic_split ?? 0.5) ? 'A' : 'B';
}
