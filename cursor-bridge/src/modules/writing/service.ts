import { getQwenClient, type CompletionChunk, type CompletionOptions } from './qwen-client.js';
import { getDb } from '../../services/database.js';
import { CompletionCache } from './cache.js';
import { retrieveRelevant, getRAGConfig, RAG_SYSTEM_PROMPT } from './rag-service.js';

export interface WritingContext {
  text: string;
  cursorPosition?: number;
  title?: string;
  category?: string;
  language?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface WritingConfig {
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  debounceMs: number;
  triggerMinChars: number;
  cacheEnabled: boolean;
  cacheTTLMs: number;
}

const SYSTEM_PROMPT_COMPLETE_DEFAULT = `续写用户文本1-2句。直接输出续写内容，不重复已有文本，不加引号。保持语气一致，优先中文。`;

const SYSTEM_PROMPT_REWRITE = `你是一个写作润色助手。对用户提供的文本进行改写润色。

要求：
- 保持原意不变，提升表达质量
- 修正语法错误，优化句式结构
- 只输出改写后的内容`;

const SYSTEM_PROMPT_SUMMARIZE = `你是一个文档摘要助手。为用户提供的文本生成简洁的摘要。

要求：
- 提取核心要点，控制在3-5句话
- 保持客观，不添加主观评价
- 只输出摘要内容`;

const SYSTEM_PROMPT_EXPAND = `你是一个写作扩展助手。基于用户提供的内容进行扩展和丰富。

要求：
- 在保持原意的基础上，增加细节描述和论证
- 保持风格一致性
- 扩展到原文2-3倍长度
- 只输出扩展后的内容`;

let _config: WritingConfig = {
  enabled: true,
  model: 'qwen-turbo-latest',
  temperature: 0.3,
  maxTokens: 80,
  debounceMs: 400,
  triggerMinChars: 5,
  cacheEnabled: true,
  cacheTTLMs: 5 * 60 * 1000,
};

const _cache = new CompletionCache({ maxSize: 100, ttlMs: _config.cacheTTLMs });

export function getWritingConfig(): WritingConfig {
  return { ..._config };
}

export function updateWritingConfig(partial: Partial<WritingConfig>): WritingConfig {
  _config = { ..._config, ...partial };
  if (partial.cacheTTLMs !== undefined) {
    _cache.setTTL(partial.cacheTTLMs);
  }
  return { ..._config };
}

function buildContextKey(ctx: WritingContext): string {
  const cursorPos = ctx.cursorPosition ?? ctx.text.length;
  const nearCursor = ctx.text.slice(Math.max(0, cursorPos - 200), cursorPos);
  return `${ctx.title || ''}::${ctx.category || ''}::${nearCursor}`;
}

function buildUserPrompt(ctx: WritingContext): string {
  const cursorPos = ctx.cursorPosition ?? ctx.text.length;
  const beforeCursor = ctx.text.slice(Math.max(0, cursorPos - 400), cursorPos);

  if (ctx.title) {
    return `[${ctx.title}]\n${beforeCursor}`;
  }
  return beforeCursor;
}

export async function* streamComplete(
  ctx: WritingContext,
): AsyncGenerator<CompletionChunk> {
  if (_config.cacheEnabled) {
    const key = buildContextKey(ctx);
    const cached = _cache.get(key);
    if (cached) {
      yield { type: 'token', content: cached };
      yield { type: 'done', content: '', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
      return;
    }
  }

  const client = getQwenClient();
  const userPrompt = buildUserPrompt(ctx);
  const opts: CompletionOptions = {
    model: ctx.model || _config.model,
    temperature: ctx.temperature ?? _config.temperature,
    maxTokens: ctx.maxTokens ?? _config.maxTokens,
  };

  let systemPrompt = SYSTEM_PROMPT_COMPLETE_DEFAULT;
  let ragUserPrompt = userPrompt;

  const ragConfig = getRAGConfig();
  if (ragConfig.enabled) {
    try {
      const cursorPos = ctx.cursorPosition ?? ctx.text.length;
      const queryText = ctx.text.slice(Math.max(0, cursorPos - 200), cursorPos);
      const relevant = await retrieveRelevant(queryText, { topK: ragConfig.topK });
      if (relevant.length > 0) {
        systemPrompt = RAG_SYSTEM_PROMPT;
        const refSnippets = relevant.map((r, i) => `[${i + 1}] (${r.docTitle}): ${r.text}`).join('\n');
        ragUserPrompt = `参考文档片段:\n${refSnippets}\n\n---\n当前文本:\n${userPrompt}`;
      }
    } catch { /* RAG failure is non-critical, fallback to default */ }
  }

  let fullContent = '';
  for await (const chunk of client.streamComplete(systemPrompt, ragUserPrompt, opts)) {
    if (chunk.type === 'token') {
      fullContent += chunk.content;
    }
    yield chunk;
  }

  if (_config.cacheEnabled && fullContent) {
    const key = buildContextKey(ctx);
    _cache.set(key, fullContent);
  }
}

export async function* streamRewrite(
  text: string,
  opts?: { model?: string; temperature?: number },
): AsyncGenerator<CompletionChunk> {
  const client = getQwenClient();
  const compOpts: CompletionOptions = {
    model: opts?.model || _config.model,
    temperature: opts?.temperature ?? 0.6,
    maxTokens: 500,
  };

  yield* client.streamComplete(SYSTEM_PROMPT_REWRITE, text, compOpts);
}

export async function* streamSummarize(
  text: string,
  opts?: { model?: string; temperature?: number },
): AsyncGenerator<CompletionChunk> {
  const client = getQwenClient();
  const compOpts: CompletionOptions = {
    model: opts?.model || _config.model,
    temperature: opts?.temperature ?? 0.3,
    maxTokens: 300,
  };

  yield* client.streamComplete(SYSTEM_PROMPT_SUMMARIZE, text, compOpts);
}

export async function* streamExpand(
  text: string,
  opts?: { model?: string; temperature?: number },
): AsyncGenerator<CompletionChunk> {
  const client = getQwenClient();
  const compOpts: CompletionOptions = {
    model: opts?.model || _config.model,
    temperature: opts?.temperature ?? 0.7,
    maxTokens: 800,
  };

  yield* client.streamComplete(SYSTEM_PROMPT_EXPAND, text, compOpts);
}

export function initWritingTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      accepted INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_writing_stats_action ON writing_stats(action);
    CREATE INDEX IF NOT EXISTS idx_writing_stats_created ON writing_stats(created_at);
  `);
}

export function recordWritingStat(stat: {
  action: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  accepted?: boolean;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO writing_stats (action, model, prompt_tokens, completion_tokens, accepted)
    VALUES (?, ?, ?, ?, ?)
  `).run(stat.action, stat.model, stat.promptTokens, stat.completionTokens, stat.accepted ? 1 : 0);
}

export function getWritingStats(days = 30) {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.prepare(`
    SELECT
      action,
      COUNT(*) as count,
      SUM(prompt_tokens) as total_prompt_tokens,
      SUM(completion_tokens) as total_completion_tokens,
      SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) as accepted_count
    FROM writing_stats
    WHERE created_at > ?
    GROUP BY action
  `).all(since);
}

export function getCacheStats() {
  return _cache.stats();
}

export function clearCache() {
  _cache.clear();
}
