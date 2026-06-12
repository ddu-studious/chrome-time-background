import { getDb } from '../../services/database.js';

export interface KnowledgeEntity {
  id?: number;
  storyExternalId: string;
  entityType: 'dynasty' | 'person' | 'event' | 'place' | 'concept';
  name: string;
  aliases?: string[];
  description?: string;
  timeRange?: string;
  relatedEntities?: string[];
  category: string;
  createdAt?: number;
}

export interface KnowledgeRelation {
  fromEntity: string;
  toEntity: string;
  relationType: string;
  description?: string;
}

export function initKnowledgeIndexTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_external_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      name TEXT NOT NULL,
      aliases TEXT DEFAULT '[]',
      description TEXT,
      time_range TEXT,
      related_entities TEXT DEFAULT '[]',
      category TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entities(entity_type);
    CREATE INDEX IF NOT EXISTS idx_ke_name ON knowledge_entities(name);
    CREATE INDEX IF NOT EXISTS idx_ke_story ON knowledge_entities(story_external_id);
    CREATE INDEX IF NOT EXISTS idx_ke_category ON knowledge_entities(category);

    CREATE TABLE IF NOT EXISTS knowledge_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entity TEXT NOT NULL,
      to_entity TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      description TEXT,
      story_external_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_kr_from ON knowledge_relations(from_entity);
    CREATE INDEX IF NOT EXISTS idx_kr_to ON knowledge_relations(to_entity);

    CREATE TABLE IF NOT EXISTS knowledge_index_state (
      story_external_id TEXT PRIMARY KEY,
      indexed_at INTEGER NOT NULL,
      entity_count INTEGER NOT NULL DEFAULT 0,
      relation_count INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function isStoryIndexed(externalId: string): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM knowledge_index_state WHERE story_external_id = ?',
  ).get(externalId);
  return !!row;
}

export function saveEntities(
  storyExternalId: string,
  entities: KnowledgeEntity[],
  relations: KnowledgeRelation[],
): { entities: number; relations: number } {
  const db = getDb();
  const now = Date.now();

  db.prepare('DELETE FROM knowledge_entities WHERE story_external_id = ?').run(storyExternalId);
  db.prepare('DELETE FROM knowledge_relations WHERE story_external_id = ?').run(storyExternalId);
  db.prepare('DELETE FROM knowledge_index_state WHERE story_external_id = ?').run(storyExternalId);

  const insertEntity = db.prepare(`
    INSERT INTO knowledge_entities
      (story_external_id, entity_type, name, aliases, description, time_range, related_entities, category, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRelation = db.prepare(`
    INSERT INTO knowledge_relations
      (from_entity, to_entity, relation_type, description, story_external_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let entityCount = 0;
  let relationCount = 0;

  const tx = db.transaction(() => {
    for (const e of entities) {
      insertEntity.run(
        storyExternalId,
        e.entityType,
        e.name,
        JSON.stringify(e.aliases || []),
        e.description || null,
        e.timeRange || null,
        JSON.stringify(e.relatedEntities || []),
        e.category,
        now,
      );
      entityCount++;
    }

    for (const r of relations) {
      insertRelation.run(
        r.fromEntity,
        r.toEntity,
        r.relationType,
        r.description || null,
        storyExternalId,
        now,
      );
      relationCount++;
    }

    db.prepare(`
      INSERT OR REPLACE INTO knowledge_index_state
        (story_external_id, indexed_at, entity_count, relation_count)
      VALUES (?, ?, ?, ?)
    `).run(storyExternalId, now, entityCount, relationCount);
  });

  tx();
  return { entities: entityCount, relations: relationCount };
}

export function getKnowledgeStats(): {
  totalEntities: number;
  totalRelations: number;
  indexedStories: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  topEntities: { name: string; type: string; count: number }[];
} {
  const db = getDb();

  const totalEntities = (db.prepare('SELECT COUNT(*) as c FROM knowledge_entities').get() as any).c;
  const totalRelations = (db.prepare('SELECT COUNT(*) as c FROM knowledge_relations').get() as any).c;
  const indexedStories = (db.prepare('SELECT COUNT(*) as c FROM knowledge_index_state').get() as any).c;

  const byType: Record<string, number> = {};
  const typeRows = db.prepare(
    'SELECT entity_type, COUNT(*) as c FROM knowledge_entities GROUP BY entity_type',
  ).all() as { entity_type: string; c: number }[];
  for (const r of typeRows) byType[r.entity_type] = r.c;

  const byCategory: Record<string, number> = {};
  const catRows = db.prepare(
    'SELECT category, COUNT(*) as c FROM knowledge_entities GROUP BY category',
  ).all() as { category: string; c: number }[];
  for (const r of catRows) byCategory[r.category] = r.c;

  const topEntities = db.prepare(`
    SELECT name, entity_type as type, COUNT(*) as count
    FROM knowledge_entities GROUP BY name, entity_type
    ORDER BY count DESC LIMIT 30
  `).all() as { name: string; type: string; count: number }[];

  return { totalEntities, totalRelations, indexedStories, byType, byCategory, topEntities };
}

export function searchEntities(
  query: string,
  options?: { type?: string; category?: string; limit?: number },
): KnowledgeEntity[] {
  const db = getDb();
  const limit = options?.limit || 50;
  const conditions = ['name LIKE ?'];
  const params: any[] = [`%${query}%`];

  if (options?.type) {
    conditions.push('entity_type = ?');
    params.push(options.type);
  }
  if (options?.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }

  params.push(limit);
  const rows = db.prepare(`
    SELECT * FROM knowledge_entities
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params) as any[];

  return rows.map(r => ({
    id: r.id,
    storyExternalId: r.story_external_id,
    entityType: r.entity_type,
    name: r.name,
    aliases: JSON.parse(r.aliases || '[]'),
    description: r.description,
    timeRange: r.time_range,
    relatedEntities: JSON.parse(r.related_entities || '[]'),
    category: r.category,
    createdAt: r.created_at,
  }));
}

export function getEntityRelations(entityName: string): KnowledgeRelation[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM knowledge_relations
    WHERE from_entity = ? OR to_entity = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(entityName, entityName) as any[];

  return rows.map(r => ({
    fromEntity: r.from_entity,
    toEntity: r.to_entity,
    relationType: r.relation_type,
    description: r.description,
  }));
}

export function listEntitiesByType(
  entityType: string,
  options?: { category?: string; limit?: number },
): { name: string; count: number; description: string | null; timeRange: string | null }[] {
  const db = getDb();
  const limit = options?.limit || 100;
  const conditions = ['entity_type = ?'];
  const params: any[] = [entityType];

  if (options?.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }

  params.push(limit);
  return db.prepare(`
    SELECT name, COUNT(*) as count,
           MAX(description) as description,
           MAX(time_range) as timeRange
    FROM knowledge_entities
    WHERE ${conditions.join(' AND ')}
    GROUP BY name
    ORDER BY count DESC
    LIMIT ?
  `).all(...params) as any[];
}

export function getGraphData(options?: { category?: string; limit?: number }): {
  nodes: { id: string; label: string; type: string; size: number }[];
  edges: { source: string; target: string; label: string }[];
} {
  const db = getDb();
  const limit = options?.limit || 200;
  const catFilter = options?.category ? 'AND category = ?' : '';
  const catParams = options?.category ? [options.category] : [];

  const entityRows = db.prepare(`
    SELECT name, entity_type, COUNT(*) as cnt
    FROM knowledge_entities
    WHERE 1=1 ${catFilter}
    GROUP BY name, entity_type
    ORDER BY cnt DESC
    LIMIT ?
  `).all(...catParams, limit) as { name: string; entity_type: string; cnt: number }[];

  const entitySet = new Set(entityRows.map(r => r.name));

  const edges: { source: string; target: string; label: string }[] = [];
  const relRows = db.prepare(`
    SELECT from_entity, to_entity, relation_type, COUNT(*) as cnt
    FROM knowledge_relations
    GROUP BY from_entity, to_entity, relation_type
    ORDER BY cnt DESC
    LIMIT ?
  `).all(limit * 2) as any[];

  for (const r of relRows) {
    if (entitySet.has(r.from_entity) && entitySet.has(r.to_entity)) {
      edges.push({
        source: r.from_entity,
        target: r.to_entity,
        label: r.relation_type,
      });
    }
  }

  return {
    nodes: entityRows.map(r => ({
      id: r.name,
      label: r.name,
      type: r.entity_type,
      size: Math.min(r.cnt * 2 + 4, 20),
    })),
    edges,
  };
}
