import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import policy from '../js/assistant-memory.js';

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
    INSERT OR IGNORE INTO memory_meta VALUES (1,1,1,1,0);
    CREATE TABLE IF NOT EXISTS memory_deleted_sources (source_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS memory_entries (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY(kind,key));`); }
  catch (error) { db.close(); throw error; }
  function snapshot() {
    const meta = db.prepare('SELECT * FROM memory_meta WHERE id=1').get();
    const rows = db.prepare('SELECT * FROM memory_entries ORDER BY updated_at DESC, key').all();
    return { version: 1, revision: meta.revision, enabled: Boolean(meta.enabled), rememberArtists: Boolean(meta.remember_artists),
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
        if (typeof body.enabled !== 'boolean' || typeof body.rememberArtists !== 'boolean') throw fail('记忆设置无效');
        db.prepare('UPDATE memory_meta SET enabled=?, remember_artists=? WHERE id=1').run(+body.enabled, +body.rememberArtists);
      } else if (body.operation === 'clear') {
        if (body.confirm !== true) throw fail('清空记忆需要确认');
        db.exec('DELETE FROM memory_entries');
        db.prepare('UPDATE memory_meta SET cleared_at=? WHERE id=1').run(now());
      } else if (body.operation === 'delete') {
        if (!['preference', 'artist'].includes(body.kind)) throw fail('记忆类型无效');
        db.prepare('DELETE FROM memory_entries WHERE kind=? AND key=?').run(body.kind, bounded(body.key, 100));
      } else if (['preference', 'artist'].includes(body.operation)) {
        let key, value;
        if (body.operation === 'preference') {
          if (!Object.hasOwn(policy.preferences, body.key) || !policy.preferences[body.key].values.includes(body.value)) throw fail('偏好值无效');
          key = body.key; value = body.value;
        } else {
          if (!meta.enabled || !meta.remember_artists) throw fail('已暂停记住歌手选择', 409);
          key = policy.normalize(bounded(body.query, 100));
          const name = bounded(body.name, 100);
          if (typeof body.artistId !== 'string' || !/^[1-9]\d{0,19}$/.test(body.artistId)) throw fail('歌手编号无效');
          value = { name, artistId: body.artistId, platform: 'netease' };
        }
        const source = bounded(body.source, 300);
        const sourceId = body.sourceId == null ? null : bounded(body.sourceId, 160);
        if (sourceId && (!Number.isSafeInteger(body.sourceStartedAt) || body.sourceStartedAt <= meta.cleared_at || db.prepare('SELECT 1 FROM memory_deleted_sources WHERE source_id=?').get(sourceId))) throw fail('来源对话已删除或过期，未重新保存记忆', 409);
        db.prepare(`INSERT INTO memory_entries VALUES (?,?,?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET value=excluded.value,source=excluded.source,source_id=excluded.source_id,updated_at=excluded.updated_at`)
          .run(body.operation, key, JSON.stringify(value), source, sourceId, now());
        db.exec("DELETE FROM memory_entries WHERE kind='artist' AND key NOT IN (SELECT key FROM memory_entries WHERE kind='artist' ORDER BY updated_at DESC, key LIMIT 200)");
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
  return { snapshot, mutate, forgetSource, close: () => db.close() };
}
