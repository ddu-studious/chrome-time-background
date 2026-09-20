import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import policy from '../js/assistant-memory.js';
import { createHash } from 'node:crypto';
import { experienceFromReceipt } from './assistant-experience.mjs';
const digest = text => createHash('sha256').update(text).digest('hex');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const bounded = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f<>]/.test(value)) throw fail('记忆内容无效或过长');
  return value.trim();
};
export function createMemoryStore({ file = ':memory:', now = Date.now } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') chmodSync(file, 0o600);
  try { db.exec(`PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS memory_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, enabled INTEGER NOT NULL, remember_artists INTEGER NOT NULL, cleared_at INTEGER NOT NULL);
    INSERT OR IGNORE INTO memory_meta (id,revision,enabled,remember_artists,cleared_at) VALUES (1,1,1,1,0);
    CREATE TABLE IF NOT EXISTS memory_deleted_sources (source_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS memory_entries (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY(kind,key));`); }
  catch (error) { db.close(); throw error; }
  if (!db.prepare('PRAGMA table_info(memory_meta)').all().some(row => row.name === 'remember_experiences')) db.exec('ALTER TABLE memory_meta ADD COLUMN remember_experiences INTEGER NOT NULL DEFAULT 1');
  db.exec('CREATE TABLE IF NOT EXISTS memory_deleted_entries (key TEXT PRIMARY KEY, deleted_at INTEGER NOT NULL)');
  function prune() {
    db.prepare("DELETE FROM memory_entries WHERE kind='experience' AND json_extract(value,'$.expiresAt') <= ?").run(now());
  }
  function snapshot() {
    prune();
    const meta = db.prepare('SELECT * FROM memory_meta WHERE id=1').get();
    const rows = db.prepare('SELECT * FROM memory_entries ORDER BY updated_at DESC, key').all();
    return { version: 1, revision: meta.revision, enabled: Boolean(meta.enabled), rememberArtists: Boolean(meta.remember_artists), rememberExperiences: Boolean(meta.remember_experiences),
      notes: rows.filter(r => r.kind === 'note').map(r => ({ key: r.key, ...JSON.parse(r.value), source: r.source, sourceId: r.source_id, updatedAt: r.updated_at })),
      experiences: rows.filter(r => r.kind === 'experience').map(r => ({ key: r.key, ...JSON.parse(r.value), source: r.source, sourceId: r.source_id, updatedAt: r.updated_at })),
      preferences: rows.filter(r => r.kind === 'preference').map(r => ({ key: r.key, value: JSON.parse(r.value), source: r.source, sourceId: r.source_id, updatedAt: r.updated_at })),
      artists: rows.filter(r => r.kind === 'artist').map(r => ({ key: r.key, ...JSON.parse(r.value), source: r.source, sourceId: r.source_id, updatedAt: r.updated_at })) };
  }
  function mutate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('记忆操作无效');
    db.exec('BEGIN IMMEDIATE');
    try {
      const meta = db.prepare('SELECT * FROM memory_meta WHERE id=1').get();
      if (body.expectedRevision !== meta.revision) throw fail('记忆已变化，请刷新后重试', 409);
      if (body.operation === 'configure') {
        if (typeof body.enabled !== 'boolean' || typeof body.rememberArtists !== 'boolean' || (body.rememberExperiences != null && typeof body.rememberExperiences !== 'boolean')) throw fail('记忆设置无效');
        db.prepare('UPDATE memory_meta SET enabled=?, remember_artists=?, remember_experiences=? WHERE id=1').run(+body.enabled, +body.rememberArtists, +(body.rememberExperiences ?? Boolean(meta.remember_experiences)));
      } else if (body.operation === 'clear') {
        if (body.confirm !== true) throw fail('清空记忆需要确认');
        db.exec('DELETE FROM memory_entries');
        db.prepare('UPDATE memory_meta SET cleared_at=? WHERE id=1').run(now());
      } else if (body.operation === 'delete') {
        if (!['preference', 'artist', 'note', 'experience'].includes(body.kind)) throw fail('记忆类型无效');
        db.prepare('DELETE FROM memory_entries WHERE kind=? AND key=?').run(body.kind, bounded(body.key, 100));
        if (body.kind === 'experience') db.prepare('INSERT OR IGNORE INTO memory_deleted_entries VALUES (?,?)').run(body.key, now());
      } else if (['preference', 'artist', 'note'].includes(body.operation)) {
        let key, value;
        if (body.operation === 'note') {
          const command = policy.command(body.source);
          if (command?.operation !== 'note' || command.value !== body.value) throw fail('只能保存本次明确要求记住的原文');
          if (!['all', 'music', 'alarm', 'bilibili', 'youtube'].includes(body.app)) throw fail('偏好范围无效');
          value = { value: bounded(body.value, 300), app: body.app }; key = digest(body.app + ':' + policy.normalize(body.value));
        } else if (body.operation === 'preference') {
          if (!Object.hasOwn(policy.preferences, body.key) || !policy.preferences[body.key].values.includes(body.value)) throw fail('偏好值无效');
          key = body.key; value = body.value;
        } else {
          if (!meta.enabled || !meta.remember_artists) throw fail('已暂停记住歌手选择', 409);
          key = policy.normalize(bounded(body.query, 100));
          const name = bounded(body.name, 100);
          if (typeof body.artistId !== 'string' || !/^[1-9]\d{0,19}$/.test(body.artistId)) throw fail('歌手编号无效');
          value = { name, artistId: body.artistId, platform: 'netease' };
        }
        const source = bounded(body.source, body.operation === 'note' ? 500 : 300);
        const sourceId = body.sourceId == null ? null : bounded(body.sourceId, 160);
        if (sourceId && (!Number.isSafeInteger(body.sourceStartedAt) || body.sourceStartedAt <= meta.cleared_at || db.prepare('SELECT 1 FROM memory_deleted_sources WHERE source_id=?').get(sourceId))) throw fail('来源对话已删除或过期，未重新保存记忆', 409);
        db.prepare(`INSERT INTO memory_entries VALUES (?,?,?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET value=excluded.value,source=excluded.source,source_id=excluded.source_id,updated_at=excluded.updated_at`)
          .run(body.operation, key, JSON.stringify(value), source, sourceId, now());
        db.exec("DELETE FROM memory_entries WHERE kind='artist' AND key NOT IN (SELECT key FROM memory_entries WHERE kind='artist' ORDER BY updated_at DESC, key LIMIT 200)");
        db.exec("DELETE FROM memory_entries WHERE kind='note' AND key NOT IN (SELECT key FROM memory_entries WHERE kind='note' ORDER BY updated_at DESC, key LIMIT 100)");
      } else throw fail('记忆操作无效');
      db.exec('UPDATE memory_meta SET revision=revision+1 WHERE id=1; COMMIT');
      return snapshot();
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function forgetSource(sourceId, all = false) {
    if (!all) bounded(sourceId, 160);
    db.exec('BEGIN IMMEDIATE');
    try {
      if (all) { db.exec('DELETE FROM memory_entries WHERE source_id IS NOT NULL'); db.prepare('UPDATE memory_meta SET cleared_at=? WHERE id=1').run(now()); }
      else {
        db.prepare('INSERT OR IGNORE INTO memory_deleted_sources VALUES (?)').run(sourceId);
        db.prepare('DELETE FROM memory_entries WHERE source_id=?').run(sourceId);
      }
      db.exec('UPDATE memory_meta SET revision=revision+1 WHERE id=1; COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function captureHistory(records, { captureContent = false, retentionDays = 30, expectedRevision } = {}) {
    if (!Array.isArray(records) || records.length > 4000) throw fail('历史记录数量无效');
    db.exec('BEGIN IMMEDIATE');
    try {
      const meta = db.prepare('SELECT * FROM memory_meta WHERE id=1').get();
      if (expectedRevision != null && expectedRevision !== meta.revision) throw fail('记忆已变化，请刷新后重试', 409);
      let added = 0;
      if (meta.enabled && meta.remember_experiences && captureContent) for (const row of records) {
        const fact = row.contentSaved && ['tool', 'action'].includes(row.kind) && ['succeeded', 'waiting'].includes(row.status) ? row.experience || experienceFromReceipt(row) : null;
        const startedAt = row.sourceStartedAt ?? row.startedAt;
        if (!fact || !Number.isSafeInteger(fact.at) || !Number.isSafeInteger(startedAt) || startedAt <= meta.cleared_at || fact.at > now() ||
            !Number.isSafeInteger(row.startedAt) || fact.at < row.startedAt ||
            typeof row.id !== 'string' || !/^[a-zA-Z0-9:._-]{1,160}$/.test(row.id) ||
            typeof row.conversationId !== 'string' || !/^[a-zA-Z0-9:._-]{1,160}$/.test(row.conversationId)) continue;
        const key = digest(row.id), expiresAt = fact.at + Math.min(30, [7, 30, 90, 365].includes(retentionDays) ? retentionDays : 7) * 86400000;
        if (expiresAt <= now() || db.prepare('SELECT 1 FROM memory_deleted_sources WHERE source_id=?').get(row.conversationId) ||
            db.prepare('SELECT 1 FROM memory_deleted_entries WHERE key=?').get(key)) continue;
        added += Number(db.prepare('INSERT OR IGNORE INTO memory_entries VALUES (?,?,?,?,?,?)')
          .run('experience', key, JSON.stringify({ ...fact, expiresAt }), '执行器回执：' + row.tool, row.conversationId, fact.at).changes);
      }
      prune();
      db.exec("DELETE FROM memory_entries WHERE kind='experience' AND key NOT IN (SELECT key FROM memory_entries WHERE kind='experience' ORDER BY updated_at DESC, key LIMIT 300)");
      if (added) db.exec('UPDATE memory_meta SET revision=revision+1 WHERE id=1');
      db.exec('COMMIT');
      return { added, ...snapshot() };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function restrictRetention(days) {
    if (![7, 30, 90, 365].includes(days)) throw fail('留存期限无效');
    const duration = Math.min(30, days) * 86400000;
    db.prepare("UPDATE memory_entries SET value=json_set(value,'$.expiresAt',MIN(json_extract(value,'$.expiresAt'),json_extract(value,'$.at')+?)) WHERE kind='experience'").run(duration);
    prune();
  }
  return { snapshot, mutate, forgetSource, captureHistory, restrictRetention, close: () => db.close() };
}
