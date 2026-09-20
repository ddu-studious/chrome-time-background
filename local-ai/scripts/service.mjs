#!/usr/bin/env node
// macOS per-user supervision. Never installs a root daemon or kills an unowned process.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

export const LABEL = 'local.chrome-time-background.ai';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = resolve(ROOT, '.local');
const PLIST = resolve(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const ENV_KEYS = ['LM_STUDIO_URL','LM_STUDIO_TOKEN','LOCAL_AI_MODEL','LOCAL_AI_REASONING','LOCAL_AI_MODEL_ENABLED','LOCAL_AI_DISABLED_SCENES','LOCAL_AI_SPEECH_MODEL'];
export const HELP = `用法：./local-ai/service.sh <命令>（在项目根目录执行）

  start       启动服务；已运行时检查并复用（默认命令）
  restart     重启服务，加载最新代码，保留已有连接和模型配置
  stop        关闭当前服务；下次登录仍自动启动
  shutdown    stop 的别名
  status      查看守护进程、主接口、个人记忆和模型状态
  help        显示帮助（也支持 -h、--help）
  install     安装或更新当前用户的登录启动配置并启动
  uninstall   停止服务并移除登录启动配置，保留数据

在 local-ai 目录中可使用 ./service.sh <命令>，也支持脚本绝对路径。
代码更新后请使用 restart；start 不会自动重启已有进程。
LM Studio 的模型服务需单独开启，本脚本管理扩展的本地 AI 入口。
日志：${resolve(STATE, 'service.log')}
错误日志：${resolve(STATE, 'service-error.log')}`;
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function renderPlist({ node, root, environment = {} }) {
  const env = Object.entries(environment).filter(([key]) => ENV_KEYS.includes(key)).map(([key,value]) => `<key>${escape(key)}</key><string>${escape(value)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array><string>${escape(node)}</string><string>${escape(resolve(root,'server.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${escape(root)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>ProcessType</key><string>Background</string>
<key>EnvironmentVariables</key><dict>${env}</dict>
<key>StandardOutPath</key><string>${escape(resolve(root,'.local/service.log'))}</string>
<key>StandardErrorPath</key><string>${escape(resolve(root,'.local/service-error.log'))}</string>
</dict></plist>\n`;
}
function launch(...args) { return spawnSync('/bin/launchctl', args, { encoding:'utf8' }); }
const scope = () => `gui/${process.getuid()}`;
const target = () => `${scope()}/${LABEL}`;
function loaded() { return launch('print', target()).status === 0; }
function checked(result, operation) { if (result.status !== 0) throw new Error(`${operation}失败：${result.stderr?.trim() || result.error?.message || result.status}`); }
function occupied() {
  return new Promise(resolveResult => {
    const socket = net.connect({host:'127.0.0.1',port:19841});
    const finish = value => { socket.destroy(); resolveResult(value); };
    socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(false));
  });
}
async function health() {
  try {
    const token = readFileSync(resolve(STATE,'token'),'utf8').trim();
    const response = await fetch('http://127.0.0.1:19841/v1/control', { headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(1500) });
    const data = await response.json();
    return response.ok && data.ok === true && data.localOnly === true;
  } catch { return false; }
}
export async function memoryHealth(request = fetch, token = readFileSync(resolve(STATE, 'token'), 'utf8').trim()) {
  try {
    const response = await request('http://127.0.0.1:19841/v1/memory', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500) });
    const data = await response.json();
    if (response.status === 404) return { ok: false, message: '记忆接口不存在，运行服务版本过旧，请执行 service.sh restart' };
    if (!response.ok || data.ok !== true || !Number.isSafeInteger(data.revision)) return { ok: false, message: data.error || '记忆接口返回异常' };
    return { ok: true, message: '已就绪' };
  } catch { return { ok: false, message: '无法读取个人记忆，请检查本地服务和错误日志' }; }
}
async function reportMemory() {
  // A memory failure must not conceal that the other AI routes are available.
  let result;
  try { result = await memoryHealth(); }
  catch { result = { ok: false, message: '尚无连接令牌，请先启动服务' }; }
  console.log(`个人记忆：${result.message}`);
}
async function ready() {
  for (let attempt=0;attempt<20;attempt++) {
    if(await health()) return;
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error(`入口未就绪，请查看 ${resolve(STATE,'service-error.log')}；不会自动终止其他占用端口的进程。`);
}
async function status() {
  console.log(`自动守护：${loaded() ? '已加载' : '未加载'}；登录启动配置：${existsSync(PLIST) ? '已安装' : '未安装'}`);
  console.log(`扩展本地入口 19841：${await health() ? '已就绪' : '未就绪'}`);
  await reportMemory();
  try {
    const token = readFileSync(resolve(STATE,'token'),'utf8').trim();
    const r = await fetch('http://127.0.0.1:19841/health',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(6500)});
    const d=await r.json(); console.log(d.ok ? `模型服务：可连接；模型状态：${d.state}` : `模型服务：${d.error || '未就绪'}`);
  } catch { console.log('模型状态暂不可确认；LM Studio 的模型服务需单独开启。'); }
}
async function install(force = false) {
  try { import.meta.resolve('@earendil-works/pi-coding-agent'); } catch { throw new Error('缺少 pi SDK，请先在 local-ai 目录执行 npm ci，再启动服务'); }
  if (process.env.LOCAL_AI_PORT && process.env.LOCAL_AI_PORT !== '19841') throw new Error('自动启动固定使用扩展连接的19841端口，请取消LOCAL_AI_PORT覆盖');
  if (loaded() && !force) { await ready(); console.log('本地 AI 已运行，复用现有进程。'); await reportMemory(); return; }
  if (!loaded() && await occupied()) throw new Error('19841已被手动服务或其他进程占用。请先停止该进程，再运行本脚本；不会重复启动或自动杀进程。');
  let previous = {};
  if (existsSync(PLIST)) {
    const result = spawnSync('/usr/bin/plutil',['-convert','json','-o','-',PLIST],{encoding:'utf8'});
    checked(result,'读取已有配置'); const parsed=JSON.parse(result.stdout);
    if(parsed.Label !== LABEL) throw new Error('同名启动文件不属于本服务，停止覆盖');
    previous=parsed.EnvironmentVariables || {};
  }
  const environment = Object.fromEntries(ENV_KEYS.filter(key => process.env[key] !== undefined || previous[key] !== undefined).map(key => [key,process.env[key] ?? previous[key]]));
  mkdirSync(STATE,{recursive:true,mode:0o700}); mkdirSync(dirname(PLIST),{recursive:true});
  for(const name of ['service.log','service-error.log']) { const path=resolve(STATE,name);if(!existsSync(path))writeFileSync(path,'',{mode:0o600});chmodSync(path,0o600); }
  const temporary = `${PLIST}.${process.pid}.tmp`;
  writeFileSync(temporary,renderPlist({node:process.execPath,root:ROOT,environment}),{mode:0o600});
  const validation=spawnSync('/usr/bin/plutil',['-lint',temporary],{encoding:'utf8'});
  if(validation.status !== 0) { unlinkSync(temporary); throw new Error('启动配置校验失败'); }
  if(loaded()) checked(launch('bootout',target()),'停止旧守护服务');
  renameSync(temporary,PLIST);
  checked(launch('enable',target()),'启用用户服务');
  checked(launch('bootstrap',scope(),PLIST),'加载用户服务');
  await ready();
  console.log('本地 AI 已启动；已启用登录自动启动、退出后自动恢复。可以关闭终端。');
  await reportMemory();
}
export async function main(command = 'start', ...extra) {
  if (extra.length) throw new Error('每次只接受一个命令；运行 service.sh help 查看用法');
  if (['help', '-h', '--help'].includes(command)) { console.log(HELP); return; }
  if (!['start', 'restart', 'stop', 'shutdown', 'status', 'install', 'uninstall'].includes(command)) throw new Error(`未知命令：${command}；运行 service.sh help 查看用法`);
  if(process.platform !== 'darwin') throw new Error('自动守护脚本适用于macOS；其他系统请在local-ai目录运行npm start');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if(major < 22 || (major === 22 && minor < 19)) throw new Error('需要Node.js 22.19或更高版本（pi SDK 与本机 SQLite）');
  if(command === 'start') return install();
  if(command === 'install' || command === 'restart') return install(true);
  if(command === 'status') return status();
  if(command === 'stop' || command === 'shutdown' || command === 'uninstall') {
    if(loaded()) checked(launch('bootout',target()),'停止用户服务');
    if(command === 'uninstall' && existsSync(PLIST)) unlinkSync(PLIST);
    console.log(command === 'uninstall' ? '已移除自动启动；令牌、业务配置和日志均保留。' : '已停止本次运行；下次登录仍会启动，永久关闭请用uninstall。');return;
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main(...process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
