import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export const REMOTE_MODELS = Object.freeze([
  Object.freeze({ id: 'deepseek-flash', name: 'DeepSeek Flash', selection: 'deepseek:flash' }),
  Object.freeze({ id: 'deepseek-v4-pro', name: 'DeepSeek Pro', selection: 'deepseek:pro' })
]);
export const REMOTE_DEFAULTS = Object.freeze({ mode: 'off', provider: 'deepseek', model: 'deepseek-flash', contextLength: 32768, cpuPercent: 85, minFreeMemoryMb: 1024, contextFallback: true });
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export function createRemoteConfig({ file } = {}) {
  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => ![...Object.keys(REMOTE_DEFAULTS), 'apiKey'].includes(key))) throw fail('外部模型配置包含无效字段');
    const next = { ...REMOTE_DEFAULTS, ...value };
    if (!['off', 'auto', 'remote'].includes(next.mode) || next.provider !== 'deepseek') throw fail('外部模型模式无效');
    if (typeof next.model !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(next.model)) throw fail('外部模型名称无效');
    if (!Number.isInteger(next.contextLength) || next.contextLength < 8192 || next.contextLength > 32768) throw fail('外部上下文预算须为 8192 至 32768 token');
    if (!Number.isInteger(next.cpuPercent) || next.cpuPercent < 20 || next.cpuPercent > 100 || !Number.isInteger(next.minFreeMemoryMb) || next.minFreeMemoryMb < 128 || next.minFreeMemoryMb > 65536 || typeof next.contextFallback !== 'boolean') throw fail('外部兜底阈值无效');
    if (typeof next.apiKey !== 'string' || next.apiKey.length > 256 || (next.apiKey && !/^[\x21-\x7e]+$/.test(next.apiKey))) throw fail('API Key 格式无效');
    if (next.mode !== 'off' && !next.apiKey) throw fail('启用外部模型前请填写 API Key');
    return next;
  }
  let revision = 1, config = validate({ apiKey: '' });
  if (file && existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) throw fail('外部模型配置文件损坏');
    revision = saved.revision; config = validate(saved.config);
    chmodSync(file, 0o600);
  }
  const snapshot = () => {
    const { apiKey, ...publicConfig } = config;
    return { revision, ...publicConfig, keyConfigured: Boolean(apiKey), models: REMOTE_MODELS.map(model => ({ ...model })) };
  };
  return {
    snapshot,
    // Service-only accessor. This value never enters control snapshots, history or browser storage.
    credentials: () => ({ ...config, revision }),
    update(value, expectedRevision) {
      if (expectedRevision !== revision) throw fail('外部模型配置已更新，请刷新后再试', 409);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('外部模型配置无效');
      const { apiKey, clearKey, ...settings } = value;
      if (clearKey !== undefined && typeof clearKey !== 'boolean') throw fail('密钥清除选项无效');
      const next = validate({ ...config, ...settings, apiKey: clearKey === true ? '' : apiKey === undefined || apiKey === '' ? config.apiKey : apiKey });
      if (file) {
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        writeFileSync(file + '.tmp', JSON.stringify({ revision: revision + 1, config: next }), { mode: 0o600 });
        chmodSync(file + '.tmp', 0o600);
        renameSync(file + '.tmp', file);
      }
      config = next; revision++;
      return snapshot();
    }
  };
}
