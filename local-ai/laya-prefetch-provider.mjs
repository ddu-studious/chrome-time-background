import { readFileSync } from 'node:fs';

const ENDPOINT = 'http://127.0.0.1:19085/v1/systemone';
const TOKEN_FILE = new URL('./.local/laya-runtime/token', import.meta.url);
const fail = (message, code) => Object.assign(new Error(message), { code });

// The only destination is the locally managed, pinned Laya service. Callers
// supply the already validated app and tool-group catalog, never a URL.
export class LayaPrefetchProvider {
  constructor({ fetchImpl = fetch, tokenFile = TOKEN_FILE } = {}) {
    this.fetchImpl = fetchImpl;
    this.tokenFile = tokenFile;
  }

  async predict({ text, app, groups, signal }) {
    if (typeof text !== 'string' || text.length > 500 || !/^[a-z]+$/.test(app) ||
      !Array.isArray(groups) || groups.length < 1 || groups.length > 7 ||
      groups.some(row => !row || !/^[a-z.]+$/.test(row.id) || typeof row.title !== 'string' || row.title.length > 160)) {
      throw fail('Laya 预加载输入无效', 'LAYA_INPUT_INVALID');
    }
    let token;
    try { token = readFileSync(this.tokenFile, 'utf8').trim(); }
    catch { throw fail('Laya 令牌不可用', 'LAYA_TOKEN_UNAVAILABLE'); }
    if (token.length < 32) throw fail('Laya 令牌无效', 'LAYA_TOKEN_UNAVAILABLE');

    const questions = Object.fromEntries(groups.map((row, index) => [`g${index}`, {
      type: 'choice',
      instructions: `完成用户当前请求时，是否需要预先提供“${row.title}”工具组？只判断工具可见性，不决定执行动作。`,
      criteria: {
        A: '需要此工具组，用户当前请求可能用到组中的能力',
        B: '不需要此工具组，现有基础工具即可处理当前请求'
      }
    }]));
    const response = await this.fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: 'multilingual', state: { text, app }, questions }),
      signal
    });
    if (!response.ok) throw fail('Laya 服务拒绝请求', 'LAYA_HTTP_ERROR');
    if (!response.body) throw fail('Laya 响应为空', 'LAYA_RESPONSE_INVALID');
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 32768) throw fail('Laya 响应过长', 'LAYA_RESPONSE_INVALID');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    const raw = Buffer.concat(chunks).toString('utf8');
    let data;
    try { data = JSON.parse(raw); } catch { throw fail('Laya 响应格式无效', 'LAYA_RESPONSE_INVALID'); }
    if (data?.routing?.model !== 'multilingual' || !data.answers || typeof data.answers !== 'object') {
      throw fail('Laya 检查点或响应无效', 'LAYA_RESPONSE_INVALID');
    }
    const selected = [];
    for (let index = 0; index < groups.length; index++) {
      const choice = data.answers[`g${index}`]?.choice;
      if (!['A', 'B'].includes(choice)) throw fail('Laya 决策格式无效', 'LAYA_RESPONSE_INVALID');
      if (choice === 'A') selected.push(groups[index].id);
    }
    return selected;
  }
}
