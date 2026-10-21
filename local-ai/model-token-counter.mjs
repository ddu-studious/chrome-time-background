// Official SDK, read-only loaded-model handles. No model(), load(), respond(),
// plugin discovery or generation is used here. Do not replace SDK failures with
// a homemade tokenizer: the caller must see the failure.
export class ModelTokenCounter {
  constructor({ baseUrl, token }) { this.baseUrl = baseUrl.replace(/^http:/, 'ws:'); this.token = token; }
  async count({ instructions, input, model, signal, timeoutMs = 5000 }) {
    signal?.throwIfAborted();
    if (this.pending) throw Object.assign(new Error('模型分词服务仍在处理上一条请求，请稍后重试'), { code: 'MODEL_TOKENIZATION_BUSY' });
    const started = Date.now(), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(Object.assign(new Error('模型分词计数超时，本次未发送生成请求'), { code: 'MODEL_TOKENIZATION_TIMEOUT' })), Math.min(timeoutMs, 5000));
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    // SDK 2.1.0 read RPCs have no AbortSignal argument. Check between RPCs and
    // retain the pending slot until the outstanding RPC settles, even on abort.
    const operation = (async () => {
      if (!this.client) {
        const { LMStudioClient } = await import('@lmstudio/sdk');
        combined.throwIfAborted();
        this.client = new LMStudioClient({ baseUrl: this.baseUrl, ...(this.token ? { apiToken: this.token } : {}),
          logger: { debug() {}, info() {}, warn() {}, error() {} } });
      }
      combined.throwIfAborted();
      const handle = this.client.llm.createDynamicHandle({ identifier: model, deviceIdentifier: null });
      const contextLength = await handle.getContextLength();
      combined.throwIfAborted();
      const formatted = await handle.applyPromptTemplate([{ role: 'system', content: instructions },
        { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) }]);
      combined.throwIfAborted();
      const inputTokens = await handle.countTokens(formatted);
      combined.throwIfAborted();
      return { inputTokens, contextLength, elapsedMs: Date.now() - started };
    })();
    this.pending = operation;
    operation.finally(() => { if (this.pending === operation) this.pending = null; }).catch(() => {});
    let onAbort;
    try {
      return await Promise.race([operation, new Promise((_, reject) => {
        onAbort = () => reject(combined.reason);
        if (combined.aborted) onAbort(); else combined.addEventListener('abort', onAbort, { once: true });
      })]);
    } catch (error) {
      if (combined.aborted) throw combined.reason;
      // SDK diagnostics may contain the model query or text. Keep them out of
      // the product response/log, and preserve a stable actionable error code.
      throw Object.assign(new Error('无法使用 LM Studio 官方分词服务，请检查服务与 SDK 兼容性；本次未发送生成请求'), { code: 'MODEL_TOKENIZATION_FAILED' });
    } finally {
      clearTimeout(timeout); combined.removeEventListener('abort', onAbort);
    }
  }
}
