import { randomUUID } from 'crypto';
import type { DB } from './db.js';
import type { Workflow, WorkflowStep, ExecutionRun, Agent } from './types.js';
import { getWorkflowById } from './crud-workflows.js';
import { createExecutionRun, getExecutionRunById, updateExecutionRun } from './crud-execution-runs.js';
import { createTask, updateTask, listTasksByExecutionRun } from './crud-tasks.js';
import { listAgents } from './crud-agents.js';
import { evaluateCondition } from './condition-evaluator.js';

// ──────────────────────────────────────────────────────────────────────────────
// State machine
// ──────────────────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['running'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid ExecutionRun transition: ${from} → ${to}`);
  }
}

function assertTransition(current: string, next: string): void {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw new InvalidTransitionError(current, next);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function detectCycle(steps: WorkflowStep[]): boolean {
  const stepIds = new Set(steps.map((s) => s.id));
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    const step = steps.find((s) => s.id === id);
    for (const dep of step?.dependsOn ?? []) {
      if (stepIds.has(dep) && dfs(dep)) return true;
    }
    inStack.delete(id);
    return false;
  }

  return steps.some((s) => dfs(s.id));
}

export function validateWorkflow(workflow: Workflow, agents: Agent[]): ValidationResult {
  const errors: string[] = [];
  const stepIds = new Set(workflow.steps.map((s) => s.id));

  if (detectCycle(workflow.steps)) {
    errors.push('Workflow has cyclic step dependencies');
  }

  for (const step of workflow.steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!stepIds.has(dep)) {
        errors.push(`Step '${step.id}' depends on unknown step '${dep}'`);
      }
    }
  }

  const allCapabilities = new Set(agents.flatMap((a) => a.capabilities));
  for (const step of workflow.steps) {
    for (const cap of step.requiredCapabilities ?? []) {
      if (!allCapabilities.has(cap)) {
        errors.push(`Step '${step.id}' requires capability '${cap}' but no agent has it`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────────────
// Execution helpers
// ──────────────────────────────────────────────────────────────────────────────

function mergeOutputsFromDeps(
  steps: WorkflowStep[],
  stepId: string,
  stepOutputs: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const step = steps.find((s) => s.id === stepId);
  if (!step) return {};
  const merged: Record<string, unknown> = {};
  for (const dep of step.dependsOn ?? []) {
    const output = stepOutputs.get(dep);
    if (output) Object.assign(merged, output);
  }
  return merged;
}

/**
 * Determine which steps are ready to be scheduled.
 * A step is ready if:
 *  - it hasn't already been scheduled
 *  - all its dependencies are satisfied (completed OR skipped)
 *  - its condition (if any) passes against the merged dep outputs
 */
function getReadyOrSkippableSteps(
  steps: WorkflowStep[],
  completedOrSkippedIds: Set<string>,
  scheduledStepIds: Set<string>,
  stepOutputs: Map<string, Record<string, unknown>>,
): { ready: WorkflowStep[]; skipped: WorkflowStep[] } {
  const ready: WorkflowStep[] = [];
  const skipped: WorkflowStep[] = [];

  for (const step of steps) {
    if (scheduledStepIds.has(step.id) || completedOrSkippedIds.has(step.id)) continue;
    const deps = step.dependsOn ?? [];
    if (!deps.every((dep) => completedOrSkippedIds.has(dep))) continue;

    if (step.condition) {
      const ctx = mergeOutputsFromDeps(steps, step.id, stepOutputs) as Record<string, unknown>;
      if (!evaluateCondition(step.condition, ctx)) {
        skipped.push(step);
        continue;
      }
    }
    ready.push(step);
  }

  return { ready, skipped };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Start a new execution run for the given workflow.
 */
export function startExecution(
  db: DB,
  workflowId: string,
  opts?: { parentRunId?: string; parentStepId?: string; timeoutMs?: number },
): ExecutionRun {
  const workflow = getWorkflowById(db, workflowId);
  if (!workflow) throw new Error(`Workflow '${workflowId}' not found`);

  const agents = listAgents(db);
  const validation = validateWorkflow(workflow, agents);
  if (!validation.valid) {
    throw new Error(`Workflow validation failed: ${validation.errors.join('; ')}`);
  }

  const timeoutAt = opts?.timeoutMs ? new Date(Date.now() + opts.timeoutMs) : null;

  const run = createExecutionRun(db, {
    id: randomUUID(),
    workflowId,
    parentRunId: opts?.parentRunId ?? null,
    parentStepId: opts?.parentStepId ?? null,
    status: 'running',
    startedAt: new Date(),
    completedAt: null,
    timeoutAt,
    stepResults: [],
  });

  const rootSteps = workflow.steps.filter((s) => (s.dependsOn ?? []).length === 0);
  for (const step of rootSteps) {
    scheduleStep(db, step, run.id, workflowId, {});
  }

  return getExecutionRunById(db, run.id)!;
}

function scheduleStep(
  db: DB,
  step: WorkflowStep,
  runId: string,
  workflowId: string,
  input: Record<string, unknown>,
): void {
  const timeoutAt = step.timeoutMs ? new Date(Date.now() + step.timeoutMs) : undefined;
  const status = step.type === 'approval' ? 'awaiting_approval' : 'pending';

  createTask(db, {
    id: randomUUID(),
    title: step.name,
    description: `Execute step '${step.name}' (type: ${step.type})`,
    status,
    priority: 'medium',
    requiredCapabilities: step.requiredCapabilities ?? [],
    assigneeAgentId: null,
    workflowId,
    executionRunId: runId,
    stepId: step.id,
    dependencies: [],
    input,
    output: {},
    errorMessage: null,
    timeoutAt,
  });
}

/**
 * Advance the execution run: check completed tasks, handle approvals, sub-workflows,
 * schedule newly unblocked steps. Returns updated run, or null if run not found.
 */
export function advanceExecution(db: DB, runId: string): ExecutionRun | null {
  const run = getExecutionRunById(db, runId);
  if (!run) return null;
  if (run.status !== 'running') return run;

  const workflow = getWorkflowById(db, run.workflowId);
  if (!workflow) return run;

  const allTasks = listTasksByExecutionRun(db, runId);

  const completedOrSkippedIds = new Set<string>();
  const failedStepIds = new Set<string>();
  const scheduledStepIds = new Set<string>();
  const stepOutputs = new Map<string, Record<string, unknown>>();

  // Collect already-recorded results
  for (const sr of run.stepResults) {
    if (sr.status === 'success' || sr.status === 'skipped') {
      completedOrSkippedIds.add(sr.stepId);
      if (sr.status === 'success') stepOutputs.set(sr.stepId, sr.output);
    } else if (sr.status === 'failure') {
      failedStepIds.add(sr.stepId);
    }
  }

  for (const task of allTasks) {
    if (task.stepId) scheduledStepIds.add(task.stepId);
  }

  const newStepResults = [...run.stepResults];
  let newFailure = false;

  // Process task completions / sub-workflow completions
  for (const task of allTasks) {
    if (!task.stepId) continue;
    if (completedOrSkippedIds.has(task.stepId) || failedStepIds.has(task.stepId)) continue;

    const step = workflow.steps.find((s) => s.id === task.stepId);

    if (step?.type === 'subworkflow' && task.status === 'running') {
      // Check if child run is done
      const childRunId = task.output.childRunId as string | undefined;
      if (childRunId) {
        const childRun = getExecutionRunById(db, childRunId);
        if (childRun?.status === 'completed') {
          updateTask(db, task.id, { status: 'completed', output: task.output });
          completedOrSkippedIds.add(task.stepId);
          stepOutputs.set(task.stepId, task.output);
          newStepResults.push({ stepId: task.stepId, status: 'success', output: task.output });
        } else if (childRun?.status === 'failed' || childRun?.status === 'cancelled') {
          updateTask(db, task.id, { status: 'failed', errorMessage: 'Sub-workflow failed' });
          failedStepIds.add(task.stepId);
          newStepResults.push({
            stepId: task.stepId,
            status: 'failure',
            output: {},
            error: 'Sub-workflow failed',
          });
          newFailure = true;
        }
      }
      continue;
    }

    if (task.status === 'completed') {
      completedOrSkippedIds.add(task.stepId);
      stepOutputs.set(task.stepId, task.output);
      newStepResults.push({ stepId: task.stepId, status: 'success', output: task.output });
    } else if (task.status === 'failed') {
      failedStepIds.add(task.stepId);
      newStepResults.push({
        stepId: task.stepId,
        status: 'failure',
        output: {},
        error: task.errorMessage ?? 'Task failed',
      });
      newFailure = true;
    }
  }

  if (newFailure || failedStepIds.size > 0) {
    for (const task of allTasks) {
      if (['pending', 'assigned', 'running', 'awaiting_approval'].includes(task.status)) {
        updateTask(db, task.id, { status: 'cancelled', errorMessage: 'Execution run failed' });
      }
    }
    assertTransition(run.status, 'failed');
    return updateExecutionRun(db, runId, { status: 'failed', stepResults: newStepResults });
  }

  // Iteratively propagate skips and schedule ready steps until stable
  let changed = true;
  while (changed) {
    changed = false;
    const { ready, skipped } = getReadyOrSkippableSteps(
      workflow.steps,
      completedOrSkippedIds,
      scheduledStepIds,
      stepOutputs,
    );

    for (const step of skipped) {
      newStepResults.push({ stepId: step.id, status: 'skipped', output: {} });
      completedOrSkippedIds.add(step.id);
      scheduledStepIds.add(step.id);
      changed = true;
    }

    for (const step of ready) {
      const input = mergeOutputsFromDeps(workflow.steps, step.id, stepOutputs);
      if (step.type === 'subworkflow') {
        if (!step.subworkflowId) continue;
        const childRun = startExecution(db, step.subworkflowId, {
          parentRunId: runId,
          parentStepId: step.id,
        });
        createTask(db, {
          id: randomUUID(),
          title: step.name,
          description: `Sub-workflow step '${step.name}'`,
          status: 'running',
          priority: 'medium',
          requiredCapabilities: [],
          assigneeAgentId: null,
          workflowId: run.workflowId,
          executionRunId: runId,
          stepId: step.id,
          dependencies: [],
          input,
          output: { childRunId: childRun.id },
          errorMessage: null,
        });
      } else {
        scheduleStep(db, step, runId, run.workflowId, input);
      }
      scheduledStepIds.add(step.id);
      changed = true;
    }
  }

  // Check if all steps are done (completed, skipped, or awaiting_approval blocks)
  const allStepIds = new Set(workflow.steps.map((s) => s.id));
  const awaitingApproval = allTasks.some((t) => t.status === 'awaiting_approval');

  const allDone = [...allStepIds].every((id) => completedOrSkippedIds.has(id));

  if (allDone && !awaitingApproval) {
    assertTransition(run.status, 'completed');
    return updateExecutionRun(db, runId, {
      status: 'completed',
      completedAt: new Date(),
      stepResults: newStepResults,
    });
  }

  if (newStepResults.length !== run.stepResults.length) {
    return updateExecutionRun(db, runId, { stepResults: newStepResults });
  }

  return getExecutionRunById(db, runId);
}

/**
 * Approve a pending approval step, transitioning the task to completed.
 */
export function approveStep(db: DB, runId: string, stepId: string): void {
  const run = getExecutionRunById(db, runId);
  if (!run) throw new Error(`ExecutionRun '${runId}' not found`);

  const allTasks = listTasksByExecutionRun(db, runId);
  const task = allTasks.find((t) => t.stepId === stepId);
  if (!task || task.status !== 'awaiting_approval') {
    throw new Error(`Step '${stepId}' is not awaiting approval`);
  }
  updateTask(db, task.id, { status: 'completed', output: { approved: true } });
}

/**
 * Reject a pending approval step, transitioning the task to failed.
 */
export function rejectStep(db: DB, runId: string, stepId: string, reason?: string): void {
  const run = getExecutionRunById(db, runId);
  if (!run) throw new Error(`ExecutionRun '${runId}' not found`);

  const allTasks = listTasksByExecutionRun(db, runId);
  const task = allTasks.find((t) => t.stepId === stepId);
  if (!task || task.status !== 'awaiting_approval') {
    throw new Error(`Step '${stepId}' is not awaiting approval`);
  }
  updateTask(db, task.id, {
    status: 'failed',
    errorMessage: reason ?? 'Rejected',
    output: { approved: false },
  });
}

/**
 * Cancel a running execution: cancel all in-flight tasks, mark run as cancelled.
 */
export function cancelExecution(db: DB, runId: string): ExecutionRun | null {
  const run = getExecutionRunById(db, runId);
  if (!run) return null;

  assertTransition(run.status, 'cancelled');

  const allTasks = listTasksByExecutionRun(db, runId);
  for (const task of allTasks) {
    if (['pending', 'assigned', 'running', 'awaiting_approval'].includes(task.status)) {
      updateTask(db, task.id, { status: 'cancelled', errorMessage: 'Execution run cancelled' });
    }
  }

  return updateExecutionRun(db, runId, { status: 'cancelled', cancelledAt: new Date() });
}
