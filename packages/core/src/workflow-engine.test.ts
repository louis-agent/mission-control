import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db.js';
import type { DB } from './db.js';
import { createAgent, listAgents } from './crud-agents.js';
import { createWorkflow } from './crud-workflows.js';
import { listTasksByExecutionRun, updateTask } from './crud-tasks.js';
import {
  validateWorkflow,
  startExecution,
  advanceExecution,
  cancelExecution,
  approveStep,
  rejectStep,
  InvalidTransitionError,
} from './workflow-engine.js';
import { createWorkflow as createWorkflowDirect } from './crud-workflows.js';

let db: DB;

const agentBase = {
  id: 'agent-1',
  name: 'Worker',
  capabilities: ['build', 'test', 'deploy'],
  status: 'idle' as const,
  metadata: {},
};

const buildTestWorkflow = (steps: Parameters<typeof createWorkflow>[1]['steps']) =>
  createWorkflow(db, {
    id: 'wf-1',
    name: 'Test Workflow',
    steps,
    status: 'pending',
  });

beforeEach(() => {
  db = createDb(':memory:');
  createAgent(db, agentBase);
});

// ──────────────────────────────────────────────────────────────────────────────
// State machine transitions
// ──────────────────────────────────────────────────────────────────────────────

describe('ExecutionRun state machine', () => {
  it('throws on invalid transition: pending → completed', () => {
    const workflow = buildTestWorkflow([{ id: 's1', name: 'Step 1', type: 'build', config: {} }]);
    const run = startExecution(db, workflow.id); // pending → running
    expect(run.status).toBe('running');

    // Attempting invalid transition in cancelExecution on a completed run
    // Complete the step first
    const tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    const completed = advanceExecution(db, run.id);
    expect(completed?.status).toBe('completed');

    expect(() => cancelExecution(db, run.id)).toThrow(InvalidTransitionError);
  });

  it('throws on invalid transition: cancelled → running', () => {
    const workflow = buildTestWorkflow([{ id: 's1', name: 'Step 1', type: 'build', config: {} }]);
    const run = startExecution(db, workflow.id);
    cancelExecution(db, run.id);
    // Advance on a cancelled run should be a no-op (status !== running)
    const result = advanceExecution(db, run.id);
    expect(result?.status).toBe('cancelled');
  });

  it('startExecution creates run in running status', () => {
    const workflow = buildTestWorkflow([{ id: 's1', name: 'Build', type: 'build', config: {} }]);
    const run = startExecution(db, workflow.id);
    expect(run.status).toBe('running');
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeNull();
    expect(run.cancelledAt).toBeNull();
  });

  it('throws for unknown workflow', () => {
    expect(() => startExecution(db, 'nonexistent')).toThrow("Workflow 'nonexistent' not found");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Workflow validation
// ──────────────────────────────────────────────────────────────────────────────

describe('validateWorkflow', () => {
  it('validates a simple linear workflow', () => {
    const agents = listAgents(db);
    const workflow = {
      id: 'wf',
      name: 'w',
      status: 'pending' as const,
      steps: [
        { id: 's1', name: 'Build', type: 'build', config: {}, requiredCapabilities: ['build'] },
        { id: 's2', name: 'Test', type: 'test', config: {}, dependsOn: ['s1'], requiredCapabilities: ['test'] },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateWorkflow(workflow, agents);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects cyclic dependencies', () => {
    const workflow = {
      id: 'wf',
      name: 'w',
      status: 'pending' as const,
      steps: [
        { id: 's1', name: 'A', type: 'a', config: {}, dependsOn: ['s2'] },
        { id: 's2', name: 'B', type: 'b', config: {}, dependsOn: ['s1'] },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateWorkflow(workflow, []);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Workflow has cyclic step dependencies');
  });

  it('detects reference to non-existent step', () => {
    const workflow = {
      id: 'wf',
      name: 'w',
      status: 'pending' as const,
      steps: [
        { id: 's1', name: 'A', type: 'a', config: {}, dependsOn: ['nonexistent'] },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateWorkflow(workflow, []);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/unknown step 'nonexistent'/);
  });

  it('detects missing required capabilities', () => {
    const agents = listAgents(db);
    const workflow = {
      id: 'wf',
      name: 'w',
      status: 'pending' as const,
      steps: [
        { id: 's1', name: 'A', type: 'a', config: {}, requiredCapabilities: ['gpu-compute'] },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateWorkflow(workflow, agents);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/requires capability 'gpu-compute'/);
  });

  it('startExecution throws if workflow is invalid', () => {
    buildTestWorkflow([
      { id: 's1', name: 'A', type: 'a', config: {}, requiredCapabilities: ['gpu-compute'] },
    ]);
    expect(() => startExecution(db, 'wf-1')).toThrow('Workflow validation failed');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Sequential execution
// ──────────────────────────────────────────────────────────────────────────────

describe('Sequential execution', () => {
  it('creates only root tasks on start, then advances through steps', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Test', type: 'test', config: {}, dependsOn: ['s1'] },
    ]);

    const run = startExecution(db, 'wf-1');
    let tasks = listTasksByExecutionRun(db, run.id);

    // Only root step (s1) should be created initially
    expect(tasks).toHaveLength(1);
    expect(tasks[0].stepId).toBe('s1');

    // Advance without completing: should not change anything
    advanceExecution(db, run.id);
    tasks = listTasksByExecutionRun(db, run.id);
    expect(tasks).toHaveLength(1);

    // Complete s1
    updateTask(db, tasks[0].id, { status: 'completed', output: { built: true } });
    advanceExecution(db, run.id);

    tasks = listTasksByExecutionRun(db, run.id);
    expect(tasks).toHaveLength(2);
    const s2Task = tasks.find((t) => t.stepId === 's2')!;
    expect(s2Task).toBeDefined();
    expect(s2Task.status).toBe('pending');

    // Complete s2
    updateTask(db, s2Task.id, { status: 'completed', output: { tested: true } });
    const completed = advanceExecution(db, run.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.completedAt).toBeInstanceOf(Date);
  });

  it('records step results in the execution run', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
    ]);
    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: { artifact: 'dist.zip' } });
    const finished = advanceExecution(db, run.id);

    expect(finished?.stepResults).toHaveLength(1);
    expect(finished?.stepResults[0]).toMatchObject({
      stepId: 's1',
      status: 'success',
      output: { artifact: 'dist.zip' },
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Output piping
// ──────────────────────────────────────────────────────────────────────────────

describe('Output piping', () => {
  it('pipes step N output as input to step N+1', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['s1'] },
    ]);

    const run = startExecution(db, 'wf-1');
    const s1Tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, s1Tasks[0].id, { status: 'completed', output: { artifact: 'app.tar.gz', version: '1.2.3' } });
    advanceExecution(db, run.id);

    const allTasks = listTasksByExecutionRun(db, run.id);
    const s2Task = allTasks.find((t) => t.stepId === 's2')!;
    expect(s2Task.input).toMatchObject({ artifact: 'app.tar.gz', version: '1.2.3' });
  });

  it('merges outputs from multiple dependencies', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Test', type: 'test', config: {} },
      { id: 's3', name: 'Release', type: 'release', config: {}, dependsOn: ['s1', 's2'] },
    ]);

    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);

    const s1 = tasks.find((t) => t.stepId === 's1')!;
    const s2 = tasks.find((t) => t.stepId === 's2')!;

    updateTask(db, s1.id, { status: 'completed', output: { artifact: 'app.tar.gz' } });
    updateTask(db, s2.id, { status: 'completed', output: { coverage: 95 } });
    advanceExecution(db, run.id);

    const allTasks = listTasksByExecutionRun(db, run.id);
    const s3Task = allTasks.find((t) => t.stepId === 's3')!;
    expect(s3Task.input).toMatchObject({ artifact: 'app.tar.gz', coverage: 95 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Parallel execution
// ──────────────────────────────────────────────────────────────────────────────

describe('Parallel execution', () => {
  it('schedules independent steps concurrently', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Lint', type: 'lint', config: {} },
      { id: 's2', name: 'Test', type: 'test', config: {} },
      { id: 's3', name: 'Build', type: 'build', config: {} },
    ]);

    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);

    // All 3 steps have no dependencies — all should be scheduled immediately
    expect(tasks).toHaveLength(3);
    const stepIds = tasks.map((t) => t.stepId).sort();
    expect(stepIds).toEqual(['s1', 's2', 's3']);
  });

  it('completes when all parallel steps finish', () => {
    buildTestWorkflow([
      { id: 's1', name: 'A', type: 'a', config: {} },
      { id: 's2', name: 'B', type: 'b', config: {} },
    ]);

    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);

    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    let result = advanceExecution(db, run.id);
    expect(result?.status).toBe('running'); // still waiting for s2

    updateTask(db, tasks[1].id, { status: 'completed', output: {} });
    result = advanceExecution(db, run.id);
    expect(result?.status).toBe('completed');
  });

  it('handles fan-out then fan-in pattern', () => {
    // s1 → s2, s3 → s4 (s4 depends on both s2 and s3)
    buildTestWorkflow([
      { id: 's1', name: 'Init', type: 'init', config: {} },
      { id: 's2', name: 'A', type: 'a', config: {}, dependsOn: ['s1'] },
      { id: 's3', name: 'B', type: 'b', config: {}, dependsOn: ['s1'] },
      { id: 's4', name: 'Merge', type: 'merge', config: {}, dependsOn: ['s2', 's3'] },
    ]);

    const run = startExecution(db, 'wf-1');
    let tasks = listTasksByExecutionRun(db, run.id);
    expect(tasks).toHaveLength(1); // only s1

    // Complete s1
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    advanceExecution(db, run.id);
    tasks = listTasksByExecutionRun(db, run.id);
    expect(tasks).toHaveLength(3); // s1, s2, s3

    // Complete s2
    const s2 = tasks.find((t) => t.stepId === 's2')!;
    const s3 = tasks.find((t) => t.stepId === 's3')!;
    updateTask(db, s2.id, { status: 'completed', output: {} });
    advanceExecution(db, run.id);
    tasks = listTasksByExecutionRun(db, run.id);
    expect(tasks).toHaveLength(3); // s4 not yet unblocked

    // Complete s3 — now s4 should be unblocked
    updateTask(db, s3.id, { status: 'completed', output: {} });
    advanceExecution(db, run.id);
    tasks = listTasksByExecutionRun(db, run.id);
    expect(tasks).toHaveLength(4); // s4 now scheduled

    // Complete s4
    const s4 = tasks.find((t) => t.stepId === 's4')!;
    updateTask(db, s4.id, { status: 'completed', output: {} });
    const result = advanceExecution(db, run.id);
    expect(result?.status).toBe('completed');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Failure handling
// ──────────────────────────────────────────────────────────────────────────────

describe('Failure handling', () => {
  it('marks run as failed when a task fails', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['s1'] },
    ]);

    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'failed', errorMessage: 'Build failed' });
    const result = advanceExecution(db, run.id);

    expect(result?.status).toBe('failed');
    expect(result?.stepResults[0]).toMatchObject({
      stepId: 's1',
      status: 'failure',
      error: 'Build failed',
    });
  });

  it('cancels in-flight tasks when a step fails', () => {
    buildTestWorkflow([
      { id: 's1', name: 'A', type: 'a', config: {} },
      { id: 's2', name: 'B', type: 'b', config: {} },
    ]);

    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);
    // s1 fails, s2 is still pending
    updateTask(db, tasks[0].id, { status: 'failed', errorMessage: 'error' });
    advanceExecution(db, run.id);

    const updated = listTasksByExecutionRun(db, run.id);
    const s2 = updated.find((t) => t.stepId === 's2')!;
    expect(s2.status).toBe('cancelled');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Cancellation
// ──────────────────────────────────────────────────────────────────────────────

describe('Cancellation', () => {
  it('cancels a running execution and all in-flight tasks', () => {
    buildTestWorkflow([
      { id: 's1', name: 'A', type: 'a', config: {} },
      { id: 's2', name: 'B', type: 'b', config: {} },
    ]);

    const run = startExecution(db, 'wf-1');
    const result = cancelExecution(db, run.id);

    expect(result?.status).toBe('cancelled');
    expect(result?.cancelledAt).toBeInstanceOf(Date);

    const tasks = listTasksByExecutionRun(db, run.id);
    for (const task of tasks) {
      expect(task.status).toBe('cancelled');
    }
  });

  it('does not cancel already completed tasks', () => {
    buildTestWorkflow([
      { id: 's1', name: 'A', type: 'a', config: {} },
      { id: 's2', name: 'B', type: 'b', config: {} },
    ]);

    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);

    // Complete s1 before cancelling
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    cancelExecution(db, run.id);

    const updated = listTasksByExecutionRun(db, run.id);
    const s1 = updated.find((t) => t.stepId === 's1')!;
    expect(s1.status).toBe('completed'); // not cancelled
  });

  it('returns null for unknown run', () => {
    expect(advanceExecution(db, 'nonexistent')).toBeNull();
  });

  it('throws when cancelling a completed run', () => {
    buildTestWorkflow([{ id: 's1', name: 'A', type: 'a', config: {} }]);
    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    advanceExecution(db, run.id);

    expect(() => cancelExecution(db, run.id)).toThrow(InvalidTransitionError);
  });

  it('returns the run unchanged when advancing a cancelled run', () => {
    buildTestWorkflow([{ id: 's1', name: 'A', type: 'a', config: {} }]);
    const run = startExecution(db, 'wf-1');
    cancelExecution(db, run.id);
    const result = advanceExecution(db, run.id);
    expect(result?.status).toBe('cancelled');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Conditional branching
// ──────────────────────────────────────────────────────────────────────────────

describe('Conditional branching', () => {
  it('skips a step whose condition evaluates to false', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['s1'], condition: 'env == prod' },
    ]);

    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);
    // s1 completes with env=staging — condition fails
    updateTask(db, tasks[0].id, { status: 'completed', output: { env: 'staging' } });
    const result = advanceExecution(db, run.id);

    // s2 was skipped → run completes
    expect(result?.status).toBe('completed');
    const s2Result = result?.stepResults.find((r) => r.stepId === 's2');
    expect(s2Result?.status).toBe('skipped');
  });

  it('executes a step whose condition evaluates to true', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['s1'], condition: 'env == prod' },
    ]);

    const run = startExecution(db, 'wf-1');
    let tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: { env: 'prod' } });
    advanceExecution(db, run.id);

    tasks = listTasksByExecutionRun(db, run.id);
    expect(tasks).toHaveLength(2);
    const s2Task = tasks.find((t) => t.stepId === 's2')!;
    expect(s2Task.status).toBe('pending'); // not skipped
  });

  it('treats dependents of a skipped step as satisfied', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Compile', type: 'compile', config: {} },
      { id: 's2', name: 'Sign', type: 'sign', config: {}, dependsOn: ['s1'], condition: 'sign == true' },
      { id: 's3', name: 'Upload', type: 'upload', config: {}, dependsOn: ['s2'] },
    ]);

    const run = startExecution(db, 'wf-1');
    let tasks = listTasksByExecutionRun(db, run.id);
    // s1 completes without sign=true → s2 skipped → s3 should still run
    updateTask(db, tasks[0].id, { status: 'completed', output: { sign: 'false' } });
    advanceExecution(db, run.id);

    tasks = listTasksByExecutionRun(db, run.id);
    const s3Task = tasks.find((t) => t.stepId === 's3');
    expect(s3Task).toBeDefined();
    expect(s3Task!.status).toBe('pending');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Approval gates
// ──────────────────────────────────────────────────────────────────────────────

describe('Approval gates', () => {
  it('pauses execution when an approval step is reached', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Approve', type: 'approval', config: {}, dependsOn: ['s1'] },
      { id: 's3', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['s2'] },
    ]);

    const run = startExecution(db, 'wf-1');
    let tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    const advanced = advanceExecution(db, run.id);

    // Run is still running but paused at approval
    expect(advanced?.status).toBe('running');
    tasks = listTasksByExecutionRun(db, run.id);
    const approvalTask = tasks.find((t) => t.stepId === 's2')!;
    expect(approvalTask.status).toBe('awaiting_approval');

    // s3 should not be scheduled yet
    const s3Task = tasks.find((t) => t.stepId === 's3');
    expect(s3Task).toBeUndefined();
  });

  it('resumes execution when approval is granted', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Approve', type: 'approval', config: {}, dependsOn: ['s1'] },
      { id: 's3', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['s2'] },
    ]);

    const run = startExecution(db, 'wf-1');
    let tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    advanceExecution(db, run.id);

    tasks = listTasksByExecutionRun(db, run.id);
    approveStep(db, run.id, 's2');
    advanceExecution(db, run.id);

    tasks = listTasksByExecutionRun(db, run.id);
    const s3Task = tasks.find((t) => t.stepId === 's3');
    expect(s3Task).toBeDefined();
    expect(s3Task!.status).toBe('pending');
  });

  it('fails the run when an approval step is rejected', () => {
    buildTestWorkflow([
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Approve', type: 'approval', config: {}, dependsOn: ['s1'] },
    ]);

    const run = startExecution(db, 'wf-1');
    const tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    advanceExecution(db, run.id);

    rejectStep(db, run.id, 's2', 'Not approved');
    const result = advanceExecution(db, run.id);

    expect(result?.status).toBe('failed');
    const s2Result = result?.stepResults.find((r) => r.stepId === 's2');
    expect(s2Result?.status).toBe('failure');
  });

  it('throws when approving a step not awaiting approval', () => {
    buildTestWorkflow([{ id: 's1', name: 'Build', type: 'build', config: {} }]);
    const run = startExecution(db, 'wf-1');
    expect(() => approveStep(db, run.id, 's1')).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Sub-workflows
// ──────────────────────────────────────────────────────────────────────────────

describe('Sub-workflows', () => {
  it('creates a child execution run for a subworkflow step', () => {
    // Create the sub-workflow separately
    createWorkflowDirect(db, {
      id: 'sub-wf',
      name: 'Sub Workflow',
      steps: [{ id: 'sub-s1', name: 'SubStep', type: 'build', config: {} }],
      status: 'pending',
    });

    buildTestWorkflow([
      { id: 's1', name: 'Prepare', type: 'build', config: {} },
      {
        id: 's2',
        name: 'Run Sub',
        type: 'subworkflow',
        config: {},
        dependsOn: ['s1'],
        subworkflowId: 'sub-wf',
      },
      { id: 's3', name: 'Finish', type: 'deploy', config: {}, dependsOn: ['s2'] },
    ]);

    const run = startExecution(db, 'wf-1');
    let tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: { data: 42 } });
    const advanced = advanceExecution(db, run.id);

    // Child run should have been started
    expect(advanced?.status).toBe('running');
    tasks = listTasksByExecutionRun(db, run.id);
    const s2Task = tasks.find((t) => t.stepId === 's2')!;
    // The subworkflow step task is marked as running (waiting for child)
    expect(s2Task.status).toBe('running');
    expect(s2Task.output.childRunId).toBeDefined();

    // s3 should not be scheduled yet
    const s3Task = tasks.find((t) => t.stepId === 's3');
    expect(s3Task).toBeUndefined();
  });

  it('completes the parent step when the child run completes', () => {
    createWorkflowDirect(db, {
      id: 'sub-wf',
      name: 'Sub Workflow',
      steps: [{ id: 'sub-s1', name: 'SubStep', type: 'build', config: {} }],
      status: 'pending',
    });

    buildTestWorkflow([
      { id: 's1', name: 'Prepare', type: 'build', config: {} },
      {
        id: 's2',
        name: 'Run Sub',
        type: 'subworkflow',
        config: {},
        dependsOn: ['s1'],
        subworkflowId: 'sub-wf',
      },
      { id: 's3', name: 'Finish', type: 'deploy', config: {}, dependsOn: ['s2'] },
    ]);

    const run = startExecution(db, 'wf-1');
    let tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    advanceExecution(db, run.id);

    tasks = listTasksByExecutionRun(db, run.id);
    const s2Task = tasks.find((t) => t.stepId === 's2')!;
    const childRunId = s2Task.output.childRunId as string;

    // Complete the child run's task
    const subTasks = listTasksByExecutionRun(db, childRunId);
    updateTask(db, subTasks[0].id, { status: 'completed', output: { result: 'done' } });
    advanceExecution(db, childRunId); // completes child run

    // Advance parent — s2 should be completed now
    advanceExecution(db, run.id);
    tasks = listTasksByExecutionRun(db, run.id);
    const s3Task = tasks.find((t) => t.stepId === 's3');
    expect(s3Task).toBeDefined();
  });
});
