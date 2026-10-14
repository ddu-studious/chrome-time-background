// service.sh restart: launchctl bootout returns before the old process is gone, so bootstrap used to hit
// "5: Input/output error". These tests drive the real orchestration code against a simulated launchd whose
// teardown is delayed (observed 13-490 ms in the 2026-10-12 launchd logs) and whose clock only moves on sleep().
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  UNLOAD_WAIT_MS, READY_WAIT_MS,
  waitUntilUnloaded, bootstrapJob, reloadJob, parseJobState, waitForReady, describeNotReady, tailLines, readTail
} from '../local-ai/scripts/service.mjs';

function clock() {
  const state = { t: 0, sleeps: [] };
  return { state, now: () => state.t, sleep: async ms => { state.sleeps.push(ms); state.t += ms; } };
}

const RACE = { status: 5, stderr: 'Bootstrap failed: 5: Input/output error\nTry re-running the command as root for richer errors.\n' };

// A job that exists until `removeDelayMs` after bootout, like launchd waiting for the process to exit.
function fakeLaunchd({ time, loaded = true, removeDelayMs = 40, transientBootstrapFailures = 0, bootstrapResult = null }) {
  const job = { exists: loaded, removeAt: null, bootstrapFailures: transientBootstrapFailures };
  const calls = [];
  const exists = () => job.exists && (job.removeAt === null || time.state.t < job.removeAt);
  const launch = (...args) => {
    calls.push(args[0]);
    switch (args[0]) {
      case 'print': return exists() ? { status: 0, stdout: '', stderr: '' } : { status: 113, stdout: '', stderr: 'Could not find service' };
      case 'bootout':
        if (!exists()) return { status: 3, stderr: 'Boot-out failed: 3: No such process' };
        job.removeAt = time.state.t + removeDelayMs; // returns at once, teardown finishes later
        return { status: 0, stderr: '' };
      case 'enable': return { status: 0, stderr: '' };
      case 'bootstrap':
        if (bootstrapResult) return bootstrapResult;
        if (exists()) return RACE;
        if (job.bootstrapFailures > 0) { job.bootstrapFailures -= 1; return RACE; }
        job.exists = true; job.removeAt = null;
        return { status: 0, stderr: '' };
      default: throw new Error(`unexpected launchctl ${args.join(' ')}`);
    }
  };
  return { launch, calls, exists, job };
}

const reloadArgs = (time, launchd, extra = {}) => ({
  launch: launchd.launch, sleep: time.sleep, now: time.now,
  target: 'gui/501/local.test', scope: 'gui/501', plist: '/tmp/local.test.plist', ...extra
});

test('restart 等旧服务真正卸载后才替换配置并加载，延迟拆除不再触发 5 号错误', async () => {
  const time = clock();
  const launchd = fakeLaunchd({ time, removeDelayMs: 40 });
  const events = [];
  await reloadJob(reloadArgs(time, launchd, {
    commit: () => events.push(['commit', launchd.exists()]),
    discard: () => events.push(['discard'])
  }));
  assert.deepEqual(events, [['commit', false]], '配置只在旧服务已卸载之后替换');
  assert.equal(launchd.exists(), true, '新服务已加载');
  assert.equal(launchd.calls.filter(name => name === 'bootout').length, 1);
  assert.equal(launchd.calls.filter(name => name === 'bootstrap').length, 1, '不需要靠重试蒙混过关');
});

test('旧服务一直不卸载时在期限内明确失败：不替换配置、不加载，并清理待提交配置', async () => {
  const time = clock();
  const launchd = fakeLaunchd({ time, removeDelayMs: UNLOAD_WAIT_MS * 3 });
  const events = [];
  await assert.rejects(
    reloadJob(reloadArgs(time, launchd, { commit: () => events.push('commit'), discard: () => events.push('discard') })),
    /旧服务.*仍未卸载/
  );
  assert.deepEqual(events, ['discard']);
  assert.ok(!launchd.calls.includes('bootstrap'));
  assert.ok(!launchd.calls.includes('enable'));
  assert.ok(time.state.t <= UNLOAD_WAIT_MS + 200, `等待必须有界，实际 ${time.state.t} ms`);
});

test('停止旧服务本身失败时同样清理待提交配置，不继续加载', async () => {
  const time = clock();
  const launchd = fakeLaunchd({ time });
  const failing = { ...launchd, launch: (...args) => (args[0] === 'bootout' ? { status: 1, stderr: 'denied' } : launchd.launch(...args)) };
  const events = [];
  await assert.rejects(reloadJob(reloadArgs(time, failing, { commit: () => events.push('commit'), discard: () => events.push('discard') })), /停止旧守护服务失败：denied/);
  assert.deepEqual(events, ['discard']);
});

test('替换配置时出错也清理待提交配置并如实报告', async () => {
  const time = clock();
  const launchd = fakeLaunchd({ time, loaded: false });
  const events = [];
  await assert.rejects(
    reloadJob(reloadArgs(time, launchd, { commit: () => { throw new Error('rename failed'); }, discard: () => events.push('discard') })),
    /rename failed/
  );
  assert.deepEqual(events, ['discard']);
  assert.ok(!launchd.calls.includes('bootstrap'));
});

test('print 已显示卸载但 launchd 仍短暂返回 5 号错误：有限次重试后成功', async () => {
  const time = clock();
  const launchd = fakeLaunchd({ time, loaded: false, transientBootstrapFailures: 2 });
  await reloadJob(reloadArgs(time, launchd, { commit() {}, discard() { assert.fail('不应放弃'); } }));
  assert.equal(launchd.calls.filter(name => name === 'bootstrap').length, 3);
  assert.equal(launchd.exists(), true);
});

test('5 号错误持续出现时重试有上限并带出 launchd 原文', async () => {
  const time = clock();
  const launchd = fakeLaunchd({ time, loaded: false, transientBootstrapFailures: 1000 });
  await assert.rejects(
    reloadJob(reloadArgs(time, launchd, { commit() {}, discard() {} })),
    error => /加载用户服务失败/.test(error.message) && /Input\/output error/.test(error.message)
  );
  assert.equal(launchd.calls.filter(name => name === 'bootstrap').length, 5);
  assert.ok(time.state.t < 5000, `重试等待必须有界，实际 ${time.state.t} ms`);
});

test('非竞态的加载错误不重试，立即报告原文', async () => {
  const time = clock();
  const launchd = fakeLaunchd({ time, loaded: false, bootstrapResult: { status: 78, stderr: 'Bootstrap failed: 78: Path had bad ownership/permissions\n' } });
  await assert.rejects(
    reloadJob(reloadArgs(time, launchd, { commit() {}, discard() {} })),
    /加载用户服务失败.*bad ownership/s
  );
  assert.equal(launchd.calls.filter(name => name === 'bootstrap').length, 1);
  assert.equal(time.state.sleeps.length, 0);
});

test('原本没有加载服务时不 bootout、不等待，直接替换并加载', async () => {
  const time = clock();
  const launchd = fakeLaunchd({ time, loaded: false });
  const events = [];
  await reloadJob(reloadArgs(time, launchd, { commit: () => events.push('commit'), discard: () => events.push('discard') }));
  assert.deepEqual(events, ['commit']);
  assert.ok(!launchd.calls.includes('bootout'));
  assert.equal(time.state.sleeps.length, 0);
});

test('waitUntilUnloaded：已卸载不睡眠；超时抛出有界错误', async () => {
  const time = clock();
  await waitUntilUnloaded({ isLoaded: () => false, sleep: time.sleep, now: time.now });
  assert.equal(time.state.sleeps.length, 0);
  await assert.rejects(waitUntilUnloaded({ isLoaded: () => true, sleep: time.sleep, now: time.now, timeoutMs: 1000, intervalMs: 100 }), /1 秒内/);
  assert.ok(time.state.t >= 1000 && time.state.t <= 1100);
});

test('bootstrapJob 只重试 launchd 的 5 号错误', async () => {
  const time = clock();
  const outcomes = [RACE, { status: 0, stderr: '' }];
  const result = await bootstrapJob({ run: () => outcomes.shift(), sleep: time.sleep });
  assert.equal(result.status, 0);
  assert.equal(outcomes.length, 0);
  // 状态码恰好是 5 但文字不同，也属于同一类错误；其他状态码不属于
  const byStatusOnly = [{ status: 5, stderr: '' }, { status: 0, stderr: '' }];
  assert.equal((await bootstrapJob({ run: () => byStatusOnly.shift(), sleep: time.sleep })).status, 0);
  let runs = 0;
  await assert.rejects(bootstrapJob({ run: () => { runs += 1; return { status: 37, stderr: 'Operation already in progress' }; }, sleep: time.sleep }), /加载用户服务失败/);
  assert.equal(runs, 1);
});

const RUNNING = `local.chrome-time-background.ai = {
	active count = 1
	path = /Users/x/Library/LaunchAgents/local.chrome-time-background.ai.plist
	state = running

	program = /Users/x/.hermes/node/bin/node
	exit timeout = 5
	runs = 1
	pid = 91091
	immediate reason = speculative
	forks = 0
	execs = 1
	last exit code = (never exited)

	endpoints = {
		"x" = {
			state = active
			active count = 1
		}
	}
}`;
const WAITING = `local.chrome-time-background.ai = {
	state = not running
	runs = 3
	last exit code = 1
	endpoints = {
		"x" = {
			state = active
		}
	}
}`;

test('parseJobState 读取顶层状态、pid、次数与上次退出码，不被嵌套 state 干扰', () => {
  assert.deepEqual(parseJobState(RUNNING), { loaded: true, state: 'running', pid: 91091, runs: 1, lastExit: '(never exited)' });
  assert.deepEqual(parseJobState(WAITING), { loaded: true, state: 'not running', pid: null, runs: 3, lastExit: '1' });
  assert.deepEqual(parseJobState(''), { loaded: false, state: null, pid: null, runs: null, lastExit: null });
});

test('waitForReady：启动慢于原来的 10 秒窗口也能等到，且就绪后立即返回', async () => {
  const time = clock();
  const job = parseJobState(RUNNING);
  const result = await waitForReady({ probe: async () => time.state.t >= 25000, jobState: () => job, sleep: time.sleep, now: time.now });
  assert.equal(result.ok, true);
  assert.ok(time.state.t >= 25000 && time.state.t < 26000, `实际 ${time.state.t} ms`);
  assert.ok(READY_WAIT_MS >= 30000);
});

test('waitForReady：服务被卸载时立即报告，不干等到期限', async () => {
  const time = clock();
  const result = await waitForReady({ probe: async () => false, jobState: () => parseJobState(''), sleep: time.sleep, now: time.now });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-loaded');
  assert.ok(time.state.t < 2000);
});

test('waitForReady：进程活着但一直不应答时在期限后超时并带出进程状态；探测异常按未就绪处理', async () => {
  const time = clock();
  const result = await waitForReady({ probe: async () => { throw new Error('boom'); }, jobState: () => parseJobState(RUNNING), sleep: time.sleep, now: time.now });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.job.pid, 91091);
  assert.ok(result.waitedMs >= READY_WAIT_MS && result.waitedMs < READY_WAIT_MS + 1000);
});

test('tailLines 只取末尾几行、截断超长行、忽略空白', () => {
  assert.equal(tailLines(''), '');
  assert.equal(tailLines('  \n\n'), '');
  assert.equal(tailLines('a\nb\n\nc\nd\n', 2), 'c\nd');
  const long = tailLines(`${'x'.repeat(500)}\n`, 3, 50);
  assert.equal(long.length, 51);
  assert.ok(long.endsWith('…'));
});

test('readTail 只读文件末尾有限字节，文件不存在或不可读时返回空串', () => {
  const dir = mkdtempSync(join(tmpdir(), 'service-tail-'));
  try {
    const file = join(dir, 'service.log');
    writeFileSync(file, `${'旧内容\n'.repeat(5000)}最后一行\n`);
    const tail = readTail(file, 64);
    assert.ok(Buffer.byteLength(tail) <= 64);
    assert.ok(tail.trimEnd().endsWith('最后一行'));
    assert.equal(readTail(join(dir, 'missing.log')), '');
    writeFileSync(join(dir, 'empty.log'), '');
    assert.equal(readTail(join(dir, 'empty.log')), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('未就绪提示说明进程状态、端口监听与日志，且不再把空的错误日志当作线索', () => {
  const base = { errorLog: '/p/.local/service-error.log', listening: false, logTail: '本地 AI 已启动：http://127.0.0.1:19841', errorTail: '' };
  const slow = describeNotReady({ ...base, outcome: { ok: false, reason: 'timeout', waitedMs: 30500, job: parseJobState(RUNNING) } });
  assert.match(slow, /入口未就绪/);
  assert.match(slow, /30 秒/);
  assert.match(slow, /pid 91091/);
  assert.match(slow, /仍在运行/);
  assert.match(slow, /尚无进程监听/);
  assert.match(slow, /service-error\.log 为空/);
  assert.match(slow, /本地 AI 已启动/);
  assert.match(slow, /service\.sh status/);
  assert.match(slow, /不会自动终止其他占用端口的进程/);

  const listening = describeNotReady({ ...base, listening: true, outcome: { ok: false, reason: 'timeout', waitedMs: 30500, job: parseJobState(RUNNING) } });
  assert.match(listening, /有进程在监听/);

  const crashed = describeNotReady({ ...base, errorTail: 'EADDRINUSE', outcome: { ok: false, reason: 'timeout', waitedMs: 30500, job: parseJobState(WAITING) } });
  assert.match(crashed, /未在运行/);
  assert.match(crashed, /上次退出码：1/);
  assert.match(crashed, /EADDRINUSE/);

  const gone = describeNotReady({ ...base, outcome: { ok: false, reason: 'not-loaded', waitedMs: 800, job: parseJobState('') } });
  assert.match(gone, /已被卸载|未加载/);
});
