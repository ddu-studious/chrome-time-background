import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const id = process.argv.find(a => a.startsWith('--extension-id='))?.split('=')[1];
if (!/^[a-p]{32}$/.test(id || '')) throw new Error('需要 --extension-id=实际扩展ID');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv.find(a => a.startsWith('--app='))?.slice(6) || resolve(root, 'local-ai/.local/TimeKeeperDesktop.app');
const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = Buffer.alloc(0), sequence = 0;
const pending = new Map();
function request(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = String(++sequence);
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`原生组件超时: ${command}`)); }, 5000);
    pending.set(requestId, value => { clearTimeout(timeout); resolve(value); });
    const body = Buffer.from(JSON.stringify({ command, requestId, ...payload }));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    child.stdin.write(Buffer.concat([header, body]));
  });
}
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
    const size = buffer.readUInt32LE(0);
    const message = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
    if (pending.has(message.requestId)) { pending.get(message.requestId)(message); pending.delete(message.requestId); }
    else console.log('EVENT', JSON.stringify(message));
  }
});
try {
  const timer = { id: 'countdown-smoke', title: '休息一下，看看远方', fireAt: Date.now() + 25 * 60000, count: 1 };
  const first = await request('countdown', { timer });
  assert.equal(first.ok, true); assert.equal(first.countdownVisible, true); assert.equal(first.visible, false); assert.equal(first.focusStayed, true);
  console.log('SHOW', JSON.stringify(first));
  const expectedWidth = Number(process.argv.find(a => a.startsWith('--expect-width='))?.split('=')[1]);
  if (expectedWidth) {
    const size = first.countdownFrame.match(/\{([\d.]+), ([\d.]+)\}\}$/);
    assert.ok(size, '需要真实窗口尺寸回执');
    assert.equal(Number(size[1]), expectedWidth, '重新启动必须保留用户选择的宽度');
    assert.ok(Math.abs(Number(size[2]) - expectedWidth / 3.4) < 1, '恢复胶囊比例');
  }
  await delay(1600);
  const tick = await request('ping');
  assert.notEqual(tick.countdownText, first.countdownText);
  assert.equal(tick.countdownFrame, first.countdownFrame);
  const invalid = await request('countdown', { timer: { ...timer, fireAt: 'bad' } });
  assert.equal(invalid.ok, false); assert.equal(invalid.countdownVisible, true);
  const renamed = await request('countdown', { timer: { ...timer, title: '改名后的提醒' } });
  assert.equal(renamed.countdownTitle, '改名后的提醒'); assert.equal(renamed.countdownFrame, first.countdownFrame);
  const ringing = await request('show', { sessionId: 'ring-smoke', title: '倒计时切换测试', timeText: '隔离测试，不修改真实闹钟', canSnooze: true });
  assert.equal(ringing.visible, true); assert.equal(ringing.countdownVisible, false);
  const stale = await request('hide', { sessionId: 'stale' });
  assert.equal(stale.visible, true);
  const stopped = await request('hide', { sessionId: 'ring-smoke' });
  assert.equal(stopped.visible, false); assert.equal(stopped.countdownVisible, true);
  const elapsed = await request('countdown', { timer: { ...timer, fireAt: Date.now() - 1000 } });
  assert.equal(elapsed.countdownText, '00:00');
  const long = await request('countdown', { timer: { ...timer, fireAt: Date.now() + 90000000 } });
  assert.match(long.countdownText, /^1天 /);
  await request('countdown', { timer });
  if (process.argv.includes('--preview')) {
    const previewMs = Math.max(10000, Math.min(300000, Number(process.argv.find(a => a.startsWith('--preview-ms='))?.split('=')[1]) || 90000));
    console.log(`PREVIEW：保留 ${previewMs / 1000} 秒用于截图和拖动验收；此测试不写入 Chrome 闹钟。`);
    await delay(previewMs);
    console.log('AFTER_PREVIEW', JSON.stringify(await request('ping')));
  }
  const hidden = await request('countdown', { timer: null });
  assert.equal(hidden.countdownVisible, false);
  console.log('PASS: 原生显示、每秒更新、不抢焦点、输入校验、更新不移位、响铃优先、过期会话隔离、到期归零、跨天显示、隐藏');
} finally { child.stdin.end(); }
