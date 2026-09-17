import { readFileSync, existsSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';

export interface CompletionChunk {
  type: 'token' | 'done' | 'error';
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
export interface CompletionOptions {
  model?: string; temperature?: number; maxTokens?: number; topP?: number; signal?: AbortSignal;
}
const scope = new AsyncLocalStorage<AbortSignal>();
export const withWritingSignal = <T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> => scope.run(signal, run);
const tokenPath = () => process.env.LOCAL_AI_TOKEN_FILE || fileURLToPath(new URL('../../../local-ai/.local/token', import.meta.url));
const base = 'http://127.0.0.1:19841';

// Compatibility name retained for Bridge callers; all model traffic goes through the scene gateway.
export class QwenClient {
  constructor(_legacyKey?: string, _legacyOptions?: {baseURL?: string; defaultModel?: string}) {}
  async runScene(scene: string, input: unknown, opts: CompletionOptions = {}): Promise<any> {
    const token = readFileSync(tokenPath(), 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('本地 AI 连接令牌无效');
    const signal = opts.signal || scope.getStore();
    let jobId: string | undefined;
    const call = async (path: string, body?: unknown, cancellable = true): Promise<any> => {
      const timeout = AbortSignal.timeout(7000);
      const response = await fetch(base + path, { method: body ? 'POST' : 'GET', redirect: 'error',
        signal: signal && cancellable ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? {body: JSON.stringify(body)} : {}) });
      const data = await response.json() as any;
      if (!response.ok || !data.ok) throw new Error(data.error || '本地 AI 请求失败');
      return data;
    };
    try {
      signal?.throwIfAborted();
      // Keep submission short but receive its ID even if the caller disconnects in flight.
      let result = await call('/v1/ai/interpret', {scene,input}, false);
      jobId = result.jobId; signal?.throwIfAborted();
      const deadline = Date.now() + 100000;
      while (result.status === 'pending') {
        if (Date.now() > deadline) throw new Error('本地写作请求超时');
        await new Promise(resolve => setTimeout(resolve, 500)); signal?.throwIfAborted();
        result = await call(`/v1/ai/jobs/${jobId}`);
      }
      signal?.throwIfAborted();
      if (!result.data) throw new Error('场景结果无效');
      return result.data;
    } catch (error) {
      if (jobId) await call(`/v1/ai/jobs/${jobId}/cancel`, {}, false).catch(() => {});
      throw error;
    }
  }
  async complete(guidance: string, context: string, opts: CompletionOptions = {}): Promise<{content: string; usage?: CompletionChunk['usage']}> {
    const result = await this.runScene('writing.assist', {context, guidance}, opts);
    if (typeof result.content !== 'string') throw new Error('写作结果无效');
    return {content:result.content};
  }
  async *streamComplete(guidance: string, context: string, opts: CompletionOptions = {}): AsyncGenerator<CompletionChunk> {
    try {
      const result = await this.complete(guidance, context, opts);
      yield {type:'token',content:result.content};
      yield {type:'done',content:''};
    } catch (error: any) { yield {type:'error',content:error.message || '本地写作请求失败'}; }
  }
}
let instance: QwenClient | undefined;
export const getQwenClient = (): QwenClient => instance ||= new QwenClient();
export const isQwenConfigured = (): boolean => existsSync(tokenPath());
