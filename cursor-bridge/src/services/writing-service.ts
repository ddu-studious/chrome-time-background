import { getQwenClient, type CompletionChunk, type CompletionOptions } from './qwen-client.js';
import { getDb } from './database.js';

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
}

const SYSTEM_PROMPT_COMPLETE = `你是一个智能写作助手。根据用户已输入的文本，续写1-2句话。

要求：
- 自然衔接当前内容，保持语气和风格一致
- 只输出续写内容，不要重复已有文本
- 不要添加引号、括号等额外标点
- 如果上下文不足以判断意图，给出最合理的续写
- 优先使用中文，除非上下文明确是其他语言`;

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

let _config: WritingConfig = {
  enabled: true,
  model: process.env.QWEN_DEFAULT_MODEL || 'qwen3-235b-a22b',
  temperature: 0.4,
  maxTokens: 150,
  debounceMs: 500,
  triggerMinChars: 5,
};

export function getWritingConfig(): WritingConfig {
  return { ..._config };
}

export function updateWritingConfig(partial: Partial<WritingConfig>): WritingConfig {
  _config = { ..._config, ...partial };
  return { ..._config };
}

function buildUserPrompt(ctx: WritingContext): string {
  const parts: string[] = [];

  if (ctx.title) parts.push(`文档标题：${ctx.title}`);
  if (ctx.category) parts.push(`分类：${ctx.category}`);

  const cursorPos = ctx.cursorPosition ?? ctx.text.length;
  const beforeCursor = ctx.text.slice(Math.max(0, cursorPos - 800), cursorPos);

  if (beforeCursor.length > 0) {
    parts.push(`当前内容：\n${beforeCursor}`);
  }

  parts.push('请续写：');
  return parts.join('\n\n');
}

export async function* streamComplete(
  ctx: WritingContext,
): AsyncGenerator<CompletionChunk> {
  const client = getQwenClient();
  const userPrompt = buildUserPrompt(ctx);
  const opts: CompletionOptions = {
    model: ctx.model || _config.model,
    temperature: ctx.temperature ?? _config.temperature,
    maxTokens: ctx.maxTokens ?? _config.maxTokens,
  };

  yield* client.streamComplete(SYSTEM_PROMPT_COMPLETE, userPrompt, opts);
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
