#!/usr/bin/env node
// On-demand model inventory and Laya launchd lifecycle. No login auto-start.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = resolve(ROOT, '.local/laya-runtime');
const REGISTRY = JSON.parse(readFileSync(resolve(ROOT, 'model-registry.json'), 'utf8'));
const LMS_MODELS = REGISTRY.storageRoot.startsWith('~/')
  ? resolve(homedir(), REGISTRY.storageRoot.slice(2)) : resolve(REGISTRY.storageRoot);
const PYTHON = resolve(STATE, '.venv/bin/python');
const SCRIPT = resolve(ROOT, 'laya-runtime/serve.py');
const VERIFY = resolve(ROOT, 'laya-runtime/model_store.py');
const DOWNLOAD = resolve(ROOT, 'laya-runtime/download.py');
const LABEL = 'local.chrome-time-background.laya';
const PLIST = resolve(STATE, 'laya.plist');
const TOKEN = resolve(STATE, 'token');
const URL = 'http://127.0.0.1:19085';
const scope = () => `gui/${process.getuid()}`;
const target = () => `${scope()}/${LABEL}`;
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const launch = (...args) => spawnSync('/bin/launchctl', args, { encoding: 'utf8' });
const loaded = () => launch('print', target()).status === 0;
function checked(result, operation) {
  if (result.status !== 0) throw new Error(`${operation}失败：${result.stderr?.trim() || result.error?.message || result.status}`);
}
function command(executable, args, env = {}) {
  const result = spawnSync(executable, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`命令失败（${result.status}）：${executable}`);
}
function bytes(path) {
  if (!existsSync(path)) return 0;
  const info = statSync(path);
  if (!info.isDirectory()) return info.size;
  return readdirSync(path, { withFileTypes: true }).reduce((total, item) =>
    total + (item.isSymbolicLink() ? 0 : bytes(join(path, item.name))), 0);
}
function inventory() {
  console.log(`模型存储总目录：${LMS_MODELS}`);
  const known = new Set();
  for (const entry of REGISTRY.entries) {
    known.add(entry.directory);
    const path = resolve(LMS_MODELS, entry.directory);
    const amount = existsSync(path) ? `${(bytes(path) / 1024 ** 3).toFixed(2)} GiB` : '未下载';
    console.log(`${entry.id.padEnd(21)} ${amount.padStart(10)}  ${entry.runtime.padEnd(12)} ${path}`);
  }
  if (existsSync(LMS_MODELS)) for (const publisher of readdirSync(LMS_MODELS, { withFileTypes: true })) {
    if (!publisher.isDirectory()) continue;
    const folder = join(LMS_MODELS, publisher.name);
    for (const model of readdirSync(folder, { withFileTypes: true })) {
      const relative = `${publisher.name}/${model.name}`;
      if (model.isDirectory() && !known.has(relative)) console.log(`未登记：${relative}（${(bytes(join(folder, model.name)) / 1024 ** 3).toFixed(2)} GiB）`);
    }
  }
}
function occupied() {
  return new Promise(resolveResult => {
    const socket = net.connect({ host: '127.0.0.1', port: 19085 });
    const finish = value => { socket.destroy(); resolveResult(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}
async function health() {
  try {
    const response = await fetch(`${URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    const data = await response.json();
    return data.status === 'ok' && data.loaded?.includes('multilingual') ? data : null;
  } catch { return null; }
}
function ensureState() {
  mkdirSync(STATE, { recursive: true, mode: 0o700 });
  if (!existsSync(TOKEN)) writeFileSync(TOKEN, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  chmodSync(TOKEN, 0o600);
  for (const name of ['laya.log', 'laya-error.log']) {
    const path = resolve(STATE, name);
    if (!existsSync(path)) writeFileSync(path, '', { mode: 0o600, flag: 'wx' });
    chmodSync(path, 0o600);
  }
}
function renderPlist() {
  const device = process.env.LAYA_DEVICE || 'cpu';
  if (!['cpu', 'mps'].includes(device)) throw new Error('Laya 设备只支持 cpu 或 mps');
  const vars = {
    LAYA_DEVICE: device, LAYA_API_KEY: readFileSync(TOKEN, 'utf8').trim(),
    HF_HOME: resolve(ROOT, '.local/model-cache/huggingface'), HF_HUB_OFFLINE: '1',
  };
  const env = Object.entries(vars).map(([key, value]) => `<key>${xml(key)}</key><string>${xml(value)}</string>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>${xml(PYTHON)}</string><string>${xml(SCRIPT)}</string></array>
<key>WorkingDirectory</key><string>${xml(resolve(ROOT, 'laya-runtime'))}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><false/>
<key>ProcessType</key><string>Background</string>
<key>EnvironmentVariables</key><dict>${env}</dict>
<key>StandardOutPath</key><string>${xml(resolve(STATE, 'laya.log'))}</string>
<key>StandardErrorPath</key><string>${xml(resolve(STATE, 'laya-error.log'))}</string>
</dict></plist>\n`;
}
async function start(restart = false) {
  if (!existsSync(PYTHON)) throw new Error('缺少 Laya Python 环境；先按管理文档执行 uv sync --locked');
  if (loaded()) {
    if (!restart && await health()) { console.log('Laya 已运行，复用现有服务。'); return; }
    if (!restart) throw new Error('Laya 守护项已加载但服务未就绪；检查日志后运行 restart');
    checked(launch('bootout', target()), '停止旧 Laya 服务');
  } else if (await occupied()) throw new Error('19085 端口由其他进程占用；不会终止它');
  ensureState();
  command(PYTHON, [VERIFY]);
  writeFileSync(PLIST, renderPlist(), { mode: 0o600 });
  checked(spawnSync('/usr/bin/plutil', ['-lint', PLIST], { encoding: 'utf8' }), '校验 Laya 启动配置');
  checked(launch('bootstrap', scope(), PLIST), '启动 Laya 守护项');
  for (let i = 0; i < 70; i++) {
    if (await health()) { console.log(`Laya 已就绪：${URL}；仅本次登录按需运行，无登录自启。`); return; }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`Laya 未就绪；请查看 ${resolve(STATE, 'laya-error.log')}`);
}
async function main() {
  const [commandName = 'help', model, option] = process.argv.slice(2);
  if (commandName === 'list' && model == null) return inventory();
  if (commandName === 'help' || commandName === '-h' || commandName === '--help') {
    console.log(`用法：./local-ai/models.sh list | laya <verify|download|start|restart|status|test|stop|logs>\n\n` +
      `Laya 权重：${resolve(LMS_MODELS, 'convaiinnovations/laya/multilingual')}\n` +
      `Laya 日志：${resolve(STATE, 'laya.log')} 和 laya-error.log\n` +
      `download 默认访问官方 Hugging Face；明确传 --mirror 才使用 hf-mirror.com。`);
    return;
  }
  if (commandName !== 'laya' || !model || (option && !(model === 'download' && option === '--mirror'))) throw new Error('未知模型或命令；运行 models.sh help');
  if (model === 'verify') { if (!existsSync(PYTHON)) throw new Error('缺少 Laya Python 环境'); return command(PYTHON, [VERIFY]); }
  if (model === 'download') {
    if (!existsSync(PYTHON)) throw new Error('缺少 Laya Python 环境');
    const mirror = option === '--mirror';
    return command(PYTHON, [DOWNLOAD], {
      HF_HOME: resolve(ROOT, '.local/model-cache/huggingface'),
      HF_HUB_DISABLE_TELEMETRY: '1',
      HF_ENDPOINT: mirror ? 'https://hf-mirror.com' : 'https://huggingface.co',
      ...(mirror ? { HF_HUB_DISABLE_XET: '1' } : {}),
    });
  }
  if (model === 'start') return start();
  if (model === 'restart') return start(true);
  if (model === 'status') {
    const state = await health();
    return console.log(`Laya 守护项：${loaded() ? '已加载' : '未加载'}；接口：${state ? '已就绪' : '未就绪'}；设备：${state?.device || '未知'}；${URL}`);
  }
  if (model === 'test') {
    if (!await health()) throw new Error('Laya 尚未就绪');
    const token = readFileSync(TOKEN, 'utf8').trim();
    const response = await fetch(`${URL}/v1/systemone`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: 'multilingual', state: { text: '把开会提醒延后十分钟' },
        questions: { intent: { type: 'choice', instructions: '用户想怎样处理已有提醒？',
          criteria: { create: '新建一条提醒', update: '修改已有提醒的时间', disable: '关闭已有提醒', other: '其他或信息不足' } } } }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    const choice = data.answers?.intent?.choice;
    if (!response.ok || data.routing?.model !== 'multilingual' || !['create', 'update', 'disable', 'other'].includes(choice)) throw new Error(`Laya 测试请求无效（HTTP ${response.status}）`);
    console.log(`真实本机判断：${choice}；confidence=${data.answers.intent.confidence}；检查点=${data.routing.model}。仅测试数据，未执行提醒操作。`);
    return;
  }
  if (model === 'stop') {
    if (loaded()) checked(launch('bootout', target()), '停止 Laya 服务');
    console.log('Laya 已停止；权重、环境、令牌与日志均保留。'); return;
  }
  if (model === 'logs') {
    for (const name of ['laya.log', 'laya-error.log']) {
      const path = resolve(STATE, name);
      console.log(`${name}:\n${existsSync(path) ? readFileSync(path, 'utf8').split('\n').slice(-40).join('\n') : '暂无日志'}`);
    }
    return;
  }
  throw new Error('未知 Laya 命令；运行 models.sh help');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
