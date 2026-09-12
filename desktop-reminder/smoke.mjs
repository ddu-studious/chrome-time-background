import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const id = process.argv.find(a => a.startsWith('--extension-id='))?.split('=')[1];
const action = process.argv.find(a => a.startsWith('--action='))?.split('=')[1] || 'dismiss';
if (!/^[a-p]{32}$/.test(id || '') || !['dismiss', 'snooze'].includes(action)) throw new Error('需要有效的 --extension-id 和 --action=dismiss|snooze');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(resolve(root, 'local-ai/.local/TimeKeeperDesktop.app/Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = Buffer.alloc(0), complete = false;
const timer = setTimeout(() => { console.error('等待原生卡片点击超时'); child.kill(); process.exitCode = 1; }, 180000);
function send(body) { const json = Buffer.from(JSON.stringify(body)); const header = Buffer.alloc(4); header.writeUInt32LE(json.length); child.stdin.write(Buffer.concat([header, json])); }
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
    const size = buffer.readUInt32LE(0);
    const message = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
    console.log(JSON.stringify(message));
    if (message.requestId === 'show-test') {
      assert.equal(message.ok, true); assert.equal(message.visible, true);
      send({ command: 'hide', sessionId: 'stale-session', requestId: 'stale-hide-test' });
    }
    if (message.requestId === 'stale-hide-test') { assert.equal(message.visible, true); console.log(`请在原生卡片点击 ${action === 'dismiss' ? '停止提醒' : '10 分钟后再提醒'}，可先切换应用/桌面。`); }
    if (message.type === 'action') {
      assert.equal(message.sessionId, 'desktop-smoke-test'); assert.equal(message.action, action);
      send({ command: 'actionResult', sessionId: message.sessionId, actionId: message.actionId, ok: true, requestId: 'ack-test' });
    }
    if (message.requestId === 'ack-test') { assert.equal(message.visible, false); complete = true; clearTimeout(timer); child.stdin.end(); console.log('PASS: 原生消息帧、显示、忽略过期关闭、按钮回传、确认后关闭'); }
  }
});
child.on('error', error => { console.error(error.message); clearTimeout(timer); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); if (!complete || code !== 0) process.exitCode = 1; });
send({ command: 'show', requestId: 'show-test', sessionId: 'desktop-smoke-test', title: action === 'dismiss' ? '桌面闹钟 · 停止操作测试' : '桌面闹钟 · 稍后提醒测试', timeText: '隔离验收，不修改真实闹钟', canSnooze: true, snoozeMinutes: 10 });
