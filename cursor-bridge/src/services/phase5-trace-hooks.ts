/**
 * Phase 5 Trace Hooks
 *
 * Helper functions to inject whitebox trace events at each key point
 * in the enterprise multi-role collaboration lifecycle:
 *   - Discussion protocol (5.3): opinions, agreements, objections, verdicts
 *   - Execution squad (5.4): delegation, progress, escalation, code review
 *   - QA feedback loop (5.5): bug reports, bug fixes, quality gates
 *   - Completion criteria (5.6): phase transitions, final reports
 */

import { recordTrace, recordDecision, linkCause } from './trace-service.js';
import type { TraceType } from '../types.js';

interface Phase5Context {
  taskAnalysisId: string;
  phase: string;
}

// ─── 5.3 Discussion Protocol Hooks ───

export function traceOpinion(ctx: Phase5Context, agentId: string, roleId: string, opinion: string, runId?: string) {
  return recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'opinion',
    phase: ctx.phase,
    content: opinion,
    metadata: {},
  });
}

export function traceAgreement(
  ctx: Phase5Context, agentId: string, roleId: string,
  content: string, targetRoleId: string, targetTraceId: string, runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'agreement',
    phase: ctx.phase,
    content,
    metadata: { targetRoleId, targetTraceId, stance: 'agree' },
    causedBy: targetTraceId,
  });
  linkCause(targetTraceId, traceId, 'influenced', `${roleId} agreed`);
  return traceId;
}

export function traceObjection(
  ctx: Phase5Context, agentId: string, roleId: string,
  content: string, targetRoleId: string, targetTraceId: string, reason: string, runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'objection',
    phase: ctx.phase,
    content,
    metadata: { targetRoleId, targetTraceId, stance: 'disagree', reason },
    causedBy: targetTraceId,
  });
  linkCause(targetTraceId, traceId, 'influenced', `${roleId} objected`);
  return traceId;
}

export function traceVerdict(
  ctx: Phase5Context, agentId: string, roleId: string,
  topic: string, chosen: string, reason: string,
  options: string[], supportingTraces: string[], dissentingTraces: string[], runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'decision',
    phase: ctx.phase,
    content: `Decision: ${topic} → ${chosen}`,
    metadata: { options, chosen, reason, decisionBy: roleId },
  });

  const decisionId = recordDecision({
    taskAnalysisId: ctx.taskAnalysisId,
    phase: ctx.phase,
    topic,
    options,
    chosen,
    reason,
    decidedBy: roleId,
    supportingTraces,
    dissentingTraces,
  });

  for (const st of supportingTraces) {
    linkCause(st, traceId, 'influenced', 'supporting opinion');
  }
  for (const dt of dissentingTraces) {
    linkCause(dt, traceId, 'influenced', 'dissenting opinion');
  }

  return { traceId, decisionId };
}

// ─── 5.4 Execution Squad Hooks ───

export function traceDelegation(
  ctx: Phase5Context, agentId: string, roleId: string,
  taskId: string, assignedTo: string, description: string, runId?: string,
) {
  return recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'delegation',
    phase: ctx.phase,
    content: `Delegated task "${description}" to ${assignedTo}`,
    metadata: { taskId, assignedTo },
  });
}

export function traceEscalation(
  ctx: Phase5Context, agentId: string, roleId: string,
  content: string, causedByTraceId?: string, runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'escalation',
    phase: ctx.phase,
    content,
    metadata: {},
    causedBy: causedByTraceId,
  });
  if (causedByTraceId) {
    linkCause(causedByTraceId, traceId, 'caused', 'escalated issue');
  }
  return traceId;
}

export function traceApproval(
  ctx: Phase5Context, agentId: string, roleId: string,
  content: string, targetTraceId?: string, runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'approval',
    phase: ctx.phase,
    content,
    metadata: { targetTraceId },
    causedBy: targetTraceId,
  });
  if (targetTraceId) {
    linkCause(targetTraceId, traceId, 'caused', 'reviewed and approved');
  }
  return traceId;
}

export function traceVeto(
  ctx: Phase5Context, agentId: string, roleId: string,
  content: string, reason: string, targetTraceId?: string, runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'veto',
    phase: ctx.phase,
    content,
    metadata: { reason, targetTraceId },
    causedBy: targetTraceId,
  });
  if (targetTraceId) {
    linkCause(targetTraceId, traceId, 'blocked', `vetoed: ${reason}`);
  }
  return traceId;
}

// ─── 5.5 QA Feedback Loop Hooks ───

export function traceBugReport(
  ctx: Phase5Context, agentId: string, roleId: string,
  bugDescription: string, severity: string, causedByTraceId?: string, runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'bug_report',
    phase: ctx.phase,
    content: `[${severity}] ${bugDescription}`,
    metadata: { reason: bugDescription },
    causedBy: causedByTraceId,
  });
  if (causedByTraceId) {
    linkCause(causedByTraceId, traceId, 'caused', 'code introduced bug');
  }
  return traceId;
}

export function traceBugFix(
  ctx: Phase5Context, agentId: string, roleId: string,
  fixDescription: string, bugTraceId: string, runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'bug_fix',
    phase: ctx.phase,
    content: fixDescription,
    metadata: {},
    causedBy: bugTraceId,
  });
  linkCause(bugTraceId, traceId, 'caused', 'bug fix');
  return traceId;
}

export function traceQualityGate(
  ctx: Phase5Context, agentId: string, roleId: string,
  passRate: number, threshold: number, passed: boolean, runId?: string,
) {
  return recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'quality_gate',
    phase: ctx.phase,
    content: `Quality gate: ${passRate}% (threshold: ${threshold}%) → ${passed ? 'PASSED' : 'FAILED'}`,
    metadata: { passRate, threshold, passed },
  });
}

// ─── 5.6 Phase Transitions ───

export function tracePhaseEnter(
  ctx: Phase5Context, agentId: string, roleId: string,
  newPhase: string, fromPhase?: string, runId?: string,
) {
  return recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'phase_enter',
    phase: newPhase,
    content: `Entering phase: ${newPhase}${fromPhase ? ` (from ${fromPhase})` : ''}`,
    metadata: { fromPhase, toPhase: newPhase },
  });
}

export function tracePhaseExit(
  ctx: Phase5Context, agentId: string, roleId: string,
  exitedPhase: string, exitCondition: string, exitReason: string, runId?: string,
) {
  return recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'phase_exit',
    phase: exitedPhase,
    content: `Exiting phase: ${exitedPhase} — ${exitReason}`,
    metadata: { exitCondition, exitReason, fromPhase: exitedPhase },
  });
}

export function traceReference(
  ctx: Phase5Context, agentId: string, roleId: string,
  content: string, referencedTraceId: string, runId?: string,
) {
  const traceId = recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId,
    roleId,
    runId,
    type: 'reference',
    phase: ctx.phase,
    content,
    metadata: { targetTraceId: referencedTraceId },
    causedBy: referencedTraceId,
  });
  linkCause(referencedTraceId, traceId, 'referenced');
  return traceId;
}

export function traceSystemEvent(
  ctx: Phase5Context,
  content: string,
) {
  return recordTrace({
    taskAnalysisId: ctx.taskAnalysisId,
    agentId: 'system',
    roleId: 'system',
    type: 'system',
    phase: ctx.phase,
    content,
    metadata: {},
  });
}
