/**
 * Job handler implementations for each background job type.
 *
 * workflow_execution — start a workflow execution run
 * webhook_delivery   — deliver a webhook payload to its target URL
 * metric_aggregation — refresh Prometheus gauges (scrape-independent path)
 */

import {
  startExecution,
  advanceExecution,
  type DB,
  type Job,
} from '@mission-control/core';
import { refreshGauges } from './metrics.js';
import { logger } from './logger.js';
import type { JobHandler } from './job-worker.js';

// ── workflow_execution ────────────────────────────────────────────────────────

export const workflowExecutionHandler: JobHandler = async (job: Job, db: DB): Promise<void> => {
  const { workflowId, timeoutMs } = job.payload as {
    workflowId: string;
    timeoutMs?: number;
  };

  const run = startExecution(db, workflowId, { timeoutMs });
  // Advance once immediately to schedule the first set of tasks
  advanceExecution(db, run.id);
  logger.info({ jobId: job.id, workflowId, runId: run.id }, 'workflow execution started');
};

// ── webhook_delivery ──────────────────────────────────────────────────────────

export const webhookDeliveryHandler: JobHandler = async (job: Job, _db: DB): Promise<void> => {
  const { url, secret, eventType, payload } = job.payload as {
    url: string;
    secret: string;
    eventType: string;
    payload: Record<string, unknown>;
  };

  const body = JSON.stringify({ event: eventType, data: payload });
  const sig = await hmacSha256(secret, body);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mission-Control-Signature': sig,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Webhook delivery failed: ${res.status} ${res.statusText}`);
  }
  logger.info({ jobId: job.id, url, eventType }, 'webhook delivered');
};

async function hmacSha256(secret: string, body: string): Promise<string> {
  const { createHmac } = await import('crypto');
  return createHmac('sha256', secret).update(body).digest('hex');
}

// ── metric_aggregation ────────────────────────────────────────────────────────

export const metricAggregationHandler: JobHandler = async (_job: Job, db: DB): Promise<void> => {
  refreshGauges(db);
};
