import { ExtensionRunner, createExtensionRuntime, createSyntheticSourceInfo, SessionManager } from '@earendil-works/pi-coding-agent';
import AlarmIntent from '../js/alarm-intent.js';

export const APPROVAL_POLICY = 'assistant-approval-v1';
export const APPROVAL_SDK = '@earendil-works/pi-coding-agent@0.85.1';
const fail = message => Object.assign(new Error(message), { statusCode: 400 });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const blockedIntent = /不要|先不|先别|别(?:创建|修改|保存|执行)|仅(?:看|查|预览)|只(?:看|查|预览)|给我看看|预览|确认后|确认再|是否|能否|可以吗|[?？]|如果/;
const clean = text => text.trim().replace(/^(?:请|帮我|请帮我)\s*/, '').replace(/[。！!]+$/, '');
const alarmKeys = ['label', 'date', 'time', 'fireAt', 'repeat', 'days', 'enabled', 'intensity'];

function creationMatches(text, alarm, body) {
  const raw = AlarmIntent.parseLocal(clean(text));
  if (!raw || !['relative', 'once'].includes(raw.kind)) return false;
  const resolved = AlarmIntent.resolve(raw, { now: body.anchor, timeZone: body.data.zone });
  return resolved.status === 'ready' && alarm.fireAt > body.now && Object.keys(alarm).every(key => alarmKeys.includes(key)) &&
    alarmKeys.every(key => same(resolved.alarm[key], alarm[key]));
}

function updateMatches(text, before, after, body) {
  if (!before || before.repeat !== 'once' || after?.repeat !== 'once' || after.fireAt <= body.now) return false;
  // Only these three fields and their derived timestamp may change automatically.
  const editable = new Set(['label', 'date', 'time', 'fireAt']);
  if (Object.keys({ ...before, ...after }).some(key => !editable.has(key) && !same(before[key], after[key]))) return false;
  const escaped = before.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^(?:把)?${escaped}(?:的)?(?:提醒|闹钟)?(?:的)?(?:时间|名称|名字)?(?:修改为|修改到|改到|改为|改成|改名为|重命名为)(.+)$`).exec(clean(text));
  if (!match) return false;
  const target = match[1].trim();
  if (/改名|重命名|名称|名字/.test(text)) return after.label === target && ['date', 'time', 'fireAt'].every(key => same(before[key], after[key]));
  if (after.label !== before.label) return false;
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(target)) return after.time === target && after.date === before.date &&
    after.fireAt === AlarmIntent.wallTime(before.date, Number(target.slice(0, 2)), Number(target.slice(3)), body.data.zone);
  const raw = AlarmIntent.parseLocal(`${target}提醒我${before.label}`);
  if (raw?.kind !== 'once') return false;
  const resolved = AlarmIntent.resolve(raw, { now: body.anchor, timeZone: body.data.zone });
  return resolved.status === 'ready' && ['date', 'time', 'fireAt'].every(key => same(resolved.alarm[key], after[key]));
}

function reasonToReview(body) {
  if ([body.text, ...body.constraints].some(text => blockedIntent.test(text))) return '用户要求预览、保留确认，或授权仍有歧义';
  // Read the original user text, never the planner's rewritten alarm.prepare text.
  const clauses = body.text.split(/(?:[，,]?(?:然后|并且)|，再|,再|；|;)/).map(clean);
  if (body.action === 'alarm.create' && body.data.alarm?.repeat === 'once' &&
      clauses.some(text => creationMatches(text, body.data.alarm, body))) return null;
  if (body.action === 'alarm.commit' && body.data.action === 'update' &&
      clauses.some(text => updateMatches(text, body.before, body.data.patch, body))) return null;
  return '该操作需要确认具体目标或影响范围';
}

export async function evaluateApproval(body) {
  if (!body || typeof body.requestId !== 'string' || body.requestId.length > 160 || !Number.isSafeInteger(body.version) ||
      typeof body.text !== 'string' || body.text.length > 6000 || !Array.isArray(body.constraints) || body.constraints.length > 96 ||
      body.constraints.some(text => typeof text !== 'string' || text.length > 6000) ||
      typeof body.action !== 'string' || body.action.length > 80 || !body.data || typeof body.data !== 'object' ||
      !Number.isFinite(body.anchor) || !Number.isFinite(body.now) || body.anchor > body.now ||
      Buffer.byteLength(JSON.stringify(body)) > 48000) throw fail('确认判断请求无效');
  let reason = '该操作需要确认具体目标或影响范围';
  const path = '<inline:assistant-approval>';
  // Only our built-in handler is installed. No filesystem discovery, AgentSession,
  // model binding, shell tools, or user/global plugins are initialized.
  const extension = {
    path, resolvedPath: path, sourceInfo: createSyntheticSourceInfo(path, { source: 'assistant-approval', scope: 'temporary' }),
    handlers: new Map([['tool_call', [event => {
      try { reason = reasonToReview(event.input); }
      catch { reason = '无法确定操作参数，请核对后确认'; }
      return reason ? { block: true, reason } : undefined;
    }]]]),
    tools: new Map(), messageRenderers: new Map(), entryRenderers: new Map(), commands: new Map(), flags: new Map(), shortcuts: new Map()
  };
  // This policy-only runner cannot use a model registry. Access is a hard error,
  // rather than silently creating a default provider or reading global credentials.
  const noModels = new Proxy({}, { get() { throw new Error('确认策略不允许访问模型'); } });
  const runner = new ExtensionRunner([extension], createExtensionRuntime(), '', SessionManager.inMemory(''), noModels);
  const result = await runner.emitToolCall({ type: 'tool_call', toolName: body.action, toolCallId: body.requestId, input: body });
  return { requestId: body.requestId, version: body.version, policy: APPROVAL_POLICY, sdk: APPROVAL_SDK,
    decision: result?.block ? 'confirm' : 'allow', reason: result?.reason || '用户已明确要求，且为可核对的单条低风险操作' };
}
