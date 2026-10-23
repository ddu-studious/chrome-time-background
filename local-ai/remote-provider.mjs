import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { estimateTokens } from './assistant-context.mjs';

// The endpoint comes only from trusted code, never a page, model, URL parameter or user setting.
export const DEEPSEEK_BASE = 'https://api.deepseek.com';
const fail = (message, code) => Object.assign(new Error(message), { code });
export class RemoteProvider {
  constructor({ apiKey, model, contextLength, fetchImpl = globalThis.fetch }) {
    this.apiKey = apiKey; this.model = model; this.contextLength = contextLength; this.fetchImpl = fetchImpl;
  }
  async planningContext() { return { contextLength: this.contextLength, contextSource: 'remote-config' }; }
  async countContextTokens({ instructions, input }) {
    return { inputTokens: estimateTokens(instructions) + estimateTokens(input), contextLength: this.contextLength,
      estimated: true, tokenCountSource: 'remote-conservative-estimate', contextSource: 'remote-config' };
  }
  async generateObject(options) { return this.generate({ ...options, format: 'json' }); }
  async generateText(options) { return this.generate({ ...options, format: 'text' }); }
  async generate({ instructions, input, signal, timeoutMs = 90000, maxOutputTokens = 1200, onUsage, onMetadata, contextBudget, beforeRequest, format }) {
    signal?.throwIfAborted();
    const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let responseStatus, guardError;
    const safeFetch = async (url, init) => {
      try { signal?.throwIfAborted(); beforeRequest?.(); }
      catch (error) { guardError = error; throw error; }
      if (String(url) !== DEEPSEEK_BASE + '/chat/completions') throw fail('外部模型请求目标无效', 'REMOTE_ENDPOINT_INVALID');
      const response = await this.fetchImpl(url, { ...init, redirect: 'error', signal: boundedSignal });
      responseStatus = response.status;
      // Bound both streaming success and SDK error bodies; do not retain provider error text.
      if (!response.ok) { await response.body?.cancel(); return new Response('{}', { status: response.status }); }
      if (!response.body) throw fail('外部模型响应为空', 'REMOTE_OUTPUT_INVALID');
      let bytes = 0;
      const limited = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > 2 * 1024 * 1024) throw fail('外部模型响应过长', 'REMOTE_OUTPUT_INVALID');
        controller.enqueue(chunk);
      } }));
      return new Response(limited, { status: response.status, headers: response.headers });
    };
    const model = { id: this.model, name: this.model, api: 'openai-completions', provider: 'deepseek', baseUrl: DEEPSEEK_BASE,
      reasoning: false, input: ['text'], contextWindow: this.contextLength, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens' } };
    try {
      onMetadata?.({ contextLength: this.contextLength, contextSource: 'remote-config', contextBudget });
      const result = await openAICompletionsApi().stream(model, { systemPrompt: instructions + (format === 'json' ? '\n只输出符合上述合同的 JSON 对象。' : ''),
        messages: [{ role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input), timestamp: 0 }] }, {
        apiKey: this.apiKey, signal: boundedSignal, timeoutMs, maxRetries: 0, fetch: safeFetch, env: {}, maxTokens: maxOutputTokens, temperature: 0,
        onPayload(payload) {
          payload.thinking = { type: 'disabled' };
          if (format === 'json') payload.response_format = { type: 'json_object' };
          return payload;
        }
      }).result();
      signal?.throwIfAborted();
      if (boundedSignal.aborted) throw boundedSignal.reason;
      if (result.stopReason === 'error' || result.stopReason === 'aborted') throw fail('外部模型请求失败，请检查密钥、模型、额度和网络', 'REMOTE_REQUEST_FAILED');
      const usage = result.usage && result.usage.totalTokens > 0 ? { inputTokens: result.usage.input + result.usage.cacheRead + result.usage.cacheWrite, outputTokens: result.usage.output } : null;
      if (usage) onUsage?.(usage);
      if (result.stopReason === 'length') throw fail('外部模型输出达到预算，本次结果未采用', 'REMOTE_OUTPUT_TRUNCATED');
      if (result.content.some(block => block.type !== 'text')) throw fail('外部模型返回了合同外内容', 'REMOTE_OUTPUT_INVALID');
      const text = result.content.map(block => block.text).join('').trim();
      if (!text) throw fail('外部模型未返回最终结果', 'REMOTE_OUTPUT_INVALID');
      if (format === 'text') return { text, usage, stopReason: 'stop' };
      try { return JSON.parse(text); } catch { throw fail('外部模型返回的 JSON 无效，本次操作未执行', 'MODEL_OUTPUT_FORMAT_INVALID'); }
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (guardError) throw guardError;
      if (boundedSignal.aborted) throw fail('外部模型响应超时', 'MODEL_RESPONSE_TIMEOUT');
      // Never expose SDK/provider error text: it may contain echoed prompts, headers or secrets.
      if (['REMOTE_OUTPUT_INVALID', 'REMOTE_OUTPUT_TRUNCATED', 'MODEL_OUTPUT_FORMAT_INVALID'].includes(error.code)) throw error;
      throw fail(`外部模型请求失败${responseStatus ? `（HTTP ${responseStatus}）` : ''}，请检查密钥、模型、额度和网络`, 'REMOTE_REQUEST_FAILED');
    }
  }
}
