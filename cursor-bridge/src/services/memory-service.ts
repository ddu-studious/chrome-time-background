/**
 * Phase 6.3 — Cross-Session Long-Term Memory
 *
 * Uses SQLite FTS5 for full-text search across conversation history.
 * Supports memory CRUD, LLM-ready summary extraction, and relevance scoring.
 */

import { getDb } from './database.js';

export interface MemoryEntry {
  id: string;
  type: 'fact' | 'decision' | 'preference' | 'context' | 'lesson';
  content: string;
  summary?: string;
  source: string;
  sourceId?: string;
  tags: string[];
  importance: number; // 1-10
  accessCount: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  rank: number;
  snippet: string;
}

let initialized = false;

function ensureSchema() {
  if (initialized) return;
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'context',
      content TEXT NOT NULL,
      summary TEXT,
      source TEXT NOT NULL,
      source_id TEXT,
      tags TEXT DEFAULT '[]',
      importance INTEGER DEFAULT 5,
      access_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
    CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(last_accessed_at DESC);
  `);

  try {
    d.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content, summary, tags,
      content='memories',
      content_rowid='rowid'
    )`);
  } catch {
    // FTS5 table may already exist or FTS5 not available
  }

  try {
    d.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, summary, tags)
        VALUES (new.rowid, new.content, new.summary, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, summary, tags)
        VALUES ('delete', old.rowid, old.content, old.summary, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, summary, tags)
        VALUES ('delete', old.rowid, old.content, old.summary, old.tags);
        INSERT INTO memories_fts(rowid, content, summary, tags)
        VALUES (new.rowid, new.content, new.summary, new.tags);
      END;
    `);
  } catch {
    // triggers may already exist
  }

  initialized = true;
}

function randomMemId(): string {
  return 'mem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function rowToEntry(row: any): MemoryEntry {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    summary: row.summary || undefined,
    source: row.source,
    sourceId: row.source_id || undefined,
    tags: safeParseTags(row.tags),
    importance: row.importance,
    accessCount: row.access_count,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
  };
}

function safeParseTags(val: string): string[] {
  try { return JSON.parse(val); } catch { return []; }
}

// ─── CRUD ───

export function createMemory(opts: {
  type?: MemoryEntry['type'];
  content: string;
  summary?: string;
  source: string;
  sourceId?: string;
  tags?: string[];
  importance?: number;
}): MemoryEntry {
  ensureSchema();
  const id = randomMemId();
  const now = Date.now();
  const tagsJson = JSON.stringify(opts.tags || []);
  getDb().prepare(`
    INSERT INTO memories (id, type, content, summary, source, source_id, tags, importance, access_count, created_at, last_accessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id, opts.type || 'context', opts.content, opts.summary || null,
    opts.source, opts.sourceId || null, tagsJson, opts.importance || 5, now, now
  );
  return {
    id, type: opts.type || 'context', content: opts.content,
    summary: opts.summary, source: opts.source, sourceId: opts.sourceId,
    tags: opts.tags || [], importance: opts.importance || 5,
    accessCount: 0, createdAt: now, lastAccessedAt: now,
  };
}

export function getMemory(id: string): MemoryEntry | null {
  ensureSchema();
  const row = getDb().prepare('SELECT * FROM memories WHERE id = ?').get(id) as any;
  if (!row) return null;
  getDb().prepare('UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?')
    .run(Date.now(), id);
  return rowToEntry(row);
}

export function updateMemory(id: string, fields: {
  content?: string;
  summary?: string;
  tags?: string[];
  importance?: number;
  type?: MemoryEntry['type'];
}): boolean {
  ensureSchema();
  const sets: string[] = [];
  const vals: any[] = [];
  if (fields.content !== undefined) { sets.push('content = ?'); vals.push(fields.content); }
  if (fields.summary !== undefined) { sets.push('summary = ?'); vals.push(fields.summary); }
  if (fields.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(fields.tags)); }
  if (fields.importance !== undefined) { sets.push('importance = ?'); vals.push(fields.importance); }
  if (fields.type !== undefined) { sets.push('type = ?'); vals.push(fields.type); }
  if (sets.length === 0) return false;
  vals.push(id);
  const info = getDb().prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return info.changes > 0;
}

export function deleteMemory(id: string): boolean {
  ensureSchema();
  const info = getDb().prepare('DELETE FROM memories WHERE id = ?').run(id);
  return info.changes > 0;
}

export function listMemories(opts: {
  type?: string;
  source?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'importance' | 'recent' | 'accessed';
}): { entries: MemoryEntry[]; total: number } {
  ensureSchema();
  const d = getDb();
  const wheres: string[] = [];
  const vals: any[] = [];
  if (opts.type) { wheres.push('type = ?'); vals.push(opts.type); }
  if (opts.source) { wheres.push('source = ?'); vals.push(opts.source); }
  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

  const orderMap: Record<string, string> = {
    importance: 'importance DESC, last_accessed_at DESC',
    recent: 'created_at DESC',
    accessed: 'last_accessed_at DESC',
  };
  const order = orderMap[opts.sortBy || 'recent'] || 'created_at DESC';
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;

  const total = (d.prepare(`SELECT COUNT(*) as c FROM memories ${whereClause}`).get(...vals) as any).c;
  const rows = d.prepare(
    `SELECT * FROM memories ${whereClause} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).all(...vals, limit, offset);
  return { entries: rows.map(rowToEntry), total };
}

// ─── Full-Text Search ───

export function searchMemories(query: string, limit: number = 10): MemorySearchResult[] {
  ensureSchema();
  const d = getDb();

  try {
    const rows = d.prepare(`
      SELECT m.*, fts.rank,
             snippet(memories_fts, 0, '<b>', '</b>', '...', 32) as snippet
      FROM memories_fts fts
      JOIN memories m ON m.rowid = fts.rowid
      WHERE memories_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(query, limit) as any[];

    return rows.map(row => ({
      entry: rowToEntry(row),
      rank: row.rank,
      snippet: row.snippet || row.content?.substring(0, 200),
    }));
  } catch {
    const pattern = `%${query}%`;
    const rows = d.prepare(`
      SELECT * FROM memories
      WHERE content LIKE ? OR summary LIKE ? OR tags LIKE ?
      ORDER BY importance DESC, last_accessed_at DESC
      LIMIT ?
    `).all(pattern, pattern, pattern, limit) as any[];

    return rows.map((row, i) => ({
      entry: rowToEntry(row),
      rank: -(i + 1),
      snippet: row.content?.substring(0, 200),
    }));
  }
}

// ─── Auto-extract memories from conversations ───

export function extractMemoriesFromText(text: string, source: string, sourceId?: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];

  const decisionPatterns = [
    /(?:决定|决策|选择了|采用|使用)[：:]\s*(.{10,200})/g,
    /(?:decided|chose|selected|using)[:\s]+(.{10,200})/gi,
  ];
  for (const pattern of decisionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entries.push(createMemory({
        type: 'decision',
        content: match[1].trim(),
        source,
        sourceId,
        importance: 7,
      }));
    }
  }

  const lessonPatterns = [
    /(?:教训|经验|注意|坑)[：:]\s*(.{10,200})/g,
    /(?:lesson|learned|gotcha|caveat)[:\s]+(.{10,200})/gi,
  ];
  for (const pattern of lessonPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entries.push(createMemory({
        type: 'lesson',
        content: match[1].trim(),
        source,
        sourceId,
        importance: 8,
      }));
    }
  }

  return entries;
}

// ─── Stats ───

export function getMemoryStats(): {
  total: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  avgImportance: number;
} {
  ensureSchema();
  const d = getDb();
  const total = (d.prepare('SELECT COUNT(*) as c FROM memories').get() as any).c;
  const byType = d.prepare('SELECT type, COUNT(*) as c FROM memories GROUP BY type').all() as any[];
  const bySource = d.prepare('SELECT source, COUNT(*) as c FROM memories GROUP BY source').all() as any[];
  const avgRow = d.prepare('SELECT AVG(importance) as avg FROM memories').get() as any;

  return {
    total,
    byType: Object.fromEntries(byType.map(r => [r.type, r.c])),
    bySource: Object.fromEntries(bySource.map(r => [r.source, r.c])),
    avgImportance: Math.round((avgRow.avg || 0) * 10) / 10,
  };
}
