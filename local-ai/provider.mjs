export class LMStudioProvider {
  constructor({ baseUrl = 'http://127.0.0.1:1234', token = '', model = 'qwen/qwen3.8-27b', reasoning = 'off', timeoutMs = 90000 } = {}) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/') throw new Error('LM Studio 地址必须是本机 HTTP 地址');
    this.baseUrl = url.origin; this.token = token; this.model = model; this.timeoutMs = timeoutMs;
    this.busy = false;
    if (!['off', 'low', 'medium', 'high', 'xhigh', 'on'].includes(reasoning)) throw new Error('推理等级无效');
    this.reasoning = reasoning;
  }
  async request(path, body, timeoutMs = this.timeoutMs) {
    try {
      const response = await fetch(this.baseUrl + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
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
  async generateObject({ instructions, input, reasoning = this.reasoning }) {
    // Bounded admission: never pile up multiple 27B generations on the desktop.
    if (this.busy) throw Object.assign(new Error('本地模型正在处理另一条请求，请稍后重试'), { statusCode: 429 });
    this.busy = true;
    try {
      const selected = (await this.models()).find(m => m.id === this.model);
      if (!selected?.reasoningOptions.includes(reasoning)) throw new Error(`当前模型不支持推理等级 ${reasoning}，请在本地 AI 中检查状态并重新选择`);
      const response = await this.request('/api/v1/chat', {
        model: this.model, input: JSON.stringify(input), system_prompt: instructions,
        reasoning, temperature: 0, max_output_tokens: reasoning === 'off' ? 650 : 4096, context_length: 8192, store: false
      });
      // Native API controls reasoning explicitly on MLX. JSON is validated again by the domain resolver.
      const messages = response.output?.filter(item => item.type === 'message') || [];
      if (messages.length !== 1 || response.output?.some(item => item.type === 'tool_call')) throw new Error('模型未返回可用的闹钟结果，请补充具体时间或手动设置');
      const text = messages[0].content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      try { return JSON.parse(text); } catch { throw new Error('模型返回格式无效，尚未创建闹钟，请重试或手动设置'); }
    } finally { this.busy = false; }
  }
}
