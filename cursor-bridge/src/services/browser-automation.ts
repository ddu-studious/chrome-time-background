/**
 * Phase 6.2 — Browser Automation Service
 *
 * Connects to a running Chrome instance via CDP (Chrome DevTools Protocol),
 * executes page actions (navigate, click, type, screenshot, evaluate JS),
 * and returns structured results for Agent consumption.
 *
 * Uses CDP HTTP endpoints + WebSocket for command execution.
 * Requires Chrome launched with --remote-debugging-port (default 9222).
 */

import { createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';

interface CDPTarget {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
}

interface BrowserAction {
  action: 'navigate' | 'click' | 'type' | 'screenshot' | 'evaluate' | 'waitFor' | 'getContent' | 'getTabs';
  target?: string;
  params?: Record<string, any>;
}

interface BrowserResult {
  success: boolean;
  action: string;
  data?: any;
  error?: string;
  durationMs: number;
}

const DEFAULT_CDP_PORT = 9222;

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDP request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function getCDPTargets(port: number = DEFAULT_CDP_PORT): Promise<CDPTarget[]> {
  return fetchJSON(`http://127.0.0.1:${port}/json`);
}

async function getCDPVersion(port: number = DEFAULT_CDP_PORT): Promise<any> {
  return fetchJSON(`http://127.0.0.1:${port}/json/version`);
}

function createWsFrame(msg: string): Buffer {
  const msgBuf = Buffer.from(msg, 'utf-8');
  const mask = randomBytes(4);
  let header: Buffer;
  if (msgBuf.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | msgBuf.length;
  } else if (msgBuf.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(msgBuf.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(msgBuf.length), 2);
  }
  const masked = Buffer.alloc(msgBuf.length);
  for (let i = 0; i < msgBuf.length; i++) {
    masked[i] = msgBuf[i] ^ mask[i % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

async function sendCDPCommand(
  wsUrl: string,
  method: string,
  params: Record<string, any> = {},
  timeoutMs: number = 15000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Date.now();
    const url = new URL(wsUrl);
    const key = randomBytes(16).toString('base64');

    const socket = createConnection(
      { host: url.hostname, port: Number(url.port) || 80 },
      () => {
        socket.write(
          `GET ${url.pathname} HTTP/1.1\r\n` +
          `Host: ${url.host}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`
        );
      }
    );

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`CDP command timeout: ${method}`));
    }, timeoutMs);

    let upgraded = false;

    socket.on('data', (chunk: Buffer) => {
      if (!upgraded) {
        const str = chunk.toString();
        if (str.includes('\r\n\r\n')) {
          upgraded = true;
          const msg = JSON.stringify({ id, method, params });
          socket.write(createWsFrame(msg));
        }
        return;
      }
      handleWsData(chunk);
    });

    function handleWsData(data: Buffer) {
      if (data.length < 2) return;
      const secondByte = data[1] & 0x7f;
      let payloadStart = 2;
      if (secondByte === 126) payloadStart = 4;
      else if (secondByte === 127) payloadStart = 10;

      const payload = data.slice(payloadStart).toString('utf-8');
      try {
        const parsed = JSON.parse(payload);
        if (parsed.id === id) {
          clearTimeout(timer);
          socket.destroy();
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'CDP error'));
          } else {
            resolve(parsed.result);
          }
        }
      } catch {
        // partial frame
      }
    }

    socket.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`CDP connection error: ${err.message}`));
    });
  });
}

export async function checkBrowserConnection(port: number = DEFAULT_CDP_PORT): Promise<{
  connected: boolean;
  browser?: string;
  targets?: number;
  error?: string;
}> {
  try {
    const version = await getCDPVersion(port);
    const targets = await getCDPTargets(port);
    const pages = targets.filter(t => t.type === 'page');
    return {
      connected: true,
      browser: version['Browser'] || version.browser,
      targets: pages.length,
    };
  } catch (err: any) {
    return {
      connected: false,
      error: `Cannot connect to Chrome CDP on port ${port}. Launch Chrome with --remote-debugging-port=${port}`,
    };
  }
}

export async function executeAction(action: BrowserAction, cdpPort: number = DEFAULT_CDP_PORT): Promise<BrowserResult> {
  const start = Date.now();
  try {
    const result = await doAction(action, cdpPort);
    return {
      success: true,
      action: action.action,
      data: result,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      action: action.action,
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

async function doAction(action: BrowserAction, port: number): Promise<any> {
  switch (action.action) {
    case 'getTabs': {
      const targets = await getCDPTargets(port);
      return targets.filter(t => t.type === 'page').map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
      }));
    }

    case 'navigate': {
      const url = action.target;
      if (!url) throw new Error('target URL is required for navigate');
      const ws = await getPageWs(port, action.params?.tabId);
      await sendCDPCommand(ws, 'Page.enable');
      await sendCDPCommand(ws, 'Page.navigate', { url });
      await sleep(action.params?.waitMs || 1000);
      return { navigated: url };
    }

    case 'click': {
      const selector = action.target;
      if (!selector) throw new Error('target selector is required for click');
      const ws = await getPageWs(port, action.params?.tabId);
      const nodeResult = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: 'Element not found: ${selector}' };
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`,
        returnByValue: true,
      });
      const loc = nodeResult?.result?.value;
      if (!loc || loc.error) throw new Error(loc?.error || 'Failed to locate element');
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x: loc.x, y: loc.y, button: 'left', clickCount: 1,
      });
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: loc.x, y: loc.y, button: 'left', clickCount: 1,
      });
      return { clicked: selector, position: loc };
    }

    case 'type': {
      const text = action.target;
      if (!text) throw new Error('target text is required for type');
      const ws = await getPageWs(port, action.params?.tabId);
      if (action.params?.selector) {
        await sendCDPCommand(ws, 'Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(action.params.selector)})?.focus()`,
        });
        await sleep(100);
      }
      for (const char of text) {
        await sendCDPCommand(ws, 'Input.dispatchKeyEvent', {
          type: 'keyDown', text: char, key: char,
        });
        await sendCDPCommand(ws, 'Input.dispatchKeyEvent', {
          type: 'keyUp', key: char,
        });
      }
      return { typed: text.length + ' chars' };
    }

    case 'screenshot': {
      const ws = await getPageWs(port, action.params?.tabId);
      const result = await sendCDPCommand(ws, 'Page.captureScreenshot', {
        format: action.params?.format || 'png',
        quality: action.params?.quality || 80,
      });
      return {
        format: action.params?.format || 'png',
        dataLength: result?.data?.length || 0,
        base64: result?.data?.substring(0, 200) + '...(truncated)',
      };
    }

    case 'evaluate': {
      const expression = action.target;
      if (!expression) throw new Error('target expression is required for evaluate');
      const ws = await getPageWs(port, action.params?.tabId);
      const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result?.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'JS evaluation error');
      }
      return { value: result?.result?.value };
    }

    case 'waitFor': {
      const selector = action.target;
      if (!selector) throw new Error('target selector is required for waitFor');
      const ws = await getPageWs(port, action.params?.tabId);
      const timeout = action.params?.timeout || 5000;
      const interval = 300;
      const maxAttempts = Math.ceil(timeout / interval);
      for (let i = 0; i < maxAttempts; i++) {
        const r = await sendCDPCommand(ws, 'Runtime.evaluate', {
          expression: `!!document.querySelector(${JSON.stringify(selector)})`,
          returnByValue: true,
        });
        if (r?.result?.value === true) {
          return { found: true, selector, attempts: i + 1 };
        }
        await sleep(interval);
      }
      throw new Error(`Timeout waiting for: ${selector}`);
    }

    case 'getContent': {
      const ws = await getPageWs(port, action.params?.tabId);
      const selector = action.target || 'body';
      const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          return {
            text: el.innerText?.substring(0, 10000),
            html: el.innerHTML?.substring(0, 10000),
            tag: el.tagName,
          };
        })()`,
        returnByValue: true,
      });
      return result?.result?.value || null;
    }

    default:
      throw new Error(`Unknown action: ${action.action}`);
  }
}

async function getPageWs(port: number, tabId?: string): Promise<string> {
  const targets = await getCDPTargets(port);
  const pages = targets.filter(t => t.type === 'page');
  if (pages.length === 0) throw new Error('No browser tabs found');

  const target = tabId ? pages.find(p => p.id === tabId) : pages[0];
  if (!target) throw new Error(`Tab not found: ${tabId || 'default'}`);
  if (!target.webSocketDebuggerUrl) throw new Error('No WebSocket debugger URL for target');
  return target.webSocketDebuggerUrl;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
