#!/usr/bin/env node

/**
 * cursor-bridge Native Messaging Host
 *
 * Chrome 通过 stdin/stdout 与本脚本通信（Native Messaging 协议）。
 * 脚本管理 cursor-bridge 服务进程的启停。
 *
 * 协议：每条消息前 4 字节为消息长度（little-endian uint32），后跟 JSON。
 *
 * 请求格式:
 *   { "action": "start" | "stop" | "status" | "ping" }
 *
 * 响应格式:
 *   { "type": "response", "action": "...", "success": true/false, ... }
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_DIR = resolve(__dirname, '..');
const PID_FILE = resolve(BRIDGE_DIR, '.bridge.pid');
const DEFAULT_PORT = 19840;
const DEFAULT_HOST = '127.0.0.1';

let bridgeProcess = null;

function readMessage() {
  return new Promise((resolve, reject) => {
    const headerBuf = [];
    let headerLen = 0;

    function onReadable() {
      while (headerLen < 4) {
        const chunk = process.stdin.read(4 - headerLen);
        if (!chunk) return;
        headerBuf.push(chunk);
        headerLen += chunk.length;
      }

      const header = Buffer.concat(headerBuf);
      const msgLen = header.readUInt32LE(0);

      if (msgLen === 0 || msgLen > 1024 * 1024) {
        reject(new Error(`Invalid message length: ${msgLen}`));
        return;
      }

      const bodyBuf = [];
      let bodyLen = 0;

      function readBody() {
        while (bodyLen < msgLen) {
          const chunk = process.stdin.read(msgLen - bodyLen);
          if (!chunk) return;
          bodyBuf.push(chunk);
          bodyLen += chunk.length;
        }
        process.stdin.removeListener('readable', readBody);
        const body = Buffer.concat(bodyBuf).toString('utf-8');
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${body}`));
        }
      }

      process.stdin.removeListener('readable', onReadable);
      process.stdin.on('readable', readBody);
      readBody();
    }

    process.stdin.on('readable', onReadable);
  });
}

function sendMessage(msg) {
  const json = JSON.stringify(msg);
  const buf = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  process.stdout.write(header);
  process.stdout.write(buf);
}

function loadConfig() {
  const envPath = resolve(BRIDGE_DIR, '.env');
  const config = { port: DEFAULT_PORT, host: DEFAULT_HOST };
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key === 'BRIDGE_PORT') config.port = parseInt(val, 10);
      if (key === 'BRIDGE_HOST') config.host = val;
    }
  } catch { /* use defaults */ }
  return config;
}

function isPortInUse(port, host) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1000);
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => {
      sock.destroy();
      resolve(false);
    });
    sock.once('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(port, host);
  });
}

async function checkBridgeHealth(port, host) {
  try {
    const resp = await fetch(`http://${host}:${port}/health`);
    if (resp.ok) {
      return await resp.json();
    }
  } catch { /* not reachable */ }
  return null;
}

function readPidFile() {
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(pid)) return pid;
    }
  } catch { /* ignore */ }
  return null;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findNpmPath() {
  const candidates = [
    '/usr/local/bin/npm',
    '/opt/homebrew/bin/npm',
    resolve(process.env.HOME || '', '.nvm/versions/node', process.version, 'bin/npm'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  try {
    return execSync('which npm', { encoding: 'utf-8', timeout: 3000 }).trim();
  } catch { /* not found */ }
  return null;
}

function buildEnvWithPath() {
  const env = { ...process.env };
  const extraPaths = ['/usr/local/bin', '/opt/homebrew/bin'];
  const existing = (env.PATH || '').split(':');
  for (const p of extraPaths) {
    if (!existing.includes(p)) existing.unshift(p);
  }
  env.PATH = existing.join(':');
  return env;
}

async function handleStart() {
  const config = loadConfig();

  const health = await checkBridgeHealth(config.port, config.host);
  if (health && health.status === 'ok') {
    return {
      type: 'response',
      action: 'start',
      success: true,
      alreadyRunning: true,
      pid: readPidFile(),
      port: config.port,
      health,
    };
  }

  const portUsed = await isPortInUse(config.port, config.host);
  if (portUsed) {
    return {
      type: 'response',
      action: 'start',
      success: false,
      error: `Port ${config.port} is already in use by another process`,
    };
  }

  const hasNodeModules = existsSync(resolve(BRIDGE_DIR, 'node_modules'));
  const tsxBin = resolve(BRIDGE_DIR, 'node_modules', '.bin', 'tsx');
  const hasTsx = existsSync(tsxBin);
  const envWithPath = buildEnvWithPath();

  if (!hasNodeModules) {
    const npmPath = findNpmPath();
    if (!npmPath) {
      return {
        type: 'response',
        action: 'start',
        success: false,
        error: 'npm not found. Please install Node.js 20+ and ensure npm is available.',
      };
    }
    try {
      execSync(`"${npmPath}" install`, { cwd: BRIDGE_DIR, stdio: 'ignore', timeout: 60000, env: envWithPath });
    } catch (e) {
      return {
        type: 'response',
        action: 'start',
        success: false,
        error: `Failed to install dependencies: ${e.message}`,
      };
    }
  }

  const entryFile = resolve(BRIDGE_DIR, 'src', 'index.ts');
  let cmd, args;

  if (hasTsx || existsSync(tsxBin)) {
    cmd = tsxBin;
    args = ['watch', entryFile];
  } else {
    const npmPath = findNpmPath();
    if (!npmPath) {
      return {
        type: 'response',
        action: 'start',
        success: false,
        error: 'Neither tsx nor npm found. Run "npm install" in the cursor-bridge directory first.',
      };
    }
    cmd = npmPath;
    args = ['run', 'dev'];
  }

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: BRIDGE_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: envWithPath,
    });

    bridgeProcess = child;

    import('node:fs').then(fs => {
      fs.writeFileSync(PID_FILE, String(child.pid));
    }).catch(() => {});

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        started = true;
        resolve({
          type: 'response',
          action: 'start',
          success: false,
          error: 'Bridge service failed to start within 15 seconds',
          pid: child.pid,
        });
      }
    }, 15000);

    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (!started && stdout.includes('Listening on')) {
        started = true;
        clearTimeout(timeout);
        child.unref();
        resolve({
          type: 'response',
          action: 'start',
          success: true,
          alreadyRunning: false,
          pid: child.pid,
          port: config.port,
        });
      }
    });

    child.on('error', (err) => {
      if (!started) {
        started = true;
        clearTimeout(timeout);
        resolve({
          type: 'response',
          action: 'start',
          success: false,
          error: `Failed to spawn bridge process: ${err.message}`,
        });
      }
    });

    child.on('exit', (code) => {
      if (!started) {
        started = true;
        clearTimeout(timeout);
        resolve({
          type: 'response',
          action: 'start',
          success: false,
          error: `Bridge process exited with code ${code}. Stdout: ${stdout.slice(-500)}`,
        });
      }
      bridgeProcess = null;
    });
  });
}

async function handleStop() {
  const config = loadConfig();
  const pid = readPidFile();

  if (pid && isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
      await new Promise(r => setTimeout(r, 2000));
      if (isProcessRunning(pid)) {
        process.kill(pid, 'SIGKILL');
      }
    } catch { /* already dead */ }
  }

  if (bridgeProcess) {
    try {
      bridgeProcess.kill('SIGTERM');
    } catch { /* ignore */ }
    bridgeProcess = null;
  }

  try {
    const { unlinkSync } = await import('node:fs');
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch { /* ignore */ }

  await new Promise(r => setTimeout(r, 500));
  const health = await checkBridgeHealth(config.port, config.host);

  return {
    type: 'response',
    action: 'stop',
    success: !health,
    stoppedPid: pid,
  };
}

async function handleStatus() {
  const config = loadConfig();
  const pid = readPidFile();
  const running = pid ? isProcessRunning(pid) : false;
  const health = await checkBridgeHealth(config.port, config.host);

  return {
    type: 'response',
    action: 'status',
    success: true,
    running: running || !!health,
    pid: running ? pid : null,
    port: config.port,
    health,
  };
}

async function messageLoop() {
  while (true) {
    try {
      const msg = await readMessage();

      let response;
      switch (msg.action) {
        case 'start':
          response = await handleStart();
          break;
        case 'stop':
          response = await handleStop();
          break;
        case 'status':
          response = await handleStatus();
          break;
        case 'ping':
          response = { type: 'response', action: 'ping', success: true, ts: Date.now() };
          break;
        default:
          response = { type: 'response', action: msg.action, success: false, error: `Unknown action: ${msg.action}` };
      }

      sendMessage(response);
    } catch (err) {
      if (err.message?.includes('Invalid')) {
        sendMessage({ type: 'error', message: err.message });
      } else {
        process.exit(0);
      }
    }
  }
}

messageLoop();
