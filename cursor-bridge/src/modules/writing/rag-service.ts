/**
 * Writing RAG Service — 基于千问 Embedding API 的文档检索增强
 *
 * 核心能力：
 *   1. 文档索引：将用户文档分 chunk 后生成 embedding 向量
 *   2. 语义检索：用户输入时检索相关历史文档片段
 *   3. 上下文注入：将检索结果注入 LLM 补全上下文
 *
 * 使用千问 text-embedding-v3 模型（OpenAI 兼容接口）
 * 向量存储在内存 + SQLite 中，支持持久化
 */

import OpenAI from 'openai';
import { getDb } from '../../services/database.js';

const EMBEDDING_MODEL = 'text-embedding-v3';
const EMBEDDING_DIMENSIONS = 512;
const CHUNK_SIZE = 200;
const CHUNK_OVERLAP = 50;
const TOP_K = 3;

interface DocumentChunk {
  id: string;
  docId: string;
  docTitle: string;
  text: string;
  embedding: number[];
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

let _embeddingClient: OpenAI | null = null;
const _vectorStore: DocumentChunk[] = [];

function getEmbeddingClient(): OpenAI {
  if (!_embeddingClient) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('DASHSCOPE_API_KEY not configured');
    _embeddingClient = new OpenAI({
      apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  }
  return _embeddingClient;
}

function splitTextToChunks(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length > chunkSize && buffer.length > 0) {
      chunks.push(buffer.trim());
      const overlapStart = Math.max(0, buffer.length - overlap);
      buffer = buffer.slice(overlapStart) + '\n' + para;
    } else {
      buffer += (buffer ? '\n' : '') + para;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const client = getEmbeddingClient();
  const res = await client.embeddings.create({
    model: _config.model,
    input: text,
    dimensions: _config.dimensions,
  } as any);
  return res.data[0].embedding;
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getEmbeddingClient();
  const res = await client.embeddings.create({
    model: _config.model,
    input: texts,
    dimensions: _config.dimensions,
  } as any);
  return res.data.map(d => d.embedding);
}

function cosineSimilarity(a: number[], b: number[]): number {
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

  removeDocumentChunks(docId);

  const chunks = splitTextToChunks(content);
  if (chunks.length === 0) return { chunks: 0 };

  const embeddings = await generateEmbeddings(chunks);

  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO writing_rag_chunks (id, doc_id, doc_title, text, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `${docId}_chunk_${i}`;
    const chunk: DocumentChunk = {
      id: chunkId,
      docId,
      docTitle: title,
      text: chunks[i],
      embedding: embeddings[i],
      createdAt: now,
    };
    _vectorStore.push(chunk);
    stmt.run(chunkId, docId, title, chunks[i], JSON.stringify(embeddings[i]), now);
  }

  return { chunks: chunks.length };
}

export async function retrieveRelevant(
  query: string,
  options?: { topK?: number; minScore?: number; excludeDocId?: string },
): Promise<Array<{ docTitle: string; text: string; score: number }>> {
  if (!_config.enabled || _vectorStore.length === 0) return [];

  const topK = options?.topK || _config.topK;
  const minScore = options?.minScore || _config.minScore;

  const queryEmbedding = await generateEmbedding(query);

  const scored = _vectorStore
    .filter(c => !options?.excludeDocId || c.docId !== options.excludeDocId)
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

function removeDocumentChunks(docId: string) {
  const indices: number[] = [];
  for (let i = _vectorStore.length - 1; i >= 0; i--) {
    if (_vectorStore[i].docId === docId) indices.push(i);
  }
  for (const idx of indices) _vectorStore.splice(idx, 1);

  try {
    const db = getDb();
    db.prepare('DELETE FROM writing_rag_chunks WHERE doc_id = ?').run(docId);
  } catch { /* table may not exist yet */ }
}

export function getRAGConfig(): RAGConfig {
  return { ..._config };
}

export function updateRAGConfig(partial: Partial<RAGConfig>): RAGConfig {
  _config = { ..._config, ...partial };
  return { ..._config };
}

export function getRAGStats(): { totalChunks: number; totalDocs: number; storeSize: number } {
  const docIds = new Set(_vectorStore.map(c => c.docId));
  return {
    totalChunks: _vectorStore.length,
    totalDocs: docIds.size,
    storeSize: _vectorStore.length * _config.dimensions * 4,
  };
}

export function clearRAGStore() {
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
