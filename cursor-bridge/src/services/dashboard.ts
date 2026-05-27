/**
 * Dashboard Data Service — Cursor usage & quota via open API
 *
 * Data sources:
 *   1. api2.cursor.sh gRPC — billing/usage/quota (Connect RPC v1)
 *   2. Cursor.me() / Cursor.models.list() — user info & model list
 *   3. Local token tracker — per-run cost from our agent pool
 *
 * Auth: reads access/refresh tokens from Cursor's local SQLite (state.vscdb).
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

interface DashboardSnapshot {
  user: UserInfo | null;
  models: ModelInfo[];
  localUsage: UsageSummary;
  billing: BillingUsage | null;
  fetchedAt: number;
}

const usageRecords: LocalUsageRecord[] = [];

let cachedUser: UserInfo | null = null;
let cachedModels: ModelInfo[] = [];
let cachedBilling: BillingUsage | null = null;
let lastFetchAt = 0;
const CACHE_TTL_MS = 60_000;

const CURSOR_API_BASE = 'https://api2.cursor.sh';
const CURSOR_CLIENT_ID = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB';

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

  // Check if token is expired by decoding JWT payload
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

async function fetchBillingUsage(): Promise<BillingUsage | null> {
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
    console.warn('[dashboard] Failed to fetch billing usage:', err.message);
    return null;
  }
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
    const [user, models, billing] = await Promise.all([
      fetchUserInfo(),
      fetchModels(),
      fetchBillingUsage(),
    ]);
    cachedUser = user;
    cachedModels = models;
    cachedBilling = billing;
    lastFetchAt = now;
  }

  return {
    user: cachedUser,
    models: cachedModels,
    localUsage: computeLocalUsage(since),
    billing: cachedBilling,
    fetchedAt: lastFetchAt,
  };
}

export function getLocalUsage(since?: number): UsageSummary {
  return computeLocalUsage(since);
}

export function clearUsageRecords() {
  usageRecords.length = 0;
}
