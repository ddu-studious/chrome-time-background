/**
 * Writing RAG Service — 基于统一 AI 控制面的文档检索增强
 *
 * 核心能力：
 *   1. 文档索引：将用户文档分 chunk 后生成 embedding 向量
 *   2. 语义检索：用户输入时检索相关历史文档片段
 *   3. 上下文注入：将检索结果注入 LLM 补全上下文
 *
 * 模型、向量空间与预算由本地控制面管理
 * 向量存储在内存 + SQLite 中，支持持久化
 */

import { getQwenClient } from './qwen-client.js';
import { getDb } from '../../services/database.js';

const EMBEDDING_MODEL = '由 AI 控制台管理';
const EMBEDDING_DIMENSIONS = 0;
const CHUNK_SIZE = 200;
const CHUNK_OVERLAP = 50;
const TOP_K = 3;

interface DocumentChunk {
  id: string;
  docId: string;
  docTitle: string;
  text: string;
  embedding: number[];
  space: string;
  createdAt: number;
}

interface RAGConfig {
  enabled: boolean;
  model: string;
  dimensions: number;
  topK: number;
  minScore: number;
}

let _config: RAGConfig = {
  enabled: false,
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  topK: TOP_K,
  minScore: 0.3,
};

const _vectorStore: DocumentChunk[] = [];
const _documentVersions = new Map<string, number>();
let _generation = 0;

export function splitTextToChunks(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) throw new Error('分块配置无效');
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += chunkSize - overlap) {
    const chunk = text.slice(start, start + chunkSize).trim();
    if (chunk) chunks.push(chunk);
    if (start + chunkSize >= text.length) break;
  }
  return chunks;
}

async function generateEmbeddings(texts: string[], purpose: 'document' | 'query'): Promise<{vectors: number[][]; space: string}> {
  const vectors: number[][] = []; let space = '';
  for (let offset = 0; offset < texts.length; offset += 5) {
    const result = await getQwenClient().runScene('writing.embed', {texts:texts.slice(offset, offset+5),purpose});
    if (space && space !== result.space) throw new Error('向量模型已变化，请重新构建索引');
    space = result.space; vectors.push(...result.vectors);
  }
  return {vectors,space};
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

export async function indexDocument(docId: string, title: string, content: string): Promise<{ chunks: number }> {
  if (!_config.enabled) return { chunks: 0 };

  if (!docId || content.length > 100000) throw new Error('文档无效或超过索引长度限制');
  const version = (_documentVersions.get(docId) || 0) + 1; _documentVersions.set(docId, version);
  const generation = _generation;
  const chunks = splitTextToChunks(content);
  const generated = chunks.length ? await generateEmbeddings(chunks, 'document') : {vectors:[],space:''};
  if (generation !== _generation || _documentVersions.get(docId) !== version) return {chunks:0};
  const now = Date.now();
  const replacements: DocumentChunk[] = chunks.map((text, i) => ({id:`${docId}_chunk_${i}`,docId,docTitle:title,text,embedding:generated.vectors[i],space:generated.space,createdAt:now}));
  const db = getDb();
  const insert = db.prepare('INSERT OR REPLACE INTO writing_rag_chunks (id,doc_id,doc_title,text,embedding,space,created_at) VALUES (?,?,?,?,?,?,?)');
  db.transaction(() => {
    db.prepare('DELETE FROM writing_rag_chunks WHERE doc_id = ?').run(docId);
    for (const row of replacements) insert.run(row.id,row.docId,row.docTitle,row.text,JSON.stringify(row.embedding),row.space,row.createdAt);
  })();
  for (let i = _vectorStore.length - 1; i >= 0; i--) if (_vectorStore[i].docId === docId) _vectorStore.splice(i,1);
  _vectorStore.push(...replacements);

  return { chunks: chunks.length };
}

export async function retrieveRelevant(
  query: string,
  options?: { topK?: number; minScore?: number; excludeDocId?: string },
): Promise<Array<{ docTitle: string; text: string; score: number }>> {
  if (!_config.enabled || _vectorStore.length === 0) return [];

  const topK = options?.topK || _config.topK;
  const minScore = options?.minScore || _config.minScore;

  const generated = await generateEmbeddings([query.slice(0, 2000)], 'query');
  const queryEmbedding = generated.vectors[0];

  const scored = _vectorStore
    .filter(c => c.space === generated.space && (!options?.excludeDocId || c.docId !== options.excludeDocId))
    .map(chunk => ({
      docTitle: chunk.docTitle,
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

export function getRAGConfig(): RAGConfig {
  return { ..._config };
}

export function updateRAGConfig(partial: Partial<RAGConfig>): RAGConfig {
  const { model: _model, dimensions: _dimensions, ...preferences } = partial;
  _config = { ..._config, ...preferences };
  return { ..._config };
}

export function getRAGStats(): { totalChunks: number; totalDocs: number; storeSize: number } {
  const docIds = new Set(_vectorStore.map(c => c.docId));
  return {
    totalChunks: _vectorStore.length,
    totalDocs: docIds.size,
    storeSize: _vectorStore.reduce((size, chunk) => size + chunk.embedding.length * 4, 0),
  };
}

export function clearRAGStore() {
  _generation++;
  _vectorStore.length = 0;
  try {
    const db = getDb();
    db.prepare('DELETE FROM writing_rag_chunks').run();
  } catch { /* ignore */ }
}

export function initRAGTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_rag_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      doc_title TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON writing_rag_chunks(doc_id);
  `);

  const columns = db.prepare('PRAGMA table_info(writing_rag_chunks)').all() as Array<{name:string}>;
  if (!columns.some(column => column.name === 'space')) db.exec("ALTER TABLE writing_rag_chunks ADD COLUMN space TEXT NOT NULL DEFAULT ''");
  loadVectorStoreFromDb();
}

function loadVectorStoreFromDb() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM writing_rag_chunks').all() as any[];
    _vectorStore.length = 0;
    for (const row of rows) {
      _vectorStore.push({
        id: row.id,
        docId: row.doc_id,
        docTitle: row.doc_title,
        text: row.text,
        embedding: JSON.parse(row.embedding),
        space: row.space || '',
        createdAt: row.created_at,
      });
    }
    if (rows.length > 0) {
      console.log(`[RAG] Loaded ${rows.length} chunks from DB`);
    }
  } catch {
    // table may not exist yet
  }
}

export function getSystemPromptWithRAG(): string {
  return RAG_SYSTEM_PROMPT;
}

export const RAG_SYSTEM_PROMPT = `续写用户文本1-2句。直接输出续写内容，不重复已有文本，不加引号。保持语气一致，优先中文。

当提供了"参考文档片段"时，优先从中获取灵感和措辞进行续写，使输出与用户历史文档风格一致。不要照抄参考内容，而是融合其风格和知识自然续写。`;
