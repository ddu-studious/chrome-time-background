import type { FastifyInstance } from 'fastify';
import { isQwenConfigured } from './qwen-client.js';
import {
  streamComplete,
  streamRewrite,
  streamSummarize,
  streamExpand,
  getWritingConfig,
  updateWritingConfig,
  getWritingStats,
  recordWritingStat,
  getCacheStats,
  clearCache,
  type WritingContext,
  type WritingConfig,
} from './service.js';
import {
  indexDocument,
  retrieveRelevant,
  getRAGConfig,
  updateRAGConfig,
  getRAGStats,
  clearRAGStore,
  getSystemPromptWithRAG,
} from './rag-service.js';

let fastifyLogger: any = null;

const log = {
  info: (msg: string, data?: any) => {
    if (fastifyLogger) fastifyLogger.info(data ? { ...toLogObj(data) } : {}, `[writing] ${msg}`);
    else console.log(`[writing] ${msg}`, data ?? '');
  },
  error: (msg: string, err?: any) => {
    if (fastifyLogger) fastifyLogger.error({ err: err?.message || err }, `[writing] ✖ ${msg}`);
    else console.error(`[writing] ✖ ${msg}`, err?.message || err || '');
  },
  debug: (msg: string, data?: any) => {
    if (fastifyLogger) fastifyLogger.info(data ? { ...toLogObj(data) } : {}, `[writing] 🔍 ${msg}`);
    else console.log(`[writing] 🔍 ${msg}`, data ?? '');
  },
};

function toLogObj(data: any): Record<string, any> {
  if (typeof data === 'object' && data !== null) return data;
  return { detail: data };
}

function sendSSE(raw: any, event: string, data: any) {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleStreamRoute(
  raw: any,
  generator: AsyncGenerator<any>,
  action: string,
  model: string,
  reqLogger?: any,
) {
  const t0 = Date.now();
  const rlog = reqLogger || log;
  rlog.info(`📝 开始流式 ${action}`, { model });

  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  sendSSE(raw, 'connected', { action });

  let fullContent = '';
  let usage: any = null;
  let tokenCount = 0;

  for await (const chunk of generator) {
    if (chunk.type === 'token') {
      fullContent += chunk.content;
      tokenCount++;
      sendSSE(raw, 'token', { content: chunk.content });
    } else if (chunk.type === 'done') {
      usage = chunk.usage;
    } else if (chunk.type === 'error') {
      rlog.error(`流式 ${action} 出错`, chunk.content);
      sendSSE(raw, 'error', { message: chunk.content });
      raw.end();
      return;
    }
  }

  if (usage) {
    recordWritingStat({
      action,
      model,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
    });
  }

  const elapsed = Date.now() - t0;
  rlog.info(`✅ 流式 ${action} 完成`, { elapsed: `${elapsed}ms`, chars: fullContent.length, tokens: tokenCount, model });

  sendSSE(raw, 'done', { content: fullContent, usage });
  raw.end();
}

export async function writingRoutes(fastify: FastifyInstance) {
  fastifyLogger = fastify.log;

  fastify.post('/writing/complete', async (request, reply) => {
    log.info('POST /writing/complete', { qwenConfigured: isQwenConfigured() });
    if (!isQwenConfigured()) {
      log.error('Qwen 未配置');
      return reply.code(503).send({
        error: 'Writing assistant not configured',
        message: 'Set DASHSCOPE_API_KEY in cursor-bridge/.env',
      });
    }

    const ctx = request.body as WritingContext;
    if (!ctx.text && ctx.text !== '') {
      return reply.code(400).send({ error: 'text field is required' });
    }

    const config = getWritingConfig();
    if (!config.enabled) {
      log.info('写作助手已禁用');
      return reply.code(503).send({ error: 'Writing assistant is disabled' });
    }

    log.debug('补全请求', { textLen: ctx.text?.length, cursor: ctx.cursorPosition, trigger: (ctx as any).triggerType });
    reply.hijack();
    const generator = streamComplete(ctx);
    const model = ctx.model || config.model;
    await handleStreamRoute(reply.raw, generator, 'complete', model, log);
    return;
  });

  fastify.post('/writing/rewrite', async (request, reply) => {
    log.info('POST /writing/rewrite');
    if (!isQwenConfigured()) {
      return reply.code(503).send({
        error: 'Writing assistant not configured',
        message: 'Set DASHSCOPE_API_KEY in cursor-bridge/.env',
      });
    }

    const { text, model, temperature } = request.body as {
      text: string;
      model?: string;
      temperature?: number;
    };
    if (!text) {
      return reply.code(400).send({ error: 'text field is required' });
    }

    log.debug('改写请求', { textLen: text.length });
    reply.hijack();
    const config = getWritingConfig();
    const generator = streamRewrite(text, { model, temperature });
    await handleStreamRoute(reply.raw, generator, 'rewrite', model || config.model, log);
    return;
  });

  fastify.post('/writing/summarize', async (request, reply) => {
    log.info('POST /writing/summarize');
    if (!isQwenConfigured()) {
      return reply.code(503).send({
        error: 'Writing assistant not configured',
        message: 'Set DASHSCOPE_API_KEY in cursor-bridge/.env',
      });
    }

    const { text, model, temperature } = request.body as {
      text: string;
      model?: string;
      temperature?: number;
    };
    if (!text) {
      return reply.code(400).send({ error: 'text field is required' });
    }

    log.debug('摘要请求', { textLen: text.length });
    reply.hijack();
    const config = getWritingConfig();
    const generator = streamSummarize(text, { model, temperature });
    await handleStreamRoute(reply.raw, generator, 'summarize', model || config.model, log);
    return;
  });

  fastify.post('/writing/expand', async (request, reply) => {
    log.info('POST /writing/expand');
    if (!isQwenConfigured()) {
      return reply.code(503).send({
        error: 'Writing assistant not configured',
        message: 'Set DASHSCOPE_API_KEY in cursor-bridge/.env',
      });
    }

    const { text, model, temperature } = request.body as {
      text: string;
      model?: string;
      temperature?: number;
    };
    if (!text) {
      return reply.code(400).send({ error: 'text field is required' });
    }

    log.debug('扩写请求', { textLen: text.length });
    reply.hijack();
    const config = getWritingConfig();
    const generator = streamExpand(text, { model, temperature });
    await handleStreamRoute(reply.raw, generator, 'expand', model || config.model, log);
    return;
  });

  fastify.get('/writing/config', async () => {
    return {
      ...getWritingConfig(),
      qwenConfigured: isQwenConfigured(),
    };
  });

  fastify.put('/writing/config', async (request) => {
    const partial = request.body as Partial<WritingConfig>;
    const updated = updateWritingConfig(partial);
    return { success: true, config: updated };
  });

  fastify.get('/writing/stats', async (request) => {
    const { days } = request.query as { days?: string };
    const stats = getWritingStats(days ? parseInt(days) : 30);
    return { stats };
  });

  fastify.get('/writing/cache', async () => {
    return getCacheStats();
  });

  fastify.delete('/writing/cache', async () => {
    clearCache();
    return { success: true };
  });

  fastify.post('/writing/feedback', async (request) => {
    const { action, model, accepted } = request.body as {
      action: string;
      model: string;
      accepted: boolean;
    };
    log.info(`反馈: ${action || 'complete'} ${accepted ? '✅ 已接受' : '❌ 已拒绝'}`);
    recordWritingStat({
      action: action || 'complete',
      model: model || getWritingConfig().model,
      promptTokens: 0,
      completionTokens: 0,
      accepted,
    });
    return { success: true };
  });

  // ─── RAG Routes ───

  fastify.post('/writing/rag/index', async (request, reply) => {
    if (!isQwenConfigured()) {
      return reply.code(503).send({ error: 'Qwen API not configured' });
    }
    const ragConfig = getRAGConfig();
    if (!ragConfig.enabled) {
      return reply.code(400).send({ error: 'RAG is disabled. Enable it via PUT /writing/rag/config' });
    }

    const { docId, title, content } = request.body as { docId: string; title: string; content: string };
    if (!docId || !content) {
      return reply.code(400).send({ error: 'docId and content are required' });
    }

    log.info('RAG 索引文档', { docId, titleLen: title?.length, contentLen: content.length });
    const result = await indexDocument(docId, title || 'Untitled', content);
    return { success: true, ...result };
  });

  fastify.post('/writing/rag/retrieve', async (request, reply) => {
    if (!isQwenConfigured()) {
      return reply.code(503).send({ error: 'Qwen API not configured' });
    }
    const ragConfig = getRAGConfig();
    if (!ragConfig.enabled) {
      return reply.code(400).send({ error: 'RAG is disabled' });
    }

    const { query, topK, excludeDocId } = request.body as { query: string; topK?: number; excludeDocId?: string };
    if (!query) {
      return reply.code(400).send({ error: 'query is required' });
    }

    const results = await retrieveRelevant(query, { topK, excludeDocId });
    return { results };
  });

  fastify.get('/writing/rag/config', async () => {
    return {
      ...getRAGConfig(),
      systemPrompt: getSystemPromptWithRAG(),
    };
  });

  fastify.put('/writing/rag/config', async (request) => {
    const partial = request.body as Partial<{ enabled: boolean; topK: number; minScore: number }>;
    const updated = updateRAGConfig(partial);
    return { success: true, config: updated };
  });

  fastify.get('/writing/rag/stats', async () => {
    return getRAGStats();
  });

  fastify.delete('/writing/rag/store', async () => {
    clearRAGStore();
    return { success: true };
  });

  fastify.get('/writing/rag/system-prompt', async () => {
    return { systemPrompt: getSystemPromptWithRAG() };
  });
}
