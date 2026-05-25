/**
 * Dashboard Data Service — Cursor account usage & quota
 *
 * Data sources:
 *   1. Cursor.me()          — SDK public: user info
 *   2. Cursor.models.list() — SDK public: available models
 *   3. Internal token tracker — local per-run cost estimation
 *
 * The gRPC dashboard API is non-public; we wrap what the SDK exposes
 * and supplement with local token-usage aggregation from our DB.
 */

import { Cursor } from '@cursor/sdk';
import { config } from '../config.js';

interface UserInfo {
  apiKeyName: string;
  userEmail?: string;
  createdAt?: string;
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

interface DashboardSnapshot {
  user: UserInfo | null;
  models: ModelInfo[];
  localUsage: UsageSummary;
  fetchedAt: number;
}

const usageRecords: LocalUsageRecord[] = [];

let cachedUser: UserInfo | null = null;
let cachedModels: ModelInfo[] = [];
let lastFetchAt = 0;
const CACHE_TTL_MS = 60_000;

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
    return {
      apiKeyName: (me as any).apiKeyName || (me as any).name || 'unknown',
      userEmail: (me as any).email,
      createdAt: (me as any).createdAt,
    };
  } catch {
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
    const [user, models] = await Promise.all([fetchUserInfo(), fetchModels()]);
    cachedUser = user;
    cachedModels = models;
    lastFetchAt = now;
  }

  return {
    user: cachedUser,
    models: cachedModels,
    localUsage: computeLocalUsage(since),
    fetchedAt: lastFetchAt,
  };
}

export function getLocalUsage(since?: number): UsageSummary {
  return computeLocalUsage(since);
}

export function clearUsageRecords() {
  usageRecords.length = 0;
}
