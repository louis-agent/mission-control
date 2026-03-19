import express, { type Application, type Request, type Response } from 'express';
import { listAgents, listTasks, listWorkflows, listExecutionRuns, type DB } from '@mission-control/core';

// ── Time-series bucket ────────────────────────────────────────────────────────

interface Bucket {
  timestamp: string; // ISO start of interval
  count: number;
}

function hourlyBuckets(
  items: Array<{ updatedAt: Date }>,
  hours: number,
  predicate?: (item: { updatedAt: Date }) => boolean,
): Bucket[] {
  const now = Date.now();
  const buckets: Bucket[] = [];

  for (let i = hours - 1; i >= 0; i--) {
    const start = now - (i + 1) * 3_600_000;
    const end = now - i * 3_600_000;
    const count = items.filter((item) => {
      const t = item.updatedAt.getTime();
      return t >= start && t < end && (predicate == null || predicate(item));
    }).length;
    buckets.push({ timestamp: new Date(start).toISOString(), count });
  }

  return buckets;
}

// ── Dashboard app ─────────────────────────────────────────────────────────────

export function createDashboardApp(db: DB): Application {
  const app = express();

  app.get('/dashboard', (_req: Request, res: Response) => {
    const agents = listAgents(db);
    const tasks = listTasks(db);
    const workflows = listWorkflows(db);
    const runs = listExecutionRuns(db);

    const now = Date.now();
    const oneHourAgo = now - 3_600_000;
    const oneDayAgo = now - 86_400_000;

    // ── Agent utilization ────────────────────────────────────────────────────
    const agentUtilization = {
      total: agents.length,
      idle: agents.filter((a) => a.status === 'idle').length,
      busy: agents.filter((a) => a.status === 'busy').length,
      offline: agents.filter((a) => a.status === 'offline').length,
    };

    // ── Task throughput ──────────────────────────────────────────────────────
    const completedLastHour = tasks.filter(
      (t) => t.status === 'completed' && t.updatedAt.getTime() >= oneHourAgo,
    ).length;
    const completedLastDay = tasks.filter(
      (t) => t.status === 'completed' && t.updatedAt.getTime() >= oneDayAgo,
    ).length;

    // ── Failure rates ────────────────────────────────────────────────────────
    const terminalLastDay = tasks.filter(
      (t) =>
        ['completed', 'failed', 'cancelled', 'dead_letter'].includes(t.status) &&
        t.updatedAt.getTime() >= oneDayAgo,
    ).length;
    const failedLastDay = tasks.filter(
      (t) =>
        ['failed', 'dead_letter'].includes(t.status) &&
        t.updatedAt.getTime() >= oneDayAgo,
    ).length;
    const failureRate = terminalLastDay > 0 ? failedLastDay / terminalLastDay : 0;

    // ── Queue depth ──────────────────────────────────────────────────────────
    const queueDepth = tasks.filter((t) => t.status === 'pending').length;

    // ── Active workflows ─────────────────────────────────────────────────────
    const activeWorkflows = workflows.filter((w) => w.status === 'running').length;
    const activeRuns = runs.filter((r) => r.status === 'running' || r.status === 'pending').length;

    // ── Time-series (last 24 h, hourly) ──────────────────────────────────────
    const timeSeries = {
      completedTasks: hourlyBuckets(tasks, 24, (t: { updatedAt: Date } & { status?: string }) =>
        (t as { status: string }).status === 'completed',
      ),
      failedTasks: hourlyBuckets(tasks, 24, (t: { updatedAt: Date } & { status?: string }) =>
        ['failed', 'dead_letter'].includes((t as { status: string }).status),
      ),
    };

    res.json({
      timestamp: new Date().toISOString(),
      agentUtilization,
      taskThroughput: {
        lastHour: completedLastHour,
        lastDay: completedLastDay,
      },
      failureRate: Math.round(failureRate * 10000) / 100, // percentage, 2 dp
      queueDepth,
      activeWorkflows,
      activeExecutionRuns: activeRuns,
      timeSeries,
    });
  });

  return app;
}
