import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const id = process.argv.find(a => a.startsWith('--extension-id='))?.split('=')[1];
if (!/^[a-p]{32}$/.test(id || '')) throw new Error('需要 --extension-id=实际扩展ID');
const app = process.argv.find(a => a.startsWith('--app='))?.slice(6) || '/tmp/TimeKeeperInteractionQA.app';
const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = Buffer.alloc(0), sequence = 0;
const pending = new Map(), events = [];
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
    const size = buffer.readUInt32LE(0), message = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
    if (pending.has(message.requestId)) { pending.get(message.requestId)(message); pending.delete(message.requestId); }
    else { events.push(message); console.log('EVENT', JSON.stringify(message)); }
  }
});
function request(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = String(++sequence), timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`原生组件超时: ${command}`)); }, 5000);
    pending.set(requestId, value => { clearTimeout(timeout); resolve(value); });
    const body = Buffer.from(JSON.stringify({ command, requestId, ...payload })), header = Buffer.alloc(4);
    header.writeUInt32LE(body.length); child.stdin.write(Buffer.concat([header, body]));
  });
}
const row = (id, title) => ({ id, title, subtitle: '隔离测试候选，不会操作真实账号', label: '选择歌手', kind: 'artist' });
const card = (version, kind = 'select') => ({ protocolVersion: 4, id: `interaction-smoke:${version}`, taskId: 'interaction-smoke', version, status: kind === 'select' ? 'waiting' : kind === 'input' ? 'clarify' : kind === 'confirm' ? 'review' : 'failed', kind,
  expiresAt: Date.now() + 300000, message: kind === 'select' ? '请选择你要听的歌手。\n这是隔离测试，不会播放音乐或创建提醒。' : '请补充歌手名称。输入“林俊杰”，点击发送回答。\n这是隔离测试，不会调用模型或修改真实数据。',
  allowText: kind !== 'inspect', choices: kind === 'select' ? [row('other', '其他候选'), row('jj', '林俊杰'), row('page', '下一页')] : kind === 'confirm' ? [{ ...row('confirm', '隔离确认操作'), label: '确认执行' }] : [] });
async function waitEvent() {
  const end = Date.now() + 180000;
  while (!events.length && Date.now() < end) await delay(100);
  assert.ok(events.length, '等待原生按钮事件超时'); return events.shift();
}
try {
  const initial = await request('confirmation', { card: card(1) });
  assert.equal(initial.version, 4); assert.equal(initial.ok, true); assert.equal(initial.confirmationVisible, true); assert.equal(initial.confirmationFocusStayed, true); assert.equal(initial.confirmationChoiceCount, 3);
  for (const kind of ['input', 'confirm', 'inspect']) {
    const result = await request('confirmation', { card: card(2, kind) }); assert.equal(result.ok, true); assert.equal(result.confirmationKind, kind);
  }
  const many = { ...card(3), choices: Array.from({ length: 96 }, (_, i) => row(String(i), `第${i + 1}位歌手`)) };
  assert.equal((await request('confirmation', { card: many })).confirmationChoiceCount, 96);
  assert.equal((await request('confirmation', { card: { ...many, choices: [...many.choices, row('97', '超限')] } })).ok, false);
  assert.equal((await request('confirmation', { card: { ...card(3), choices: [row('same', '甲'), row('same', '乙')] } })).ok, false);
  await request('countdown', { timer: { id: 'interaction-qa-timer', title: '隔离倒计时', fireAt: Date.now() + 60000 } });
  const hidden = await request('confirmation', { card: null }); assert.equal(hidden.countdownVisible, true); await request('countdown', { timer: null });
  if (process.argv.includes('--interactive') || process.argv.includes('--input-only')) {
    const phases = process.argv.includes('--input-only') ? [[11, 'input', 'reply']] : [[10, 'select', 'select'], [11, 'input', 'reply'], [12, 'confirm', 'select'], [13, 'input', 'cancel'], [14, 'inspect', 'open'], [15, 'input', 'hidden']];
    for (const [index, kind, action] of phases) {
      await request('confirmation', { card: card(index, kind) }); console.log(`READY ${kind} ${action}`);
      const event = await waitEvent(); assert.equal(event.confirmationId, `interaction-smoke:${index}`);
      if (action === 'hidden') { assert.equal(event.type, 'confirmationHidden'); continue; }
      assert.equal(event.action, action); assert.equal(event.taskId, 'interaction-smoke'); assert.equal(event.version, index);
      if (index === 10) assert.equal(event.choiceId, 'jj');
      if (index === 11) assert.equal(event.text, '林俊杰');
      if (index === 12) assert.equal(event.choiceId, 'confirm');
      await request('confirmationResult', { confirmationId: event.confirmationId, actionId: event.actionId, ok: true });
    }
  }
  await request('confirmation', { card: { ...card(20, 'input'), expiresAt: Date.now() + 250 } });
  await delay(1300); assert.equal((await request('ping')).confirmationVisible, false);
  console.log('PASS: 协议v4、三种交互与核对入口、96候选、非法候选拒绝、不抢焦点、倒计时共存、到期收起' + (process.argv.includes('--input-only') ? '、实际输入回传' : process.argv.includes('--interactive') ? '、实际选择/输入/确认/取消/工作台/隐藏事件' : ''));
} finally { child.stdin.end(); }
