import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { getDb } from '../../services/database.js';

export const HERMES_CRON_OUTPUT_DIR = join(homedir(), '.hermes', 'cron', 'output');

/** Known cron jobs → writing-space category & default tags */
export const HERMES_JOB_PROFILES: Record<string, {
  name: string;
  category: string;
  tags: string[];
}> = {
  '0c0d2c2e0918': {
    name: '中国历史每日故事',
    category: 'history',
    tags: ['hermes', '中国历史', '每日故事', 'cron'],
  },
  'dd51052451f6': {
    name: '中国学术思想史每日一讲',
    category: 'thought',
    tags: ['hermes', '学术思想史', '每日一讲', 'cron'],
  },
  '469d08ad3a2d': {
    name: '抗日战争前后故事',
    category: 'modern',
    tags: ['hermes', '抗战史', '每日故事', 'cron'],
  },
};

export interface ParsedHermesStory {
  externalId: string;
  jobId: string;
  jobName: string;
  category: string;
  tags: string[];
  title: string;
  content: string;
  runAt: string;
  outputPath: string;
}

export function initHermesImportTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS hermes_writing_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL UNIQUE,
      job_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      run_at TEXT,
      output_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      synced_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hermes_imports_status ON hermes_writing_imports(status);
    CREATE INDEX IF NOT EXISTS idx_hermes_imports_job ON hermes_writing_imports(job_id);

    CREATE TABLE IF NOT EXISTS hermes_scan_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_scan_finished_at INTEGER NOT NULL DEFAULT 0,
      last_file_mtime_ms INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO hermes_scan_state (id, last_scan_finished_at, last_file_mtime_ms)
    VALUES (1, 0, 0);
  `);
}

export interface HermesScanState {
  lastScanFinishedAt: number;
  lastFileMtimeMs: number;
}

function getScanState(): HermesScanState {
  const db = getDb();
  const row = db.prepare(
    'SELECT last_scan_finished_at, last_file_mtime_ms FROM hermes_scan_state WHERE id = 1',
  ).get() as { last_scan_finished_at: number; last_file_mtime_ms: number } | undefined;
  return {
    lastScanFinishedAt: row?.last_scan_finished_at ?? 0,
    lastFileMtimeMs: row?.last_file_mtime_ms ?? 0,
  };
}

function saveScanState(patch: Partial<HermesScanState>) {
  const db = getDb();
  const cur = getScanState();
  db.prepare(`
    UPDATE hermes_scan_state
    SET last_scan_finished_at = ?, last_file_mtime_ms = ?
    WHERE id = 1
  `).run(
    patch.lastScanFinishedAt ?? cur.lastScanFinishedAt,
    patch.lastFileMtimeMs ?? cur.lastFileMtimeMs,
  );
}

/** 由路径推导 external_id，避免为已入库文件重复 readFile */
export function externalIdFromOutputPath(outputPath: string): string | null {
  const parts = outputPath.split('/');
  const jobIdx = parts.lastIndexOf('output') + 1;
  const jobId = parts[jobIdx];
  if (!jobId || !HERMES_JOB_PROFILES[jobId]) return null;
  const stamp = basename(outputPath, '.md');
  return `${jobId}:${stamp}`;
}

const TITLE_LABEL_ONLY = /^标题$/;
const TITLE_PLACEHOLDER = /^简明有力$/;

function extractTitleFromStory(body: string): string {
  // 格式 0：HERMES_TITLE: 少康中兴——…（Prompt 规范推荐的可选机器行）
  const machine = body.match(/^HERMES_TITLE:\s*(.+)$/m);
  if (machine?.[1]) {
    const t = machine[1].trim();
    if (t && !TITLE_PLACEHOLDER.test(t)) return t.slice(0, 120);
  }

  // 格式 A：📜 **标题**：少康中兴——…（标签在加粗内，正文在冒号后）
  const afterLabel = body.match(/📜\s*\*\*标题\*\*[：:]\s*(.+)/);
  if (afterLabel?.[1]) {
    const t = afterLabel[1].trim().replace(/^\*\*|\*\*$/g, '').split('\n')[0].trim();
    if (t && !TITLE_PLACEHOLDER.test(t)) return t.slice(0, 120);
  }

  // 格式 B：📜 **标题：大禹治水——…**（冒号在加粗内）
  const labelInside = body.match(/📜\s*\*\*标题[：:]\s*([^*]+)\*\*/);
  if (labelInside?.[1]) {
    const t = labelInside[1].trim();
    if (t && !TITLE_PLACEHOLDER.test(t)) return t.slice(0, 120);
  }

  // 格式 C：📜 **少康中兴——…**（无「标题」标签）
  for (const m of body.matchAll(/📜\s*\*\*([^*]+)\*\*/g)) {
    const t = m[1].trim();
    if (!t || TITLE_LABEL_ONLY.test(t) || TITLE_PLACEHOLDER.test(t)) continue;
    if (/^标题[：:]/.test(t)) {
      const rest = t.replace(/^标题[：:]\s*/, '').trim();
      if (rest && !TITLE_PLACEHOLDER.test(rest)) return rest.slice(0, 120);
      continue;
    }
    return t.slice(0, 120);
  }

  // 格式 D：# 涿鹿之战——…
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1?.[1]) return h1[1].trim().slice(0, 120);

  const line = body.split('\n').map(l => l.trim()).find(l => l.length > 0 && l !== '---');
  return line?.replace(/^#+\s*/, '').replace(/^📜\s*/, '').slice(0, 120) || 'Hermes 每日故事';
}

/** 根据磁盘上的 cron 输出重新解析标题（修复已入库记录） */
export function repairHermesImportTitles(): { repaired: number; items: { externalId: string; title: string }[] } {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, external_id, job_id, output_path, title FROM hermes_writing_imports
    WHERE output_path IS NOT NULL AND output_path != ''
  `).all() as { id: number; external_id: string; job_id: string; output_path: string; title: string }[];

  const items: { externalId: string; title: string }[] = [];
  let repaired = 0;

  const update = db.prepare('UPDATE hermes_writing_imports SET title = ? WHERE id = ?');

  for (const row of rows) {
    let raw: string;
    try {
      raw = readFileSync(row.output_path, 'utf-8');
    } catch {
      continue;
    }
    const parsed = parseHermesCronMarkdown(raw, row.job_id, row.output_path);
    if (!parsed || parsed.title === row.title) continue;
    if (TITLE_LABEL_ONLY.test(parsed.title)) continue;

    update.run(parsed.title, row.id);
    items.push({ externalId: row.external_id, title: parsed.title });
    repaired++;
  }

  return { repaired, items };
}

/** 全部 Hermes 入库记录的 externalId → 正确标题（用于扩展侧批量修复 blogPosts） */
export function getHermesTitleMap(): { externalId: string; title: string; jobId: string }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT external_id, title, job_id FROM hermes_writing_imports
    WHERE title IS NOT NULL AND title != '' AND title != '标题'
  `).all() as { external_id: string; title: string; job_id: string }[];

  return rows.map(r => ({
    externalId: r.external_id,
    title: r.title,
    jobId: r.job_id,
  }));
}

export function parseHermesCronMarkdown(
  raw: string,
  jobId: string,
  outputPath: string,
): ParsedHermesStory | null {
  const profile = HERMES_JOB_PROFILES[jobId];
  if (!profile) return null;

  const responseIdx = raw.indexOf('## Response');
  if (responseIdx < 0) return null;

  let body = raw.slice(responseIdx + '## Response'.length).trim();
  if (!body || body === '[SILENT]') return null;

  const runMatch = raw.match(/\*\*Run Time:\*\*\s*(.+)/);
  const runAt = runMatch?.[1]?.trim() || basename(outputPath).replace('.md', '').replace('_', ' ');

  const stamp = basename(outputPath, '.md');
  const externalId = `${jobId}:${stamp}`;
  const title = extractTitleFromStory(body);

  const header = [
    `> **来源**: Hermes Cron · ${profile.name}`,
    `> **运行时间**: ${runAt}`,
    `> **任务 ID**: \`${jobId}\``,
    '',
    '---',
    '',
  ].join('\n');

  return {
    externalId,
    jobId,
    jobName: profile.name,
    category: profile.category,
    tags: [...profile.tags],
    title,
    content: header + body,
    runAt,
    outputPath,
  };
}

export function importHermesFile(outputPath: string): { imported: boolean; externalId?: string; reason?: string } {
  const parts = outputPath.split('/');
  const jobIdx = parts.lastIndexOf('output') + 1;
  const jobId = parts[jobIdx];
  if (!jobId || !HERMES_JOB_PROFILES[jobId]) {
    return { imported: false, reason: 'unknown_job' };
  }

  let raw: string;
  try {
    raw = readFileSync(outputPath, 'utf-8');
  } catch {
    return { imported: false, reason: 'read_failed' };
  }

  const parsed = parseHermesCronMarkdown(raw, jobId, outputPath);
  if (!parsed) return { imported: false, reason: 'no_story' };

  const db = getDb();
  const existing = db.prepare('SELECT id FROM hermes_writing_imports WHERE external_id = ?').get(parsed.externalId);
  if (existing) return { imported: false, externalId: parsed.externalId, reason: 'duplicate' };

  db.prepare(`
    INSERT INTO hermes_writing_imports
      (external_id, job_id, job_name, category, tags, title, content, run_at, output_path, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    parsed.externalId,
    parsed.jobId,
    parsed.jobName,
    parsed.category,
    JSON.stringify(parsed.tags),
    parsed.title,
    parsed.content,
    parsed.runAt,
    parsed.outputPath,
  );

  return { imported: true, externalId: parsed.externalId };
}

const SCAN_COOLDOWN_MS = 55 * 60 * 1000;
let scanInProgress = false;

export function scanHermesCronOutputs(
  jobIds?: string[],
  options?: { force?: boolean },
): {
  /** 实际尝试解析入库的文件数 */
  scanned: number;
  /** 目录内 .md 总数（仅 stat，用于对比） */
  checked: number;
  imported: number;
  skipped: number;
  skippedByMtime: number;
  skippedByDuplicate: number;
  errors: string[];
  skippedReason?: string;
  incremental: boolean;
  watermarkBeforeMs: number;
  watermarkAfterMs: number;
} {
  const now = Date.now();
  const scanState = getScanState();
  const force = !!options?.force;

  if (scanInProgress) {
    return {
      scanned: 0, checked: 0, imported: 0, skipped: 0,
      skippedByMtime: 0, skippedByDuplicate: 0, errors: [],
      skippedReason: 'scan_in_progress',
      incremental: !force,
      watermarkBeforeMs: scanState.lastFileMtimeMs,
      watermarkAfterMs: scanState.lastFileMtimeMs,
    };
  }
  if (!force && now - scanState.lastScanFinishedAt < SCAN_COOLDOWN_MS) {
    return {
      scanned: 0, checked: 0, imported: 0, skipped: 0,
      skippedByMtime: 0, skippedByDuplicate: 0, errors: [],
      skippedReason: 'cooldown',
      incremental: true,
      watermarkBeforeMs: scanState.lastFileMtimeMs,
      watermarkAfterMs: scanState.lastFileMtimeMs,
    };
  }

  const watermarkBeforeMs = scanState.lastFileMtimeMs;
  const mtimeWatermark = force ? 0 : watermarkBeforeMs;
  let maxSeenMtimeMs = watermarkBeforeMs;

  scanInProgress = true;
  const targets = jobIds?.length ? jobIds : Object.keys(HERMES_JOB_PROFILES);
  let scanned = 0;
  let checked = 0;
  let imported = 0;
  let skipped = 0;
  let skippedByMtime = 0;
  let skippedByDuplicate = 0;
  const errors: string[] = [];

  const db = getDb();
  const hasExternalId = db.prepare(
    'SELECT 1 FROM hermes_writing_imports WHERE external_id = ? LIMIT 1',
  );

  try {
    for (const jobId of targets) {
      const dir = join(HERMES_CRON_OUTPUT_DIR, jobId);
      let files: string[];
      try {
        files = readdirSync(dir).filter(f => f.endsWith('.md'));
      } catch {
        continue;
      }

      for (const file of files) {
        const full = join(dir, file);
        checked++;

        let mtimeMs: number;
        try {
          mtimeMs = statSync(full).mtimeMs;
        } catch (e: any) {
          errors.push(`${full}: stat ${e?.message || e}`);
          continue;
        }

        if (mtimeMs > maxSeenMtimeMs) maxSeenMtimeMs = mtimeMs;

        if (!force && mtimeMs <= mtimeWatermark) {
          skippedByMtime++;
          skipped++;
          continue;
        }

        const externalId = externalIdFromOutputPath(full);
        if (externalId && hasExternalId.get(externalId) && !force) {
          skippedByDuplicate++;
          skipped++;
          continue;
        }

        scanned++;
        try {
          const result = importHermesFile(full);
          if (result.imported) imported++;
          else skipped++;
        } catch (e: any) {
          errors.push(`${full}: ${e?.message || e}`);
        }
      }
    }
  } finally {
    scanInProgress = false;
    saveScanState({
      lastScanFinishedAt: Date.now(),
      lastFileMtimeMs: maxSeenMtimeMs,
    });
  }

  return {
    scanned,
    checked,
    imported,
    skipped,
    skippedByMtime,
    skippedByDuplicate,
    errors,
    incremental: !force && watermarkBeforeMs > 0,
    watermarkBeforeMs,
    watermarkAfterMs: maxSeenMtimeMs,
  };
}

/** Bridge 已入库但写作空间 blogPosts 中尚不存在的记录（含已 ack 的 synced） */
export function listHermesImportsNotInBlog(knownExternalIds: string[], limit = 100) {
  const db = getDb();
  const baseSelect = `
    SELECT id, external_id, job_id, job_name, category, tags, title, content, run_at, output_path, created_at, status
    FROM hermes_writing_imports
  `;
  let rows: any[];
  if (!knownExternalIds.length) {
    rows = db.prepare(`${baseSelect} ORDER BY created_at ASC LIMIT ?`).all(limit);
  } else {
    const placeholders = knownExternalIds.map(() => '?').join(',');
    rows = db.prepare(`
      ${baseSelect}
      WHERE external_id NOT IN (${placeholders})
      ORDER BY created_at ASC
      LIMIT ?
    `).all(...knownExternalIds, limit);
  }

  return rows.map(r => ({
    id: r.id,
    externalId: r.external_id,
    jobId: r.job_id,
    jobName: r.job_name,
    category: r.category,
    tags: JSON.parse(r.tags || '[]') as string[],
    title: r.title,
    content: r.content,
    runAt: r.run_at,
    outputPath: r.output_path,
    createdAt: r.created_at,
    status: r.status as string,
  }));
}

export function listPendingHermesImports(limit = 50) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, external_id, job_id, job_name, category, tags, title, content, run_at, output_path, created_at
    FROM hermes_writing_imports
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ?
  `).all(limit) as any[];

  return rows.map(r => ({
    id: r.id,
    externalId: r.external_id,
    jobId: r.job_id,
    jobName: r.job_name,
    category: r.category,
    tags: JSON.parse(r.tags || '[]') as string[],
    title: r.title,
    content: r.content,
    runAt: r.run_at,
    outputPath: r.output_path,
    createdAt: r.created_at,
  }));
}

export function ackHermesImports(ids: number[]) {
  if (!ids.length) return { acked: 0 };
  const db = getDb();
  const now = Date.now();
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(`
    UPDATE hermes_writing_imports
    SET status = 'synced', synced_at = ?
    WHERE id IN (${placeholders}) AND status = 'pending'
  `).run(now, ...ids);
  return { acked: result.changes };
}

export function getHermesImportStats() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT status, COUNT(*) as count FROM hermes_writing_imports GROUP BY status
  `).all() as { status: string; count: number }[];
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = r.count;
  const scanState = getScanState();
  return {
    outputDir: HERMES_CRON_OUTPUT_DIR,
    jobs: HERMES_JOB_PROFILES,
    byStatus,
    pending: byStatus.pending || 0,
    scanState: {
      lastScanFinishedAt: scanState.lastScanFinishedAt,
      lastFileMtimeMs: scanState.lastFileMtimeMs,
      lastScanFinishedAtISO: scanState.lastScanFinishedAt
        ? new Date(scanState.lastScanFinishedAt).toISOString()
        : null,
      lastFileMtimeISO: scanState.lastFileMtimeMs
        ? new Date(scanState.lastFileMtimeMs).toISOString()
        : null,
    },
  };
}
