import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const id = process.argv.find(a => a.startsWith('--extension-id='))?.split('=')[1];
if (!/^[a-p]{32}$/.test(id || '')) throw new Error('需要 --extension-id=实际扩展ID');
const app = process.argv.find(a => a.startsWith('--app='))?.slice(6) || resolve('local-ai/.local/TimeKeeperDesktop.app');
const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = Buffer.alloc(0), sequence = 0, actions = [];
const pending = new Map();
function request(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = String(++sequence);
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`原生组件超时: ${command}`)); }, 5000);
    pending.set(requestId, value => { clearTimeout(timeout); resolve(value); });
    const body = Buffer.from(JSON.stringify({ command, requestId, ...payload })), header = Buffer.alloc(4);
    header.writeUInt32LE(body.length); child.stdin.write(Buffer.concat([header, body]));
  });
}
const card = version => ({ id: `confirmation-smoke:${version}`, taskId: 'confirmation-smoke', version, expiresAt: Date.now() + 300000,
  title: '需要你确认', message: '修改前：开会 · 明天 09:00\n修改后：开会 · 明天 09:30\n\n这是隔离测试卡片，不会修改真实提醒。', choiceId: 'confirm', choiceTitle: '修改开会提醒', label: '确认修改' });
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
    const size = buffer.readUInt32LE(0), message = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
    if (pending.has(message.requestId)) { pending.get(message.requestId)(message); pending.delete(message.requestId); }
    else {
      console.log('EVENT', JSON.stringify(message));
      actions.push(message);
      if (process.argv.includes('--interactive') && message.type === 'confirmationAction') {
        void request('confirmationResult', { confirmationId: message.confirmationId, actionId: message.actionId, ok: true })
          .then(() => request('confirmation', { card: card(message.version + 1) })).catch(error => { console.error(error); process.exitCode = 1; });
      }
    }
  }
});
try {
  const first = await request('confirmation', { card: card(1) });
  assert.equal(first.ok, true); assert.equal(first.version, 3); assert.equal(first.confirmationVisible, true); assert.equal(first.confirmationFocusStayed, true);
  console.log('SHOW', JSON.stringify(first));
  const invalid = await request('confirmation', { card: { ...card(2), expiresAt: 'bad' } });
  assert.equal(invalid.ok, false); assert.equal(invalid.confirmationId, card(1).id);
  const stale = await request('confirmationResult', { confirmationId: 'stale', actionId: 'stale', ok: true });
  assert.equal(stale.confirmationVisible, true);
  const update = await request('confirmation', { card: { ...card(1), message: '更新内容后位置保持不变\n\n' + '完整操作详情，可滚动核对。'.repeat(90) } });
  assert.equal(update.confirmationFrame, first.confirmationFrame);
  await request('confirmation', { card: card(1) });
  await request('countdown', { timer: { id: 'coexist', title: '隔离倒计时', fireAt: Date.now() + 60000 } });
  const hidden = await request('confirmation', { card: null });
  assert.equal(hidden.confirmationVisible, false); assert.equal(hidden.countdownVisible, true);
  await request('countdown', { timer: null });
  await request('confirmation', { card: card(1) });
  if (process.argv.includes('--interactive')) {
    console.log('INTERACTIVE: 请依次点击确认、取消、关闭；卡片为隔离测试，不会操作 Chrome 数据。');
    const end = Date.now() + 180000;
    while (Date.now() < end && !actions.some(m => m.type === 'confirmationHidden')) await delay(250);
    assert.deepEqual(actions.filter(m => m.type === 'confirmationAction').map(m => m.action), ['confirm', 'cancel']);
    assert.ok(actions.some(m => m.type === 'confirmationHidden'));
  }
  await request('confirmation', { card: { ...card(9), expiresAt: Date.now() + 300 } });
  await delay(1400);
  assert.equal((await request('ping')).confirmationVisible, false);
  console.log('PASS: 原生确认卡、输入校验、旧回执隔离、位置稳定、倒计时共存、到期收起' + (process.argv.includes('--interactive') ? '、真实确认/取消/关闭按钮回传' : ''));
} finally { child.stdin.end(); }
