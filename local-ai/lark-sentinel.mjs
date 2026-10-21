import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

const DEFAULT_BINARY = '/opt/homebrew/bin/lark-cli';
const DEFAULT_PROFILE = 'codex-feishu-notify';
const MIN_VERSION = [1, 0, 92];
const PROFILE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const CHAT_ID_PATTERN = /^oc_[A-Za-z0-9_]{1,96}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]+/g;
const BIDI_CHARS = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u061c\ufeff]/g;
const BACKOFF_MS = [2 * 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export function cleanMetaText(value, max = 24) {
  if (typeof value !== 'string') return '';
  const text = value.replace(BIDI_CHARS, '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

export function parseCliVersion(raw) {
  if (typeof raw !== 'string') return null;
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVersionSupported(version, min = MIN_VERSION) {
  if (!Array.isArray(version) || version.length < 3) return false;
  for (let i = 0; i < 3; i += 1) {
    if (version[i] > min[i]) return true;
    if (version[i] < min[i]) return false;
  }
  return true;
}

function parseCreateTimeMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return n < 1e11 ? n * 1000 : n;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

/**
 * 将飞书消息列表投影为纯元数据（绝不读取或透传 content / 正文 / 消息 ID）。
 */
export function projectAtMeMetadata(messages, { openId = '', filterMentions = false, sinceMs = 0 } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const chatCounts = new Map();
  const senderSet = new Set();
  let count = 0;
  let newestAt = 0;

  for (const item of list) {
    if (!item || typeof item !== 'object' || item.deleted === true) continue;
    const createdMs = parseCreateTimeMs(item.create_time ?? item.createTime);
    if (sinceMs > 0 && createdMs > 0 && createdMs <= sinceMs) continue;
    if (filterMentions) {
      const mentions = Array.isArray(item.mentions) ? item.mentions : [];
      const hit = mentions.some(m => m && typeof m === 'object' && (
        (openId && (m.id === openId || m.open_id === openId || m.user_id === openId)) ||
        m.key === '@_all' || m.name === '所有人' || m.name === 'All'
      ));
      if (!hit) continue;
    }
    count += 1;
    if (createdMs > newestAt) newestAt = createdMs;
    const chatName = cleanMetaText(item.chat_name || item.chatName || item.chat?.name || '', 24);
    if (chatName) chatCounts.set(chatName, (chatCounts.get(chatName) || 0) + 1);
    const senderName = cleanMetaText(
      typeof item.sender === 'object' ? (item.sender?.name || item.sender?.sender_name || '') : (item.sender_name || ''),
      18,
    );
    if (senderName && senderSet.size < 3) senderSet.add(senderName);
  }

  const chats = [...chatCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, total]) => ({ name, count: total }));

  return {
    count,
    chats,
    senders: [...senderSet].slice(0, 3),
    newestAt,
  };
}

function defaultExec(binary, args, { timeoutMs = 15_000, maxBuffer = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        timeout: timeoutMs,
        maxBuffer,
        windowsHide: true,
        env: {
          HOME: process.env.HOME || '',
          PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
          LANG: 'en_US.UTF-8',
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const wrapped = new Error(error.killed ? '飞书 CLI 调用超时' : '飞书 CLI 调用失败');
          wrapped.code = error.code;
          wrapped.stdout = typeof stdout === 'string' ? stdout.slice(0, 4096) : '';
          wrapped.stderr = typeof stderr === 'string' ? stderr.slice(0, 1024) : '';
          reject(wrapped);
          return;
        }
        resolve(typeof stdout === 'string' ? stdout : String(stdout || ''));
      },
    );
  });
}

function parseJsonOutput(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

function formatIsoTime(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export class LarkSentinel {
  constructor(options = {}) {
    this.binary = typeof options.binary === 'string' && options.binary ? options.binary : DEFAULT_BINARY;
    const profile = typeof options.profile === 'string' && PROFILE_PATTERN.test(options.profile) ? options.profile : DEFAULT_PROFILE;
    this.profile = profile;
    this.exec = typeof options.exec === 'function' ? options.exec : defaultExec;
    this.exists = typeof options.exists === 'function' ? options.exists : existsSync;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.cacheMs = Number.isFinite(options.cacheMs) && options.cacheMs >= 0 ? options.cacheMs : 10 * 60_000;
    this.manualCacheMs = Number.isFinite(options.manualCacheMs) && options.manualCacheMs >= 0 ? options.manualCacheMs : 15_000;

    this.versionChecked = null;
    this.cachedResult = null;
    this.cachedAt = 0;
    this.failures = 0;
    this.backoffUntil = 0;
    this.inFlight = null;
  }

  async ensureVersion() {
    if (this.versionChecked) return this.versionChecked;
    if (!this.exists(this.binary)) {
      return { ok: false, status: 'unavailable', error: '未找到 /opt/homebrew/bin/lark-cli' };
    }
    try {
      const out = await this.exec(this.binary, ['--version'], { timeoutMs: 5000 });
      const parsed = parseCliVersion(out);
      if (!isVersionSupported(parsed)) {
        return { ok: false, status: 'unavailable', error: 'lark-cli 版本过低，需要 >= 1.0.92' };
      }
      this.versionChecked = { ok: true, version: parsed.join('.') };
      return this.versionChecked;
    } catch {
      return { ok: false, status: 'unavailable', error: '无法执行 lark-cli' };
    }
  }

  async check({ since = 0, manual = false } = {}) {
    const now = this.now();
    const ttl = manual ? this.manualCacheMs : this.cacheMs;
    if (this.cachedResult && now - this.cachedAt < ttl) {
      return { ...this.cachedResult, cached: true };
    }
    if (!manual && now < this.backoffUntil) {
      return { ok: false, status: 'rate_limited', error: '飞书检查退避冷却中' };
    }
    if (this.inFlight) return this.inFlight;

    this.inFlight = this._runCheck({ since, now }).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async _runCheck({ since, now }) {
    const ver = await this.ensureVersion();
    if (!ver.ok) return ver;

    const baseArgs = ['--profile', this.profile];
    let auth;
    try {
      const rawAuth = await this.exec(this.binary, [...baseArgs, 'auth', 'status'], { timeoutMs: 8000 });
      auth = parseJsonOutput(rawAuth);
    } catch {
      this._recordFailure(now);
      return { ok: false, status: 'unavailable', error: '飞书登录状态查询失败' };
    }

    const user = auth?.identities?.user;
    if (!user || user.available !== true) {
      return { ok: false, status: 'not_logged_in', profile: this.profile, error: '飞书用户登录态未就绪' };
    }

    const openId = typeof user.openId === 'string' ? user.openId.trim() : '';
    const scope = typeof user.scope === 'string' ? user.scope : '';
    const minSince = now - 24 * 60 * 60_000;
    const defaultSince = now - 2 * 60 * 60_000;
    const sinceMs = Number.isFinite(Number(since)) && Number(since) > 0
      ? Math.max(minSince, Math.min(now, Number(since)))
      : defaultSince;
    const startIso = formatIsoTime(sinceMs);

    try {
      let result;
      if (scope.split(/\s+/).includes('search:message')) {
        result = await this._checkViaSearch(baseArgs, startIso, sinceMs);
      } else {
        result = await this._checkViaChatScan(baseArgs, openId, startIso, sinceMs);
      }
      this.failures = 0;
      this.backoffUntil = 0;
      this.cachedResult = result;
      this.cachedAt = now;
      return result;
    } catch {
      this._recordFailure(now);
      return { ok: false, status: 'unavailable', profile: this.profile, error: '飞书消息元数据读取失败' };
    }
  }

  async _checkViaSearch(baseArgs, startIso, sinceMs) {
    const out = await this.exec(this.binary, [
      ...baseArgs,
      'im', '+messages-search',
      '--is-at-me',
      '--start', startIso,
      '--page-size', '50',
      '--as', 'user',
      '--format', 'json',
    ]);
    const parsed = parseJsonOutput(out);
    const messages = parsed?.data?.messages || parsed?.messages || [];
    const projected = projectAtMeMetadata(messages, { filterMentions: false, sinceMs });
    return {
      ok: true,
      status: 'ok',
      mode: 'search',
      profile: this.profile,
      ...projected,
    };
  }

  async _checkViaChatScan(baseArgs, openId, startIso, sinceMs) {
    const out = await this.exec(this.binary, [
      ...baseArgs,
      'im', '+chat-list',
      '--as', 'user',
      '--sort', 'active_time',
      '--exclude-muted',
      '--page-size', '5',
      '--format', 'json',
    ]);
    const parsed = parseJsonOutput(out);
    const chats = (parsed?.data?.chats || parsed?.chats || [])
      .filter(chat => chat && typeof chat === 'object' && CHAT_ID_PATTERN.test(chat.chat_id || ''))
      .slice(0, 3);

    const collected = [];
    for (const chat of chats) {
      const chatId = chat.chat_id;
      const chatName = cleanMetaText(chat.name || '', 24);
      const msgOut = await this.exec(this.binary, [
        ...baseArgs,
        'im', '+chat-messages-list',
        '--as', 'user',
        '--chat-id', chatId,
        '--start', startIso,
        '--page-size', '20',
        '--no-reactions',
        '--format', 'json',
      ]);
      const msgParsed = parseJsonOutput(msgOut);
      const items = msgParsed?.data?.messages || msgParsed?.messages || [];
      for (const item of items) {
        if (item && typeof item === 'object') {
          collected.push({ ...item, chat_name: item.chat_name || chatName });
        }
      }
    }

    const projected = projectAtMeMetadata(collected, { openId, filterMentions: true, sinceMs });
    return {
      ok: true,
      status: 'ok',
      mode: 'chat_scan',
      profile: this.profile,
      ...projected,
    };
  }

  _recordFailure(now) {
    const idx = Math.min(this.failures, BACKOFF_MS.length - 1);
    this.failures += 1;
    this.backoffUntil = now + BACKOFF_MS[idx];
  }
}
