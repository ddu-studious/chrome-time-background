// 手动验收：到点响铃由桌面水母报时（游到屏幕底部正中，弹出带大时间的气泡），需要你亲手点气泡里的按钮。
//   node desktop-reminder/smoke.mjs --extension-id=<id> [--action=dismiss|snooze] [--app=/tmp/tk/QA.app] [--auto]
// 默认连接已安装的真实组件（local-ai/.local/TimeKeeperDesktop.app）；加 --app 可指向隔离构建。
// --auto 只能配合 --app（隔离构建）：用验收钩子 ringButton 代替手点，走同一个按钮动作入口，用来无人值守地检查脚本本身。
// 不修改任何真实闹钟：会话是 desktop-smoke-test，回执由脚本代 Chrome 发出。
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const id = arg('extension-id');
const action = arg('action') || 'dismiss';
const auto = process.argv.includes('--auto');
if (!/^[a-p]{32}$/.test(id || '') || !['dismiss', 'snooze'].includes(action)) throw new Error('需要有效的 --extension-id 和 --action=dismiss|snooze');
if (auto && !arg('app')) throw new Error('--auto 只能配合 --app 指向隔离构建，不对真实组件打开验收钩子');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = arg('app') ? resolve(arg('app')) : resolve(root, 'local-ai/.local/TimeKeeperDesktop.app');
const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: auto ? { ...process.env, TIMEKEEPER_TEST_HOOKS: '1' } : process.env,
});
let buffer = Buffer.alloc(0), complete = false, ackAt = 0, polls = 0, waits = 0;
const timer = setTimeout(() => { console.error('等待原生气泡点击超时'); child.kill(); process.exitCode = 1; }, 180000);
function send(body) { const json = Buffer.from(JSON.stringify(body)); const header = Buffer.alloc(4); header.writeUInt32LE(json.length); child.stdin.write(Buffer.concat([header, json])); }
const confirmText = action === 'dismiss' ? '已停止' : '好的，10 分钟后再叫你';
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
    const size = buffer.readUInt32LE(0);
    const message = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
    console.log(JSON.stringify(message));
    if (message.requestId === 'show-test') {
      assert.equal(message.ok, true); assert.equal(message.visible, true); assert.equal(message.ringId, 'desktop-smoke-test');
      assert.equal(message.ringClock, '09:30'); assert.deepEqual(message.ringLines, ['桌面响铃验收']);
      send({ command: 'hide', sessionId: 'stale-session', requestId: 'stale-hide-test' });
    }
    if (message.requestId === 'stale-hide-test') {
      assert.equal(message.visible, true, '过期会话的 hide 不能收走水母');
      if (auto) send({ command: 'ping', requestId: 'wait-0' });
      else console.log(`请等水母游到屏幕底部正中、弹出气泡，然后点“${action === 'dismiss' ? '停止' : '10 分钟后再提醒'}”（可先切换应用/桌面，水母不会抢走焦点）。`);
    }
    if (message.requestId?.startsWith('wait-')) {      // 仅 --auto：等气泡弹出，越过 0.5 秒防误触窗口，再经钩子按下
      if (message.ringPhase === 'shown') setTimeout(() => send({ command: 'ringButton', id: action, requestId: 'hook-test' }), 700);
      else { assert.ok(++waits < 80, '水母 12 秒内应当游到落点并弹出气泡'); setTimeout(() => send({ command: 'ping', requestId: `wait-${waits}` }), 150); }
    }
    if (message.requestId === 'hook-test') assert.equal(message.ok, true, '验收钩子应当发出动作');
    if (message.type === 'action') {
      assert.equal(message.sessionId, 'desktop-smoke-test'); assert.equal(message.action, action);
      ackAt = Date.now();
      send({ command: 'actionResult', sessionId: message.sessionId, actionId: message.actionId, ok: true, requestId: 'ack-test' });
    }
    if (message.requestId === 'ack-test') {
      // 成功回执只是让水母显示确认语；气泡随后收起、响铃才算结束（visible 在确认语期间仍为 true）
      assert.equal(message.ringStatus, confirmText); assert.equal(message.ringId, 'desktop-smoke-test', '确认语显示期间会话仍在');
      send({ command: 'ping', requestId: 'poll-0' });
    }
    if (message.requestId?.startsWith('poll-')) {
      if (message.ringId === null) {
        assert.equal(message.visible, false); complete = true; clearTimeout(timer); child.stdin.end();
        console.log('PASS: 原生消息帧、水母报时、忽略过期关闭、按钮回传、确认语、响铃结束');
      } else {
        assert.ok(Date.now() - ackAt < 5000, '回执后 5 秒内响铃应当结束');
        setTimeout(() => send({ command: 'ping', requestId: `poll-${++polls}` }), 150);
      }
    }
  }
});
child.on('error', error => { console.error(error.message); clearTimeout(timer); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); if (!complete || code !== 0) process.exitCode = 1; });
send({ command: 'show', requestId: 'show-test', sessionId: 'desktop-smoke-test', title: '桌面响铃验收', clock: '09:30', labels: ['桌面响铃验收'], more: 0, timeText: '隔离验收，不修改真实闹钟', canSnooze: true, snoozeMinutes: 10 });
