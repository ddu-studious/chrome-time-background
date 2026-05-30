/**
 * Dashboard Data Service — Cursor usage & quota via multiple auth strategies
 *
 * Auth priority (falls through on failure):
 *   1. CURSOR_SESSION_TOKEN env — WorkosCursorSessionToken from browser cookie
 *      → calls cursor.com dashboard API (usage-summary, filtered-usage-events)
 *   2. CURSOR_API_KEY env — @cursor/sdk for user info & model list
 *   3. state.vscdb fallback — reads JWT from local Cursor database (original method)
 *
 * Data sources:
 *   - cursor.com/api/usage-summary — billing cycle, plan limits, usage totals
 *   - cursor.com/api/dashboard/get-filtered-usage-events — per-request costs
 *   - api2.cursor.sh Connect RPC — billing (when using JWT auth)
 *   - @cursor/sdk — user info & model list
 *   - Local token tracker — per-run cost from our agent pool
 */

import { Cursor } from '@cursor/sdk';
import { config } from '../config.js';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

interface UserInfo {
  apiKeyName: string;
  userEmail?: string;
  createdAt?: string;
  plan?: string;
  subscriptionStatus?: string;
}

interface ModelInfo {
  id: string;
  displayName?: string;
}

interface LocalUsageRecord {
  model: string;
  runId: string;
  agentId: string;
  durationMs: number;
  timestamp: number;
}

interface UsageSummary {
  totalRuns: number;
  totalDurationMs: number;
  byModel: Record<string, { runs: number; totalDurationMs: number }>;
  recentRuns: LocalUsageRecord[];
}

interface BillingUsage {
  billingCycleStart: string;
  billingCycleEnd: string;
  planUsage: {
    totalSpend: number;
    includedSpend: number;
    remaining: number;
    limit: number;
    percentUsed: number;
  };
  onDemandUsage?: {
    totalSpend: number;
    limit: number;
    remaining: number;
  };
}

interface UsageEvent {
  model: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  mode: string;
}

interface DashboardSnapshot {
  user: UserInfo | null;
  models: ModelInfo[];
  localUsage: UsageSummary;
  billing: BillingUsage | null;
  usageEvents?: UsageEvent[];
  authMethod: 'session_token' | 'api_key' | 'vscdb' | 'none';
  fetchedAt: number;
}

const usageRecords: LocalUsageRecord[] = [];

let cachedUser: UserInfo | null = null;
let cachedModels: ModelInfo[] = [];
let cachedBilling: BillingUsage | null = null;
let cachedEvents: UsageEvent[] = [];
let lastFetchAt = 0;
const CACHE_TTL_MS = 60_000;

const CURSOR_DASHBOARD_BASE = 'https://www.cursor.com';
const CURSOR_API_BASE = 'https://api2.cursor.sh';
const CURSOR_CLIENT_ID = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB';

// ─── Auth Strategy 1: Session Token (from browser cookie) ───

function getSessionToken(): string | null {
  return process.env.CURSOR_SESSION_TOKEN || null;
}

async function fetchWithSessionToken(path: string, options: RequestInit = {}): Promise<Response | null> {
  const token = getSessionToken();
  if (!token) return null;

  const url = `${CURSOR_DASHBOARD_BASE}${path}`;
  const headers: Record<string, string> = {
    'Cookie': `WorkosCursorSessionToken=${token}`,
    ...(options.method === 'POST' ? { 'Origin': 'https://www.cursor.com' } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (res.ok) return res;
    console.warn(`[dashboard] Session token request failed: ${res.status} ${path}`);
    return null;
  } catch (err: any) {
    console.warn(`[dashboard] Session token fetch error: ${err.message}`);
    return null;
  }
}

async function fetchBillingViaSession(): Promise<BillingUsage | null> {
  const res = await fetchWithSessionToken('/api/usage-summary');
  if (!res) return null;

  try {
    const data = await res.json() as any;
    const usage = data.individualUsage || data;

    return {
      billingCycleStart: data.billingPeriodStart || data.billingCycleStart || '',
      billingCycleEnd: data.billingPeriodEnd || data.billingCycleEnd || '',
      planUsage: {
        totalSpend: (usage.plan?.totalSpend || usage.totalSpend || 0) / 100,
        includedSpend: (usage.plan?.includedSpend || usage.includedSpend || 0) / 100,
        remaining: (usage.plan?.remaining || usage.remaining || 0) / 100,
        limit: (usage.plan?.limit || usage.limit || 0) / 100,
        percentUsed: usage.plan?.percentUsed || usage.percentUsed || 0,
      },
      onDemandUsage: (usage.onDemand || data.onDemandUsage) ? {
        totalSpend: ((usage.onDemand || data.onDemandUsage)?.totalSpend || 0) / 100,
        limit: ((usage.onDemand || data.onDemandUsage)?.limit || 0) / 100,
        remaining: ((usage.onDemand || data.onDemandUsage)?.remaining || 0) / 100,
      } : undefined,
    };
  } catch (err: any) {
    console.warn('[dashboard] Failed to parse session billing:', err.message);
    return null;
  }
}

async function fetchUsageEventsViaSession(page = 1, pageSize = 50): Promise<UsageEvent[]> {
  const res = await fetchWithSessionToken('/api/dashboard/get-filtered-usage-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, pageSize }),
  });
  if (!res) return [];

  try {
    const data = await res.json() as any;
    const events = data.usageEvents || data.events || [];
    return events.map((e: any) => ({
      model: e.model || e.modelId || 'unknown',
      timestamp: e.createdAt || e.timestamp || '',
      inputTokens: e.inputTokens || e.promptTokens || 0,
      outputTokens: e.outputTokens || e.completionTokens || 0,
      cacheReadTokens: e.cacheReadTokens || 0,
      cost: (e.totalCostCents || e.cost || 0) / 100,
      mode: e.source || e.mode || 'unknown',
    }));
  } catch {
    return [];
  }
}

// ─── Auth Strategy 2 & 3: API Key + state.vscdb JWT ───

function getCursorDbPath(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return resolve(homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  } else if (platform === 'win32') {
    return resolve(process.env.APPDATA || '', 'Cursor/User/globalStorage/state.vscdb');
  }
  return resolve(homedir(), '.config/Cursor/User/globalStorage/state.vscdb');
}

let _cachedAccessToken: string | null = null;
let _cachedRefreshToken: string | null = null;
let _tokenExpiresAt = 0;

async function readCursorTokens(): Promise<{ accessToken: string | null; refreshToken: string | null; email: string | null; plan: string | null }> {
  const dbPath = getCursorDbPath();
  if (!existsSync(dbPath)) {
    return { accessToken: null, refreshToken: null, email: null, plan: null };
  }

  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const getVal = (key: string): string | null => {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key) as any;
      return row?.value || null;
    };

    const accessToken = getVal('cursorAuth/accessToken');
    const refreshToken = getVal('cursorAuth/refreshToken');
    const email = getVal('cursorAuth/cachedEmail');
    const plan = getVal('cursorAuth/stripeMembershipType');
    db.close();

    return { accessToken, refreshToken, email, plan };
  } catch (err: any) {
    console.warn('[dashboard] Failed to read Cursor tokens:', err.message);
    return { accessToken: null, refreshToken: null, email: null, plan: null };
  }
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${CURSOR_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: CURSOR_CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.shouldLogout) return null;
    return data.accessToken || data.access_token || null;
  } catch {
    return null;
  }
}

async function getValidAccessToken(): Promise<string | null> {
  if (_cachedAccessToken && Date.now() < _tokenExpiresAt) {
    return _cachedAccessToken;
  }

  const tokens = await readCursorTokens();
  if (!tokens.accessToken) return null;

  try {
    const payload = JSON.parse(Buffer.from(tokens.accessToken.split('.')[1], 'base64').toString());
    const expMs = (payload.exp || 0) * 1000;

    if (Date.now() < expMs - 30_000) {
      _cachedAccessToken = tokens.accessToken;
      _cachedRefreshToken = tokens.refreshToken;
      _tokenExpiresAt = expMs - 30_000;
      return _cachedAccessToken;
    }
  } catch { /* token may not be JWT, try refresh */ }

  if (tokens.refreshToken) {
    const newToken = await refreshAccessToken(tokens.refreshToken);
    if (newToken) {
      _cachedAccessToken = newToken;
      _tokenExpiresAt = Date.now() + 55 * 60 * 1000;
      return _cachedAccessToken;
    }
  }

  _cachedAccessToken = tokens.accessToken;
  _tokenExpiresAt = Date.now() + 5 * 60 * 1000;
  return _cachedAccessToken;
}

async function fetchBillingViaJWT(): Promise<BillingUsage | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${CURSOR_API_BASE}/aiserver.v1.DashboardService/GetCurrentPeriodUsage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: '{}',
    });

    if (!res.ok) return null;
    const data = await res.json() as any;

    return {
      billingCycleStart: data.billingCycleStart || '',
      billingCycleEnd: data.billingCycleEnd || '',
      planUsage: {
        totalSpend: (data.planUsage?.totalSpend || 0) / 100,
        includedSpend: (data.planUsage?.includedSpend || 0) / 100,
        remaining: (data.planUsage?.remaining || 0) / 100,
        limit: (data.planUsage?.limit || 0) / 100,
        percentUsed: data.planUsage?.percentUsed || data.percentUsed || 0,
      },
      onDemandUsage: data.onDemandUsage ? {
        totalSpend: (data.onDemandUsage.totalSpend || 0) / 100,
        limit: (data.onDemandUsage.individualLimit || data.onDemandUsage.pooledLimit || 0) / 100,
        remaining: (data.onDemandUsage.individualRemaining || data.onDemandUsage.pooledRemaining || 0) / 100,
      } : undefined,
    };
  } catch (err: any) {
    console.warn('[dashboard] Failed to fetch billing via JWT:', err.message);
    return null;
  }
}

async function fetchBillingUsage(): Promise<{ billing: BillingUsage | null; method: DashboardSnapshot['authMethod'] }> {
  // Strategy 1: session token (no local DB dependency)
  const sessionBilling = await fetchBillingViaSession();
  if (sessionBilling) return { billing: sessionBilling, method: 'session_token' };

  // Strategy 2: JWT from state.vscdb
  const jwtBilling = await fetchBillingViaJWT();
  if (jwtBilling) return { billing: jwtBilling, method: 'vscdb' };

  return { billing: null, method: 'none' };
}

export function recordRunUsage(record: LocalUsageRecord) {
  usageRecords.push(record);
  if (usageRecords.length > 500) usageRecords.shift();
}

function computeLocalUsage(since?: number): UsageSummary {
  const cutoff = since || 0;
  const relevant = usageRecords.filter(r => r.timestamp >= cutoff);
  const byModel: Record<string, { runs: number; totalDurationMs: number }> = {};

  for (const r of relevant) {
    if (!byModel[r.model]) byModel[r.model] = { runs: 0, totalDurationMs: 0 };
    byModel[r.model].runs++;
    byModel[r.model].totalDurationMs += r.durationMs;
  }

  return {
    totalRuns: relevant.length,
    totalDurationMs: relevant.reduce((sum, r) => sum + r.durationMs, 0),
    byModel,
    recentRuns: relevant.slice(-20).reverse(),
  };
}

async function fetchUserInfo(): Promise<UserInfo | null> {
  try {
    const me = await Cursor.me({ apiKey: config.apiKey });
    const tokens = await readCursorTokens();
    return {
      apiKeyName: (me as any).apiKeyName || (me as any).name || 'unknown',
      userEmail: (me as any).email || tokens.email || undefined,
      createdAt: (me as any).createdAt,
      plan: tokens.plan || undefined,
      subscriptionStatus: undefined,
    };
  } catch {
    const tokens = await readCursorTokens();
    if (tokens.email) {
      return {
        apiKeyName: 'local',
        userEmail: tokens.email,
        plan: tokens.plan || undefined,
      };
    }
    return cachedUser;
  }
}

async function fetchModels(): Promise<ModelInfo[]> {
  try {
    const models = await Cursor.models.list({ apiKey: config.apiKey });
    if (Array.isArray(models)) {
      return models.map((m: any) => ({
        id: m.id || m.modelId,
        displayName: m.displayName || m.name || m.id,
      }));
    }
    return [];
  } catch {
    return cachedModels;
  }
}

export async function getDashboardData(since?: number): Promise<DashboardSnapshot> {
  const now = Date.now();
  if (now - lastFetchAt > CACHE_TTL_MS) {
    const [user, models, billingResult] = await Promise.all([
      fetchUserInfo(),
      fetchModels(),
      fetchBillingUsage(),
    ]);
    cachedUser = user;
    cachedModels = models;
    cachedBilling = billingResult.billing;

    if (billingResult.method === 'session_token') {
      cachedEvents = await fetchUsageEventsViaSession(1, 30);
    }

    lastFetchAt = now;
  }

  const billingResult = cachedBilling ? (getSessionToken() ? 'session_token' : 'vscdb') : 'none';

  return {
    user: cachedUser,
    models: cachedModels,
    localUsage: computeLocalUsage(since),
    billing: cachedBilling,
    usageEvents: cachedEvents.length > 0 ? cachedEvents : undefined,
    authMethod: billingResult as DashboardSnapshot['authMethod'],
    fetchedAt: lastFetchAt,
  };
}

export function getLocalUsage(since?: number): UsageSummary {
  return computeLocalUsage(since);
}

export function clearUsageRecords() {
  usageRecords.length = 0;
}

/**
 * Update the session token at runtime (e.g. from a settings UI).
 * This avoids requiring a restart when the cookie is refreshed.
 */
export function setSessionToken(token: string) {
  process.env.CURSOR_SESSION_TOKEN = token;
  lastFetchAt = 0; // force refresh on next call
}

export function getAuthStatus(): { method: string; configured: boolean } {
  if (getSessionToken()) return { method: 'session_token', configured: true };
  if (config.apiKey) return { method: 'api_key', configured: true };
  const dbPath = getCursorDbPath();
  if (existsSync(dbPath)) return { method: 'vscdb', configured: true };
  return { method: 'none', configured: false };
}
