import type { FastifyInstance } from 'fastify';
import { isQwenConfigured } from '../services/qwen-client.js';
import {
  streamComplete,
  streamRewrite,
  streamSummarize,
  getWritingConfig,
  updateWritingConfig,
  getWritingStats,
  recordWritingStat,
  type WritingContext,
  type WritingConfig,
} from '../services/writing-service.js';

function sendSSE(raw: any, event: string, data: any) {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleStreamRoute(
  raw: any,
  generator: AsyncGenerator<any>,
  action: string,
  model: string,
) {
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  sendSSE(raw, 'connected', { action });

  let fullContent = '';
  let usage: any = null;

  for await (const chunk of generator) {
    if (chunk.type === 'token') {
      fullContent += chunk.content;
      sendSSE(raw, 'token', { content: chunk.content });
    } else if (chunk.type === 'done') {
      usage = chunk.usage;
    } else if (chunk.type === 'error') {
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

  sendSSE(raw, 'done', { content: fullContent, usage });
  raw.end();
}

export async function writingRoutes(fastify: FastifyInstance) {
  fastify.post('/writing/complete', async (request, reply) => {
    if (!isQwenConfigured()) {
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
      return reply.code(503).send({ error: 'Writing assistant is disabled' });
    }

    const generator = streamComplete(ctx);
    const model = ctx.model || config.model;
    await handleStreamRoute(reply.raw, generator, 'complete', model);
    return reply.hijack();
  });

  fastify.post('/writing/rewrite', async (request, reply) => {
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

    const config = getWritingConfig();
    const generator = streamRewrite(text, { model, temperature });
    await handleStreamRoute(reply.raw, generator, 'rewrite', model || config.model);
    return reply.hijack();
  });

  fastify.post('/writing/summarize', async (request, reply) => {
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

    const config = getWritingConfig();
    const generator = streamSummarize(text, { model, temperature });
    await handleStreamRoute(reply.raw, generator, 'summarize', model || config.model);
    return reply.hijack();
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

  fastify.post('/writing/feedback', async (request) => {
    const { action, model, accepted } = request.body as {
      action: string;
      model: string;
      accepted: boolean;
    };
    recordWritingStat({
      action: action || 'complete',
      model: model || getWritingConfig().model,
      promptTokens: 0,
      completionTokens: 0,
      accepted,
    });
    return { success: true };
  });
}
