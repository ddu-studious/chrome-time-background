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

interface TextDomNode {
  index: number;
  tag: string;
  text: string;
  attrs: string[];
  interactable: boolean;
  rect: { x: number; y: number; width: number; height: number };
}

interface AssertResult {
  passed: boolean;
  actual?: any;
  expected?: any;
  message: string;
}

type ActionType =
  | 'navigate' | 'click' | 'type' | 'screenshot' | 'evaluate'
  | 'waitFor' | 'getContent' | 'getTabs'
  | 'extractDom' | 'clickByIndex' | 'hover' | 'selectOption' | 'fillForm'
  | 'scrollTo' | 'waitForNetworkIdle'
  | 'doubleClick' | 'rightClick' | 'drag'
  | 'assertVisible' | 'assertText' | 'assertUrl' | 'assertElementCount';

interface BrowserAction {
  action: ActionType;
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

    case 'extractDom': {
      const ws = await getPageWs(port, action.params?.tabId);
      const filter = action.params?.filter || 'interactive';
      const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const selectors = ${JSON.stringify(filter)} === 'all'
            ? '*'
            : 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], [tabindex]';
          const nodes = [];
          let idx = 0;
          document.querySelectorAll(selectors).forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || '').trim().slice(0, 80);
            const attrs = [];
            if (el.getAttribute('placeholder')) attrs.push('placeholder=' + el.getAttribute('placeholder'));
            if (el.getAttribute('aria-label')) attrs.push('aria-label=' + el.getAttribute('aria-label'));
            if (el.getAttribute('type')) attrs.push('type=' + el.getAttribute('type'));
            if (el.getAttribute('name')) attrs.push('name=' + el.getAttribute('name'));
            if (el.getAttribute('value')) attrs.push('value=' + el.getAttribute('value').slice(0, 40));
            if (el.getAttribute('href')) attrs.push('href=' + el.getAttribute('href').slice(0, 60));
            if (el.getAttribute('role')) attrs.push('role=' + el.getAttribute('role'));
            if (el.disabled) attrs.push('disabled');
            nodes.push({
              index: idx++,
              tag,
              text: text || '',
              attrs,
              interactable: !el.disabled,
              rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            });
          });
          return nodes;
        })()`,
        returnByValue: true,
      });
      const nodes: TextDomNode[] = result?.result?.value || [];
      const textRepr = nodes.map(n => {
        const attrStr = n.attrs.length ? ` ${n.attrs.join(' ')}` : '';
        const textStr = n.text ? ` "${n.text}"` : '';
        return `[${n.index}] <${n.tag}${attrStr}>${textStr}`;
      }).join('\n');
      return { nodes, text: textRepr, count: nodes.length };
    }

    case 'clickByIndex': {
      const index = Number(action.target);
      if (isNaN(index)) throw new Error('target must be a numeric index for clickByIndex');
      const ws = await getPageWs(port, action.params?.tabId);
      const locResult = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const els = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], [tabindex]');
          const visible = [];
          els.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
            visible.push(el);
          });
          const target = visible[${index}];
          if (!target) return { error: 'Index out of range: ${index}, total: ' + visible.length };
          const rect = target.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, tag: target.tagName };
        })()`,
        returnByValue: true,
      });
      const loc = locResult?.result?.value;
      if (!loc || loc.error) throw new Error(loc?.error || 'Failed to locate element by index');
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', {
        type: 'mousePressed', x: loc.x, y: loc.y, button: 'left', clickCount: 1,
      });
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: loc.x, y: loc.y, button: 'left', clickCount: 1,
      });
      return { clicked: `index[${index}]`, tag: loc.tag, position: { x: loc.x, y: loc.y } };
    }

    case 'hover': {
      const selector = action.target;
      if (!selector) throw new Error('target selector is required for hover');
      const ws = await getPageWs(port, action.params?.tabId);
      const locResult = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: 'Element not found: ${selector}' };
          const rect = el.getBoundingClientRect();
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`,
        returnByValue: true,
      });
      const loc = locResult?.result?.value;
      if (!loc || loc.error) throw new Error(loc?.error || 'Failed to locate element');
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: loc.x, y: loc.y,
      });
      const holdMs = action.params?.holdMs || 300;
      await sleep(holdMs);
      return { hovered: selector, position: loc, holdMs };
    }

    case 'doubleClick': {
      const selector = action.target;
      if (!selector) throw new Error('target selector is required for doubleClick');
      const ws = await getPageWs(port, action.params?.tabId);
      const locResult = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: 'Element not found: ${selector}' };
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`,
        returnByValue: true,
      });
      const loc = locResult?.result?.value;
      if (!loc || loc.error) throw new Error(loc?.error || 'Failed to locate element');
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: loc.x, y: loc.y, button: 'left', clickCount: 1 });
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: loc.x, y: loc.y, button: 'left', clickCount: 1 });
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: loc.x, y: loc.y, button: 'left', clickCount: 2 });
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: loc.x, y: loc.y, button: 'left', clickCount: 2 });
      return { doubleClicked: selector, position: loc };
    }

    case 'rightClick': {
      const selector = action.target;
      if (!selector) throw new Error('target selector is required for rightClick');
      const ws = await getPageWs(port, action.params?.tabId);
      const locResult = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { error: 'Element not found: ${selector}' };
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`,
        returnByValue: true,
      });
      const loc = locResult?.result?.value;
      if (!loc || loc.error) throw new Error(loc?.error || 'Failed to locate element');
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: loc.x, y: loc.y, button: 'right', clickCount: 1 });
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: loc.x, y: loc.y, button: 'right', clickCount: 1 });
      return { rightClicked: selector, position: loc };
    }

    case 'drag': {
      const fromSelector = action.target;
      const toSelector = action.params?.to;
      if (!fromSelector) throw new Error('target (from selector) is required for drag');
      if (!toSelector) throw new Error('params.to (target selector) is required for drag');
      const ws = await getPageWs(port, action.params?.tabId);
      const coordsResult = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const from = document.querySelector(${JSON.stringify(fromSelector)});
          const to = document.querySelector(${JSON.stringify(toSelector)});
          if (!from) return { error: 'From element not found' };
          if (!to) return { error: 'To element not found' };
          const fr = from.getBoundingClientRect();
          const tr = to.getBoundingClientRect();
          return {
            fx: fr.x + fr.width / 2, fy: fr.y + fr.height / 2,
            tx: tr.x + tr.width / 2, ty: tr.y + tr.height / 2,
          };
        })()`,
        returnByValue: true,
      });
      const coords = coordsResult?.result?.value;
      if (!coords || coords.error) throw new Error(coords?.error || 'Failed to locate drag elements');
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: coords.fx, y: coords.fy });
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.fx, y: coords.fy, button: 'left', clickCount: 1 });
      const steps = action.params?.steps || 10;
      for (let i = 1; i <= steps; i++) {
        const x = coords.fx + (coords.tx - coords.fx) * (i / steps);
        const y = coords.fy + (coords.ty - coords.fy) * (i / steps);
        await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await sleep(16);
      }
      await sendCDPCommand(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.tx, y: coords.ty, button: 'left', clickCount: 1 });
      return { dragged: { from: fromSelector, to: toSelector }, steps };
    }

    case 'selectOption': {
      const selector = action.target;
      const value = action.params?.value;
      if (!selector) throw new Error('target selector is required for selectOption');
      if (value === undefined) throw new Error('params.value is required for selectOption');
      const ws = await getPageWs(port, action.params?.tabId);
      const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el || el.tagName !== 'SELECT') return { error: 'SELECT element not found' };
          el.value = ${JSON.stringify(value)};
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { selected: el.value, options: el.options.length };
        })()`,
        returnByValue: true,
      });
      return result?.result?.value || { error: 'selectOption failed' };
    }

    case 'fillForm': {
      const fields: Array<{ selector: string; value: string; type?: string }> = action.params?.fields || [];
      if (fields.length === 0) throw new Error('params.fields array is required for fillForm');
      const ws = await getPageWs(port, action.params?.tabId);
      const results: any[] = [];
      for (const field of fields) {
        if (field.type === 'select') {
          const r = await sendCDPCommand(ws, 'Runtime.evaluate', {
            expression: `(() => {
              const el = document.querySelector(${JSON.stringify(field.selector)});
              if (!el) return { error: 'not found' };
              el.value = ${JSON.stringify(field.value)};
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return { ok: true };
            })()`,
            returnByValue: true,
          });
          results.push({ selector: field.selector, ...r?.result?.value });
        } else {
          await sendCDPCommand(ws, 'Runtime.evaluate', {
            expression: `(() => {
              const el = document.querySelector(${JSON.stringify(field.selector)});
              if (el) { el.focus(); el.value = ''; el.value = ${JSON.stringify(field.value)}; el.dispatchEvent(new Event('input', { bubbles: true })); }
              return !!el;
            })()`,
            returnByValue: true,
          });
          results.push({ selector: field.selector, ok: true });
        }
      }
      return { filledFields: results.length, results };
    }

    case 'scrollTo': {
      const selector = action.target;
      const ws = await getPageWs(port, action.params?.tabId);
      if (selector) {
        await sendCDPCommand(ws, 'Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ behavior: 'smooth', block: 'center' })`,
        });
      } else {
        const y = action.params?.y || 0;
        await sendCDPCommand(ws, 'Runtime.evaluate', {
          expression: `window.scrollTo({ top: ${y}, behavior: 'smooth' })`,
        });
      }
      await sleep(300);
      return { scrolledTo: selector || `y=${action.params?.y || 0}` };
    }

    case 'waitForNetworkIdle': {
      const ws = await getPageWs(port, action.params?.tabId);
      const timeout = action.params?.timeout || 5000;
      const idleTime = action.params?.idleTime || 500;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
          expression: `performance.getEntriesByType('resource').filter(e => e.responseEnd === 0).length`,
          returnByValue: true,
        });
        if (result?.result?.value === 0) {
          await sleep(idleTime);
          const recheck = await sendCDPCommand(ws, 'Runtime.evaluate', {
            expression: `performance.getEntriesByType('resource').filter(e => e.responseEnd === 0).length`,
            returnByValue: true,
          });
          if (recheck?.result?.value === 0) return { idle: true, elapsed: Date.now() - start };
        }
        await sleep(200);
      }
      return { idle: false, elapsed: Date.now() - start, message: 'Timeout reached' };
    }

    case 'assertVisible': {
      const selector = action.target;
      if (!selector) throw new Error('target selector is required for assertVisible');
      const ws = await getPageWs(port, action.params?.tabId);
      const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { visible: false };
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
          };
        })()`,
        returnByValue: true,
      });
      const visible = result?.result?.value?.visible || false;
      const r: AssertResult = { passed: visible, actual: visible, expected: true, message: visible ? `${selector} is visible` : `${selector} is NOT visible` };
      return r;
    }

    case 'assertText': {
      const selector = action.target;
      const expected = action.params?.expected;
      if (!selector) throw new Error('target selector is required for assertText');
      if (expected === undefined) throw new Error('params.expected is required for assertText');
      const ws = await getPageWs(port, action.params?.tabId);
      const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() || null`,
        returnByValue: true,
      });
      const actual = result?.result?.value;
      const passed = actual !== null && actual.includes(expected);
      const r: AssertResult = { passed, actual, expected, message: passed ? 'Text matches' : `Expected "${expected}" but got "${actual}"` };
      return r;
    }

    case 'assertUrl': {
      const pattern = action.target;
      if (!pattern) throw new Error('target URL pattern is required for assertUrl');
      const ws = await getPageWs(port, action.params?.tabId);
      const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `location.href`,
        returnByValue: true,
      });
      const actual = result?.result?.value || '';
      const passed = actual.includes(pattern) || new RegExp(pattern).test(actual);
      const r: AssertResult = { passed, actual, expected: pattern, message: passed ? 'URL matches' : `URL "${actual}" does not match "${pattern}"` };
      return r;
    }

    case 'assertElementCount': {
      const selector = action.target;
      const expected = Number(action.params?.count);
      if (!selector) throw new Error('target selector is required for assertElementCount');
      if (isNaN(expected)) throw new Error('params.count is required for assertElementCount');
      const ws = await getPageWs(port, action.params?.tabId);
      const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
        expression: `document.querySelectorAll(${JSON.stringify(selector)}).length`,
        returnByValue: true,
      });
      const actual = result?.result?.value || 0;
      const passed = actual === expected;
      const r: AssertResult = { passed, actual, expected, message: passed ? `Found ${actual} elements` : `Expected ${expected} but found ${actual}` };
      return r;
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

export async function extractTextDom(
  cdpPort: number = DEFAULT_CDP_PORT,
  tabId?: string,
  filter: 'interactive' | 'all' = 'interactive',
): Promise<{ nodes: TextDomNode[]; text: string; count: number }> {
  const result = await executeAction({
    action: 'extractDom',
    params: { tabId, filter },
  }, cdpPort);
  if (!result.success) throw new Error(result.error || 'extractDom failed');
  return result.data;
}

export async function runAssertions(
  assertions: Array<{ type: 'assertVisible' | 'assertText' | 'assertUrl' | 'assertElementCount'; target: string; params?: Record<string, any> }>,
  cdpPort: number = DEFAULT_CDP_PORT,
): Promise<{ passed: boolean; results: AssertResult[]; summary: string }> {
  const results: AssertResult[] = [];
  for (const a of assertions) {
    const r = await executeAction({ action: a.type, target: a.target, params: a.params }, cdpPort);
    results.push(r.data as AssertResult);
  }
  const passedCount = results.filter(r => r.passed).length;
  const allPassed = passedCount === results.length;
  return {
    passed: allPassed,
    results,
    summary: `${passedCount}/${results.length} assertions passed`,
  };
}

export type { TextDomNode, AssertResult, BrowserAction, BrowserResult, ActionType };

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
