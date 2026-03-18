import { randomUUID } from 'crypto';
import type { DB } from './db.js';
import type { Workflow, WorkflowStep, ExecutionRun, Agent } from './types.js';
import { getWorkflowById } from './crud-workflows.js';
import { createExecutionRun, getExecutionRunById, updateExecutionRun } from './crud-execution-runs.js';
import { createTask, updateTask, listTasksByExecutionRun } from './crud-tasks.js';
import { listAgents } from './crud-agents.js';

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

  // Check for cycles
  if (detectCycle(workflow.steps)) {
    errors.push('Workflow has cyclic step dependencies');
  }

  // Check dependsOn references are valid
  for (const step of workflow.steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!stepIds.has(dep)) {
        errors.push(`Step '${step.id}' depends on unknown step '${dep}'`);
      }
    }
  }

  // Check required capabilities are available
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

function getReadySteps(
  steps: WorkflowStep[],
  completedStepIds: Set<string>,
  scheduledStepIds: Set<string>,
): WorkflowStep[] {
  return steps.filter((step) => {
    if (scheduledStepIds.has(step.id)) return false;
    const deps = step.dependsOn ?? [];
    return deps.every((dep) => completedStepIds.has(dep));
  });
}

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

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Start a new execution run for the given workflow.
 * Creates tasks for all steps with no dependencies (root steps).
 */
export function startExecution(db: DB, workflowId: string): ExecutionRun {
  const workflow = getWorkflowById(db, workflowId);
  if (!workflow) throw new Error(`Workflow '${workflowId}' not found`);

  const agents = listAgents(db);
  const validation = validateWorkflow(workflow, agents);
  if (!validation.valid) {
    throw new Error(`Workflow validation failed: ${validation.errors.join('; ')}`);
  }

  const run = createExecutionRun(db, {
    id: randomUUID(),
    workflowId,
    status: 'running',
    startedAt: new Date(),
    completedAt: null,
    cancelledAt: null,
    stepResults: [],
  });

  const rootSteps = getReadySteps(workflow.steps, new Set(), new Set());
  for (const step of rootSteps) {
    createTask(db, {
      id: randomUUID(),
      title: step.name,
      description: `Execute step '${step.name}' (type: ${step.type})`,
      status: 'pending',
      requiredCapabilities: step.requiredCapabilities ?? [],
      assigneeAgentId: null,
      workflowId,
      executionRunId: run.id,
      stepId: step.id,
      dependencies: [],
      input: {},
      output: {},
      errorMessage: null,
    });
  }

  return getExecutionRunById(db, run.id)!;
}

/**
 * Advance the execution run: check completed tasks, schedule newly unblocked steps.
 * Returns updated run, or null if run not found.
 */
export function advanceExecution(db: DB, runId: string): ExecutionRun | null {
  const run = getExecutionRunById(db, runId);
  if (!run) return null;
  if (run.status !== 'running') return run;

  const workflow = getWorkflowById(db, run.workflowId);
  if (!workflow) return run;

  const allTasks = listTasksByExecutionRun(db, runId);

  // Build step state maps
  const completedStepIds = new Set<string>();
  const failedStepIds = new Set<string>();
  const scheduledStepIds = new Set<string>();
  const stepOutputs = new Map<string, Record<string, unknown>>();

  // Collect results already recorded (from previous advances)
  for (const sr of run.stepResults) {
    if (sr.status === 'success') {
      completedStepIds.add(sr.stepId);
      stepOutputs.set(sr.stepId, sr.output);
    } else if (sr.status === 'failure') {
      failedStepIds.add(sr.stepId);
    }
  }

  // Determine scheduled steps (tasks exist)
  for (const task of allTasks) {
    if (task.stepId) scheduledStepIds.add(task.stepId);
  }

  // Process task completions not yet in stepResults
  const newStepResults = [...run.stepResults];
  let newFailure = false;

  for (const task of allTasks) {
    if (!task.stepId) continue;
    if (completedStepIds.has(task.stepId) || failedStepIds.has(task.stepId)) continue;

    if (task.status === 'completed') {
      completedStepIds.add(task.stepId);
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

  // If any step failed, cancel remaining tasks and mark run as failed
  if (newFailure || failedStepIds.size > 0) {
    for (const task of allTasks) {
      if (['pending', 'assigned', 'running'].includes(task.status)) {
        updateTask(db, task.id, { status: 'cancelled', errorMessage: 'Execution run failed' });
      }
    }
    assertTransition(run.status, 'failed');
    return updateExecutionRun(db, runId, {
      status: 'failed',
      stepResults: newStepResults,
    });
  }

  // Schedule newly unblocked steps
  const newlyReady = getReadySteps(workflow.steps, completedStepIds, scheduledStepIds);
  for (const step of newlyReady) {
    const input = mergeOutputsFromDeps(workflow.steps, step.id, stepOutputs);
    createTask(db, {
      id: randomUUID(),
      title: step.name,
      description: `Execute step '${step.name}' (type: ${step.type})`,
      status: 'pending',
      requiredCapabilities: step.requiredCapabilities ?? [],
      assigneeAgentId: null,
      workflowId: run.workflowId,
      executionRunId: runId,
      stepId: step.id,
      dependencies: [],
      input,
      output: {},
      errorMessage: null,
    });
    scheduledStepIds.add(step.id);
  }

  // Check if all steps are done
  const allStepIds = new Set(workflow.steps.map((s) => s.id));
  const allDone = [...allStepIds].every((id) => completedStepIds.has(id));

  if (allDone) {
    assertTransition(run.status, 'completed');
    return updateExecutionRun(db, runId, {
      status: 'completed',
      completedAt: new Date(),
      stepResults: newStepResults,
    });
  }

  // Update step results if changed
  if (newStepResults.length !== run.stepResults.length) {
    return updateExecutionRun(db, runId, { stepResults: newStepResults });
  }

  return getExecutionRunById(db, runId);
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
    if (['pending', 'assigned', 'running'].includes(task.status)) {
      updateTask(db, task.id, { status: 'cancelled', errorMessage: 'Execution run cancelled' });
    }
  }

  return updateExecutionRun(db, runId, {
    status: 'cancelled',
    cancelledAt: new Date(),
  });
}
