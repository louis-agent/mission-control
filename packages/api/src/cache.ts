/**
 * LRU cache layer for agent capabilities and workflow definitions.
 *
 * Hot reads (listAgents, getAgentById, listWorkflows, getWorkflowById) are served
 * from an in-memory LRU cache to reduce SQLite load on read-heavy endpoints.
 * All write-path helpers call invalidateAgentCache / invalidateWorkflowCache so
 * the cache stays consistent.
 *
 * Caches are keyed by DB instance (via WeakMap) so that test cases using
 * separate in-memory databases do not share state.
 *
 * Configuration:
 *   CACHE_TTL_MS   — per-entry TTL in milliseconds (default: 30 000)
 *   CACHE_MAX      — max entries per cache per DB instance (default: 500)
 */

import { LRUCache } from 'lru-cache';
import { Counter } from 'prom-client';
import {
  listAgents,
  getAgentById,
  listAgentsByCapability,
  listWorkflows,
  getWorkflowById,
  type DB,
  type Agent,
  type Workflow,
} from '@mission-control/core';
import { register } from './metrics.js';

// ── Config ────────────────────────────────────────────────────────────────────

const TTL_MS = parseInt(process.env.CACHE_TTL_MS ?? '30000', 10);
const MAX_ENTRIES = parseInt(process.env.CACHE_MAX ?? '500', 10);

// ── Metrics ───────────────────────────────────────────────────────────────────

export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Number of LRU cache hits',
  labelNames: ['cache'] as const,
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Number of LRU cache misses',
  labelNames: ['cache'] as const,
  registers: [register],
});

// ── Sentinel for null results ─────────────────────────────────────────────────

const NULL_SENTINEL = { __null: true } as const;
type NullSentinel = typeof NULL_SENTINEL;

function isNull(v: unknown): v is NullSentinel {
  return typeof v === 'object' && v !== null && '__null' in v;
}

// ── Per-DB cache containers ───────────────────────────────────────────────────

type AgentCacheValue = Agent | Agent[] | NullSentinel;
type WorkflowCacheValue = Workflow | Workflow[] | NullSentinel;

interface DbCaches {
  agents: LRUCache<string, AgentCacheValue>;
  workflows: LRUCache<string, WorkflowCacheValue>;
}

// WeakMap ensures caches are GC'd along with their DB instances
const dbCaches = new WeakMap<object, DbCaches>();

function getCaches(db: DB): DbCaches {
  let caches = dbCaches.get(db as object);
  if (!caches) {
    caches = {
      agents: new LRUCache<string, AgentCacheValue>({ max: MAX_ENTRIES, ttl: TTL_MS }),
      workflows: new LRUCache<string, WorkflowCacheValue>({ max: MAX_ENTRIES, ttl: TTL_MS }),
    };
    dbCaches.set(db as object, caches);
  }
  return caches;
}

// ── Cache invalidation ────────────────────────────────────────────────────────

/** Call after any agent create / update / delete / heartbeat. */
export function invalidateAgentCache(db: DB, id?: string): void {
  const { agents } = getCaches(db);
  agents.delete('all');
  if (id) {
    agents.delete(`id:${id}`);
    // Capability keys are cheaply cleared wholesale since we can't enumerate them.
    for (const key of agents.keys()) {
      if (key.startsWith('cap:')) agents.delete(key);
    }
  }
}

/** Call after any workflow create / update / delete. */
export function invalidateWorkflowCache(db: DB, id?: string): void {
  const { workflows } = getCaches(db);
  workflows.delete('all');
  if (id) workflows.delete(`id:${id}`);
}

// ── Cached read helpers ───────────────────────────────────────────────────────

export function cachedListAgents(db: DB): Agent[] {
  const { agents } = getCaches(db);
  const cached = agents.get('all');
  if (cached !== undefined) {
    cacheHits.inc({ cache: 'agents' });
    return cached as Agent[];
  }
  cacheMisses.inc({ cache: 'agents' });
  const result = listAgents(db);
  agents.set('all', result);
  return result;
}

export function cachedGetAgentById(db: DB, id: string): Agent | null {
  const { agents } = getCaches(db);
  const key = `id:${id}`;
  const cached = agents.get(key);
  if (cached !== undefined) {
    cacheHits.inc({ cache: 'agents' });
    return isNull(cached) ? null : (cached as Agent);
  }
  cacheMisses.inc({ cache: 'agents' });
  const result = getAgentById(db, id);
  agents.set(key, result ?? NULL_SENTINEL);
  return result;
}

export function cachedListAgentsByCapability(db: DB, capability: string): Agent[] {
  const { agents } = getCaches(db);
  const key = `cap:${capability}`;
  const cached = agents.get(key);
  if (cached !== undefined) {
    cacheHits.inc({ cache: 'agents' });
    return cached as Agent[];
  }
  cacheMisses.inc({ cache: 'agents' });
  const result = listAgentsByCapability(db, capability);
  agents.set(key, result);
  return result;
}

export function cachedListWorkflows(db: DB): Workflow[] {
  const { workflows } = getCaches(db);
  const cached = workflows.get('all');
  if (cached !== undefined) {
    cacheHits.inc({ cache: 'workflows' });
    return cached as Workflow[];
  }
  cacheMisses.inc({ cache: 'workflows' });
  const result = listWorkflows(db);
  workflows.set('all', result);
  return result;
}

export function cachedGetWorkflowById(db: DB, id: string): Workflow | null {
  const { workflows } = getCaches(db);
  const key = `id:${id}`;
  const cached = workflows.get(key);
  if (cached !== undefined) {
    cacheHits.inc({ cache: 'workflows' });
    return isNull(cached) ? null : (cached as Workflow);
  }
  cacheMisses.inc({ cache: 'workflows' });
  const result = getWorkflowById(db, id);
  workflows.set(key, result ?? NULL_SENTINEL);
  return result;
}
