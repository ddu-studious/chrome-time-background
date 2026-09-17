export class LMStudioProvider {
  constructor({ baseUrl = 'http://127.0.0.1:1234', token = '', model = 'qwen/qwen3.8-27b', reasoning = 'off', timeoutMs = 90000 } = {}) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/') throw new Error('LM Studio 地址必须是本机 HTTP 地址');
    this.baseUrl = url.origin; this.token = token; this.model = model; this.timeoutMs = timeoutMs;
    this.busy = false;
    if (!['off', 'low', 'medium', 'high', 'xhigh', 'on'].includes(reasoning)) throw new Error('推理等级无效');
    this.reasoning = reasoning;
  }
  async request(path, body, timeoutMs = this.timeoutMs, signal) {
    try {
      const response = await fetch(this.baseUrl + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (!response.ok) throw new Error(`LM Studio 请求失败（HTTP ${response.status}），请检查模型和服务设置`);
      return await response.json();
    } catch (error) {
      if (['TimeoutError', 'AbortError'].includes(error.name)) throw new Error('本地模型响应超时，请稍后重试或手动设置');
      if (error instanceof TypeError) throw new Error('无法连接 LM Studio，请检查本地服务是否启动');
      throw error;
    }
  }
  async models() {
    const result = await this.request('/api/v1/models', null, 5000);
    return (result.models || []).filter(m => m.type === 'llm').map(m => ({ id: m.key, name: m.display_name, loaded: Boolean(m.loaded_instances?.length), reasoningOptions: m.capabilities?.reasoning?.allowed_options || [] }));
  }
  async embed({ texts, purpose, model, signal }) {
    if (this.busy) throw Object.assign(new Error('本地模型繁忙'), { statusCode: 429 });
    this.busy = true;
    try {
      const prefix = model.includes('nomic-embed-text') ? (purpose === 'query' ? 'search_query: ' : 'search_document: ') : '';
      const response = await this.request('/v1/embeddings', { model, input: texts.map(text => prefix + text) }, 90000, signal);
      if (!Array.isArray(response.data) || response.data.length !== texts.length) throw new Error('向量数量不匹配');
      const rows = [...response.data].sort((a, b) => a.index - b.index);
      const size = rows[0]?.embedding?.length;
      if (!Number.isInteger(size) || size < 1 || size > 8192 || rows.some((row, index) => row.index !== index || !Array.isArray(row.embedding) || row.embedding.length !== size || row.embedding.some(value => !Number.isFinite(value)))) throw new Error('向量格式或维度无效');
      return { vectors: rows.map(row => row.embedding), space: `${model}:retrieval-v1:${size}`, model };
    } finally { this.busy = false; }
  }
  async generateObject({ instructions, input, reasoning = this.reasoning, signal, model = this.model, timeoutMs = this.timeoutMs, maxOutputTokens = reasoning === 'off' ? 650 : 4096, onUsage }) {
    // Bounded admission: never pile up multiple 27B generations on the desktop.
    if (this.busy) throw Object.assign(new Error('本地模型正在处理另一条请求，请稍后重试'), { statusCode: 429 });
    this.busy = true;
    try {
      signal?.throwIfAborted();
      const selected = (await this.models()).find(m => m.id === model);
      if (!selected?.reasoningOptions.includes(reasoning)) throw new Error(`当前模型不支持推理等级 ${reasoning}，请在本地 AI 中检查状态并重新选择`);
      const response = await this.request('/api/v1/chat', {
        model, input: JSON.stringify(input), system_prompt: instructions,
        reasoning, temperature: 0, max_output_tokens: Math.min(maxOutputTokens, 4096), context_length: 8192, store: false
      }, timeoutMs, signal);
      // Native API controls reasoning explicitly on MLX. JSON is validated again by the domain resolver.
      const stats = response.stats || {}, usage = response.usage || {};
      const measured = Object.fromEntries(Object.entries({ inputTokens: stats.input_tokens ?? usage.prompt_tokens, outputTokens: stats.total_output_tokens ?? usage.completion_tokens, reasoningTokens: stats.reasoning_output_tokens ?? usage.completion_tokens_details?.reasoning_tokens }).filter(([, value]) => Number.isSafeInteger(value) && value >= 0));
      if (Object.keys(measured).length) onUsage?.(measured);
      const messages = response.output?.filter(item => item.type === 'message') || [];
      if (messages.length !== 1 || response.output?.some(item => item.type === 'tool_call')) {
        throw Object.assign(new Error('模型未返回单一 JSON 结果，本次操作未执行，请重试'), { code: 'MODEL_OUTPUT_FORMAT_INVALID' });
      }
      let text = String(messages[0].content || '').trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      // Some local instruction-tuned models emit a textual tool-call envelope even
      // when the endpoint is configured for JSON-only output. The domain contract
      // still validates the parsed object before any action can run.
      const wrappedToolCall = text.match(/^<tool_call>\s*([\s\S]*?)(?:\s*<\/tool_call>)?$/);
      if (wrappedToolCall) text = wrappedToolCall[1].trim();
      try { return JSON.parse(text); }
      catch { throw Object.assign(new Error('模型返回格式无效，本次操作未执行，请重试'), { code: 'MODEL_OUTPUT_FORMAT_INVALID' }); }
    } finally { this.busy = false; }
  }
}
