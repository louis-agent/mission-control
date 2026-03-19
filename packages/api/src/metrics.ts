import express, { type Application, type Request, type Response } from 'express';
import { Registry, Gauge, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import {
  listAgents,
  listTasks,
  listExecutionRuns,
  type DB,
} from '@mission-control/core';

// Create a dedicated registry (avoids conflicts with the default global registry
// if multiple test instances are spun up concurrently).
export const register = new Registry();

// ── Metric definitions ────────────────────────────────────────────────────────

export const taskQueueDepth = new Gauge({
  name: 'task_queue_depth',
  help: 'Number of tasks currently in the pending state',
  registers: [register],
});

export const agentStatusCount = new Gauge({
  name: 'agent_status_count',
  help: 'Number of agents grouped by status',
  labelNames: ['status'] as const,
  registers: [register],
});

export const activeExecutionRuns = new Gauge({
  name: 'active_execution_runs',
  help: 'Number of execution runs currently in the running or pending state',
  registers: [register],
});

export const taskFailureTotal = new Counter({
  name: 'task_failure_total',
  help: 'Cumulative count of tasks that entered the failed or dead_letter state',
  registers: [register],
});

export const taskDurationSeconds = new Histogram({
  name: 'task_duration_seconds',
  help: 'Duration of completed tasks in seconds (approximated from createdAt→updatedAt)',
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
  registers: [register],
});

export const workflowExecutionDuration = new Histogram({
  name: 'workflow_execution_duration_seconds',
  help: 'Duration of completed execution runs in seconds',
  buckets: [0.5, 1, 5, 10, 30, 60, 300, 600],
  registers: [register],
});

collectDefaultMetrics({ register });

// ── Scrape helper ─────────────────────────────────────────────────────────────

/**
 * Refresh gauge values by querying the database.
 * Histograms and counters accumulate over the process lifetime.
 */
export function refreshGauges(db: DB): void {
  const agents = listAgents(db);
  agentStatusCount.reset();
  const counts: Record<string, number> = { idle: 0, busy: 0, offline: 0 };
  for (const a of agents) counts[a.status] = (counts[a.status] ?? 0) + 1;
  for (const [status, count] of Object.entries(counts)) {
    agentStatusCount.set({ status }, count);
  }

  const tasks = listTasks(db);
  taskQueueDepth.set(tasks.filter((t) => t.status === 'pending').length);

  const runs = listExecutionRuns(db);
  activeExecutionRuns.set(
    runs.filter((r) => r.status === 'running' || r.status === 'pending').length,
  );
}

/**
 * Record a completed/failed task observation. Call this whenever a task
 * transitions to a terminal state.
 */
export function recordTaskOutcome(task: { status: string; createdAt: Date; updatedAt: Date }): void {
  if (task.status === 'failed' || task.status === 'dead_letter') {
    taskFailureTotal.inc();
  }
  if (task.status === 'completed' || task.status === 'failed') {
    const durationSec = (task.updatedAt.getTime() - task.createdAt.getTime()) / 1000;
    taskDurationSeconds.observe(durationSec);
  }
}

/**
 * Record a completed execution run observation.
 */
export function recordRunOutcome(run: {
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
}): void {
  if (run.status === 'completed' && run.startedAt && run.completedAt) {
    const durationSec = (run.completedAt.getTime() - run.startedAt.getTime()) / 1000;
    workflowExecutionDuration.observe(durationSec);
  }
}

// ── Express app ───────────────────────────────────────────────────────────────

export function createMetricsApp(db: DB): Application {
  const app = express();

  app.get('/metrics', async (_req: Request, res: Response) => {
    try {
      refreshGauges(db);
      const output = await register.metrics();
      res.set('Content-Type', register.contentType);
      res.send(output);
    } catch (err) {
      res.status(500).json({ error: 'Failed to collect metrics' });
    }
  });

  return app;
}
