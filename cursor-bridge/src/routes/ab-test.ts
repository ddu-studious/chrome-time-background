/**
 * AB Test Routes — Prompt version comparison experiments
 *
 * Endpoints:
 *   GET    /ab/experiments             — List all experiments
 *   POST   /ab/experiments             — Create a new experiment
 *   GET    /ab/experiments/:id         — Get experiment details + results
 *   POST   /ab/experiments/:id/record  — Record a run result
 *   POST   /ab/experiments/:id/pick    — Pick variant for next run
 *   POST   /ab/experiments/:id/finish  — Conclude experiment, declare winner
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  createABExperiment,
  getABExperiment,
  listABExperiments,
  recordABRunResult,
  getABRunResults,
  finishABExperiment,
  pickABVariant,
  getActivePromptVersion,
  listPromptVersions,
} from '../services/database.js';
import { getRoleById } from '../services/enterprise-roles.js';

export async function abTestRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { roleId?: string } }>(
    '/ab/experiments',
    async (request) => {
      const experiments = listABExperiments(request.query.roleId) as any[];
      return {
        experiments: experiments.map(formatExperiment),
      };
    }
  );

  app.post<{ Body: {
    roleId: string;
    name: string;
    versionA: string;
    versionB: string;
    trafficSplit?: number;
  } }>(
    '/ab/experiments',
    async (request, reply) => {
      const { roleId, name, versionA, versionB, trafficSplit } = request.body || {};
      if (!roleId || !name || !versionA || !versionB) {
        return reply.code(400).send({ error: 'roleId, name, versionA, versionB are required' });
      }
      const role = getRoleById(roleId);
      if (!role) return reply.code(404).send({ error: 'Role not found' });

      const versions = listPromptVersions(roleId) as any[];
      const vA = versions.find((v: any) => v.id === versionA);
      const vB = versions.find((v: any) => v.id === versionB);
      if (!vA || !vB) return reply.code(404).send({ error: 'Version not found' });

      const id = `ab_${roleId}_${randomUUID().slice(0, 8)}`;
      createABExperiment(id, { roleId, name, versionA, versionB, trafficSplit });

      return reply.code(201).send({
        id,
        roleId,
        name,
        versionA: { id: vA.id, version: vA.version },
        versionB: { id: vB.id, version: vB.version },
        trafficSplit: trafficSplit ?? 0.5,
        status: 'running',
      });
    }
  );

  app.get<{ Params: { id: string } }>(
    '/ab/experiments/:id',
    async (request, reply) => {
      const exp = getABExperiment(request.params.id) as any;
      if (!exp) return reply.code(404).send({ error: 'Experiment not found' });

      const results = (getABRunResults(exp.id) as any[]).map(r => ({
        id: r.id,
        variant: r.variant,
        versionId: r.version_id,
        runId: r.run_id,
        score: r.score,
        latencyMs: r.latency_ms,
        tokenCount: r.token_count,
        feedback: r.feedback,
        createdAt: r.created_at,
      }));

      const statsA = computeVariantStats(results.filter(r => r.variant === 'A'));
      const statsB = computeVariantStats(results.filter(r => r.variant === 'B'));

      return {
        ...formatExperiment(exp),
        results,
        stats: { A: statsA, B: statsB },
        recommendation: computeRecommendation(statsA, statsB, exp),
      };
    }
  );

  app.post<{ Params: { id: string }; Body: {
    variant: 'A' | 'B';
    runId?: string;
    score?: number;
    latencyMs?: number;
    tokenCount?: number;
    feedback?: string;
  } }>(
    '/ab/experiments/:id/record',
    async (request, reply) => {
      const exp = getABExperiment(request.params.id) as any;
      if (!exp) return reply.code(404).send({ error: 'Experiment not found' });
      if (exp.status !== 'running') return reply.code(409).send({ error: 'Experiment is not running' });

      const { variant, runId, score, latencyMs, tokenCount, feedback } = request.body || {};
      if (!variant || !['A', 'B'].includes(variant)) {
        return reply.code(400).send({ error: 'variant (A or B) is required' });
      }

      const versionId = variant === 'A' ? exp.version_a : exp.version_b;
      recordABRunResult({
        experimentId: exp.id, versionId, variant,
        runId, score, latencyMs, tokenCount, feedback,
      });

      return { ok: true };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/ab/experiments/:id/pick',
    async (request, reply) => {
      const exp = getABExperiment(request.params.id) as any;
      if (!exp) return reply.code(404).send({ error: 'Experiment not found' });
      if (exp.status !== 'running') return reply.code(409).send({ error: 'Experiment is not running' });

      const variant = pickABVariant(exp.id);
      const versionId = variant === 'A' ? exp.version_a : exp.version_b;

      return { variant, versionId };
    }
  );

  app.post<{ Params: { id: string }; Body: { winner?: string; activateWinner?: boolean } }>(
    '/ab/experiments/:id/finish',
    async (request, reply) => {
      const exp = getABExperiment(request.params.id) as any;
      if (!exp) return reply.code(404).send({ error: 'Experiment not found' });
      if (exp.status === 'finished') return reply.code(409).send({ error: 'Already finished' });

      const { winner, activateWinner } = request.body || {};
      finishABExperiment(exp.id, winner);

      return { ok: true, winner: winner ?? null };
    }
  );
}

function formatExperiment(exp: any) {
  return {
    id: exp.id,
    roleId: exp.role_id,
    name: exp.name,
    versionA: exp.version_a,
    versionB: exp.version_b,
    status: exp.status,
    trafficSplit: exp.traffic_split,
    totalRuns: exp.total_runs,
    runsA: exp.runs_a,
    runsB: exp.runs_b,
    scoreA: exp.score_a,
    scoreB: exp.score_b,
    winner: exp.winner,
    createdAt: exp.created_at,
    finishedAt: exp.finished_at,
  };
}

function computeVariantStats(results: any[]) {
  if (results.length === 0) return { count: 0, avgScore: null, avgLatency: null, avgTokens: null };
  const scores = results.filter(r => r.score != null).map(r => r.score);
  const latencies = results.filter(r => r.latencyMs != null).map(r => r.latencyMs);
  const tokens = results.filter(r => r.tokenCount != null).map(r => r.tokenCount);
  return {
    count: results.length,
    avgScore: scores.length ? +(scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(3) : null,
    avgLatency: latencies.length ? Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length) : null,
    avgTokens: tokens.length ? Math.round(tokens.reduce((a: number, b: number) => a + b, 0) / tokens.length) : null,
  };
}

function computeRecommendation(statsA: any, statsB: any, exp: any): string {
  if (!statsA.avgScore && !statsB.avgScore) return 'insufficient_data';
  if (!statsA.avgScore) return 'B_leads';
  if (!statsB.avgScore) return 'A_leads';

  const diff = Math.abs(statsA.avgScore - statsB.avgScore);
  const minRuns = Math.min(statsA.count, statsB.count);
  if (minRuns < 5) return 'too_few_runs';
  if (diff < 0.05) return 'no_significant_difference';
  return statsA.avgScore > statsB.avgScore ? 'A_wins' : 'B_wins';
}
