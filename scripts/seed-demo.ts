/**
 * seed-demo.ts — Mission Control Demo Seed Script
 *
 * Demonstrates the full system end-to-end:
 *   1. Register 3 sample agents with different capabilities
 *   2. Create 5 sample standalone tasks with varying priorities
 *   3. Dispatch tasks to agents and simulate execution
 *   4. Create a multi-step workflow with conditional branching
 *   5. Execute the workflow and advance through all steps
 *   6. Print a summary of what happened
 *
 * Usage:
 *   pnpm seed
 *   npx tsx scripts/seed-demo.ts
 */

import { randomUUID } from 'crypto';
import {
  createDb,
  createAgent,
  createTask,
  updateAgent,
  updateTask,
  listTasks,
  listAgents,
  createWorkflow,
  startExecution,
  advanceExecution,
  getExecutionRunById,
  listTasksByExecutionRun,
  type Agent,
  type Task,
  type ExecutionRun,
} from '@mission-control/core';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function log(msg: string) {
  console.log(msg);
}

function banner(title: string) {
  const line = '─'.repeat(60);
  log(`\n${line}`);
  log(`  ${title}`);
  log(line);
}

function indent(msg: string, depth = 2) {
  const pad = ' '.repeat(depth);
  return msg
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

/** Simulate an agent executing a task: start → complete with synthetic output. */
function simulateTaskExecution(
  db: ReturnType<typeof createDb>,
  task: Task,
  output: Record<string, unknown> = {},
): Task {
  // start
  updateTask(db, task.id, { status: 'running' });
  // complete
  const done = updateTask(db, task.id, { status: 'completed', output });
  return done!;
}

/** Dispatch a pending task to the first idle agent with the required capabilities. */
function manualDispatch(
  db: ReturnType<typeof createDb>,
  task: Task,
  agents: Agent[],
): Agent | null {
  const idle = agents.find(
    (a) =>
      a.status === 'idle' &&
      task.requiredCapabilities.every((cap) => a.capabilities.includes(cap)),
  );
  if (!idle) return null;

  updateTask(db, task.id, { status: 'assigned', assigneeAgentId: idle.id });
  updateAgent(db, idle.id, { status: 'busy' });
  // Refresh local agent list reference
  idle.status = 'busy';
  return idle;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('\n🚀  Mission Control — Demo Seed');
  log('    Running on in-memory SQLite (clean state each run)\n');

  const db = createDb(':memory:');

  // ── Step 1: Register agents ─────────────────────────────────────────────────
  banner('Step 1 · Register 3 Agents');

  const agents: Agent[] = [
    createAgent(db, {
      id: randomUUID(),
      name: 'Alpha Agent',
      capabilities: ['data-processing', 'analysis'],
      status: 'idle',
      metadata: { region: 'us-east-1', tier: 'standard' },
    }),
    createAgent(db, {
      id: randomUUID(),
      name: 'Beta Agent',
      capabilities: ['ml-inference', 'reporting'],
      status: 'idle',
      metadata: { region: 'us-west-2', tier: 'premium', gpuEnabled: true },
    }),
    createAgent(db, {
      id: randomUUID(),
      name: 'Gamma Agent',
      capabilities: ['communication', 'monitoring'],
      status: 'idle',
      metadata: { region: 'eu-west-1', tier: 'standard' },
    }),
  ];

  for (const a of agents) {
    log(indent(`✓ ${a.name} (${a.id.slice(0, 8)}) — [${a.capabilities.join(', ')}]`));
  }

  // ── Step 2: Create 5 standalone tasks ───────────────────────────────────────
  banner('Step 2 · Create 5 Standalone Tasks');

  const taskDefs = [
    {
      title: 'Monitor system health',
      priority: 'critical' as const,
      requiredCapabilities: ['monitoring'],
      description: 'Check cluster metrics and alert on anomalies.',
    },
    {
      title: 'Analyze performance metrics',
      priority: 'high' as const,
      requiredCapabilities: ['analysis'],
      description: 'Compare this week vs last week p99 latencies.',
    },
    {
      title: 'Generate weekly report',
      priority: 'high' as const,
      requiredCapabilities: ['reporting'],
      description: 'Compile KPIs into a PDF report for stakeholders.',
    },
    {
      title: 'Process user uploads',
      priority: 'medium' as const,
      requiredCapabilities: ['data-processing'],
      description: 'Validate, normalise, and store uploaded CSV files.',
    },
    {
      title: 'Send release notifications',
      priority: 'low' as const,
      requiredCapabilities: ['communication'],
      description: 'Broadcast v2.4.0 release notes to all subscribers.',
    },
  ];

  // Sort by priority for cleaner dispatching
  taskDefs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const standaloneTasks: Task[] = taskDefs.map((def) =>
    createTask(db, {
      id: randomUUID(),
      title: def.title,
      description: def.description,
      status: 'pending',
      priority: def.priority,
      requiredCapabilities: def.requiredCapabilities,
      assigneeAgentId: null,
      workflowId: null,
      dependencies: [],
      input: {},
      output: {},
      errorMessage: null,
    }),
  );

  for (const t of standaloneTasks) {
    const prio = t.priority.padEnd(8);
    log(indent(`✓ [${prio}] ${t.title} — requires [${t.requiredCapabilities.join(', ')}]`));
  }

  // ── Step 3: Dispatch standalone tasks ───────────────────────────────────────
  banner('Step 3 · Dispatch Tasks → Agents');

  const dispatchResults: Array<{ task: Task; agent: Agent | null }> = [];
  const localAgents = listAgents(db); // fresh copy

  for (const task of standaloneTasks) {
    const agent = manualDispatch(db, task, localAgents);
    dispatchResults.push({ task, agent });

    if (agent) {
      log(indent(`→ "${task.title}"\n    assigned to ${agent.name}`));
      // Simulate immediate execution for the demo
      const output = { completedAt: new Date().toISOString(), success: true };
      simulateTaskExecution(db, task, output);
      updateAgent(db, agent.id, { status: 'idle' });
      agent.status = 'idle';
      log(indent(`   ✓ completed`));
    } else {
      log(indent(`⚠ "${task.title}" — no capable idle agent found`));
    }
  }

  // ── Step 4: Create multi-step workflow with conditions ──────────────────────
  banner('Step 4 · Create Workflow with Conditional Branching');

  /**
   * Pipeline:
   *
   *   [ingest] ──► [transform] ──► [ml-analysis]  (condition: record_count > 100)
   *                              └► [basic-report] (condition: record_count <= 100)
   *                                  both ──► [notify]
   */
  const stepIngest = 'step-ingest';
  const stepTransform = 'step-transform';
  const stepMlAnalysis = 'step-ml-analysis';
  const stepBasicReport = 'step-basic-report';
  const stepNotify = 'step-notify';

  const workflow = createWorkflow(db, {
    id: randomUUID(),
    name: 'Customer Data Pipeline',
    status: 'pending',
    steps: [
      {
        id: stepIngest,
        name: 'Ingest Dataset',
        type: 'task',
        config: {},
        requiredCapabilities: ['data-processing'],
      },
      {
        id: stepTransform,
        name: 'Transform Data',
        type: 'task',
        config: {},
        dependsOn: [stepIngest],
        requiredCapabilities: ['data-processing'],
      },
      {
        id: stepMlAnalysis,
        name: 'Run ML Analysis',
        type: 'task',
        config: {},
        dependsOn: [stepTransform],
        requiredCapabilities: ['ml-inference'],
        // Taken when dataset is large
        condition: 'record_count > 100',
      },
      {
        id: stepBasicReport,
        name: 'Basic Report',
        type: 'task',
        config: {},
        dependsOn: [stepTransform],
        requiredCapabilities: ['reporting'],
        // Taken when dataset is small
        condition: 'record_count <= 100',
      },
      {
        id: stepNotify,
        name: 'Send Notification',
        type: 'task',
        config: {},
        // Waits for whichever analysis branch runs (skipped ones also satisfy deps)
        dependsOn: [stepMlAnalysis, stepBasicReport],
        requiredCapabilities: ['communication'],
      },
    ],
  });

  log(indent(`✓ Workflow "${workflow.name}" (${workflow.id.slice(0, 8)})`));
  for (const s of workflow.steps) {
    const deps = s.dependsOn?.join(', ') ?? 'root';
    const cond = s.condition ? ` [if: ${s.condition}]` : '';
    log(indent(`   • ${s.name} (${s.id}) deps=[${deps}]${cond}`, 2));
  }

  // ── Step 5: Execute workflow ─────────────────────────────────────────────────
  banner('Step 5 · Execute Workflow');

  let run: ExecutionRun = startExecution(db, workflow.id);
  log(indent(`✓ Execution run ${run.id.slice(0, 8)} started (status: ${run.status})`));

  // We'll simulate agents completing workflow tasks step by step.
  // Each iteration: find pending workflow tasks, simulate completion, advance.
  const workflowAgents = listAgents(db); // fresh after standalone tasks finished
  let iteration = 0;
  const MAX_ITER = 20; // safety guard

  while (run.status === 'running' && iteration < MAX_ITER) {
    iteration++;
    const wfTasks = listTasksByExecutionRun(db, run.id).filter(
      (t) => t.status === 'pending' || t.status === 'assigned',
    );

    if (wfTasks.length === 0) {
      // All current tasks may be running or awaiting; advance and check
      run = advanceExecution(db, run.id)!;
      break;
    }

    for (const wfTask of wfTasks) {
      const agent = manualDispatch(db, wfTask, workflowAgents);
      if (!agent) {
        log(indent(`  ⚠ No agent available for "${wfTask.title}"`));
        continue;
      }

      log(indent(`  → [iter ${iteration}] "${wfTask.title}" → ${agent.name}`));

      // Synthesise outputs based on step so conditions are meaningful
      let stepOutput: Record<string, unknown> = { success: true };
      if (wfTask.stepId === stepIngest) {
        stepOutput = { record_count: 350, source: 'customers.csv', success: true };
      } else if (wfTask.stepId === stepTransform) {
        stepOutput = { ...wfTask.input, normalised: true, success: true };
      } else if (wfTask.stepId === stepMlAnalysis) {
        stepOutput = { model: 'gradient-boost', accuracy: 0.93, success: true };
      } else if (wfTask.stepId === stepBasicReport) {
        stepOutput = { pages: 3, format: 'pdf', success: true };
      } else if (wfTask.stepId === stepNotify) {
        stepOutput = { channel: 'email', recipients: 42, success: true };
      }

      simulateTaskExecution(db, wfTask, stepOutput);
      updateAgent(db, agent.id, { status: 'idle' });
      agent.status = 'idle';
      log(indent(`     ✓ completed — output: ${JSON.stringify(stepOutput)}`));
    }

    run = advanceExecution(db, run.id)!;
    log(indent(`  ↻ advanced → run status: ${run.status}`));
  }

  const finalRun = getExecutionRunById(db, run.id)!;

  // ── Step 6: Summary ──────────────────────────────────────────────────────────
  banner('Step 6 · Summary');

  const allTasks = listTasks(db);
  const standalone = allTasks.filter((t) => !t.workflowId);
  const wfTasks = allTasks.filter((t) => t.workflowId === workflow.id);

  const countByStatus = (tasks: Task[]) =>
    tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {});

  log(indent('Agents'));
  for (const a of listAgents(db)) {
    log(indent(`  ${a.name.padEnd(16)} status=${a.status}`, 2));
  }

  log('');
  log(indent('Standalone Tasks'));
  const standaloneCounts = countByStatus(standalone);
  for (const [status, count] of Object.entries(standaloneCounts)) {
    log(indent(`  ${status.padEnd(12)} ${count}`, 2));
  }

  log('');
  log(indent(`Workflow: "${workflow.name}"`));
  log(indent(`  Execution Run : ${finalRun.id}`, 2));
  log(indent(`  Status        : ${finalRun.status}`, 2));
  log(indent(`  Steps         : ${finalRun.stepResults.length}`, 2));

  for (const sr of finalRun.stepResults) {
    const step = workflow.steps.find((s) => s.id === sr.stepId);
    const icon = sr.status === 'success' ? '✓' : sr.status === 'skipped' ? '⤼' : '✗';
    log(indent(`  ${icon} ${(step?.name ?? sr.stepId).padEnd(22)} ${sr.status}`, 2));
  }

  log('');
  log(indent('Workflow Task Breakdown'));
  const wfCounts = countByStatus(wfTasks);
  for (const [status, count] of Object.entries(wfCounts)) {
    log(indent(`  ${status.padEnd(12)} ${count}`, 2));
  }

  const allCompleted =
    standalone.every((t) => t.status === 'completed') && finalRun.status === 'completed';

  log('');
  if (allCompleted) {
    log('  ✅  All tasks completed and workflow executed successfully!\n');
  } else {
    log(`  ⚠  Some tasks or the workflow did not complete. Run status: ${finalRun.status}\n`);
  }
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
