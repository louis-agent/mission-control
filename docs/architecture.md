# Architecture

Mission Control is an AI-powered coordination platform for autonomous agent workflows. It exposes a REST API, a real-time event bus, a background job queue, and a React dashboard over a single Node.js process backed by SQLite.

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                           Clients                               │
│   Browser (dashboard)   CLI (mc)   SDK (@mission-control/sdk)   │
│                   External AI agents                            │
└────────────┬──────────────────┬───────────────────┬────────────┘
             │                  │                   │
             └──────────────────▼───────────────────┘
                          api (:3000)
                     Express HTTP server
                          │        │
                ┌─────────┘        └──────────────┐
                ▼                                  ▼
       core (domain + SQLite)           Background job worker
    agents / tasks / workflows          workflow_execution
    events / webhooks / audit-log       webhook_delivery
    api-keys / alerts / storage         metric_aggregation
```

---

## Package Structure

The codebase is a **pnpm monorepo** with five packages under `packages/`:

| Package | Description |
|---------|-------------|
| `core` | Domain models, SQLite schema (Drizzle ORM), all CRUD helpers, EventBus |
| `api` | Express HTTP server; mounts route sub-apps, serves dashboard static bundle |
| `sdk` | Typed TypeScript client wrapping every API endpoint |
| `cli` | Commander.js `mc` CLI delegating to the SDK |
| `dashboard` | Vite + React SPA for monitoring |

### Dependency graph

```
dashboard → sdk → (none)
cli       → sdk → (none)
api       → core
           → sdk (for typed responses)
sdk       → (none)
core      → (none)
```

---

## API Layer (`packages/api`)

The server (`server.ts`) is a single Express application composed from independent sub-apps, each handling one resource domain:

| Sub-app | Routes | Notes |
|---------|--------|-------|
| `registry` | `POST/GET/PATCH/DELETE /api/agents` | Agent registration and lifecycle |
| `queue` | `POST/GET /api/tasks`, `/dispatch`, `/start`, `/complete`, `/fail` | Task queue with capability-based dispatch |
| `workflow-runner` | `POST /api/workflows/:id/execute`, `GET/POST /api/execution-runs/:id/*` | Async workflow execution via job queue |
| `api-keys` | `POST/GET/DELETE /api/api-keys` | Key generation, listing, revocation |
| `audit-log` | `GET /api/audit-log` | Immutable write log |
| `webhooks` | `POST/GET/PATCH/DELETE /api/webhooks` | Outbound HTTP event notifications |
| `dashboard` | `GET /api/dashboard` | Aggregated statistics |
| `alerts` | `GET/POST/PATCH/DELETE /api/alert-rules` | Threshold-based alert rules |
| `storage-api` | `PUT/GET/DELETE /api/artifacts/:key` | Binary artifact storage |
| `jobs` | `GET /api/jobs`, `GET /api/jobs/:id` | Background job visibility |
| `openapi` | `GET /api/docs`, `GET /api/openapi.json` | Swagger UI + spec |
| `metrics` | `GET /metrics` | Prometheus metrics |
| `sse` | `GET /events/stream` | Server-Sent Events bus |
| `github` | `POST /github/webhook` | GitHub webhook ingestion |
| `slack` | `POST /slack/events` | Slack event ingestion |

### Request pipeline

```
Request
  → Static files (dashboard bundle)
  → Raw-body capture (GitHub/Slack HMAC)
  → express.json() body parser
  → Request logging middleware
  → Auth middleware (validates Bearer token against api_keys table)
  → Rate-limit middleware
  → Audit-logger middleware
  → Route sub-apps
  → SPA catch-all (serves index.html)
  → Centralised error handler
```

---

## Core Layer (`packages/core`)

All database access is isolated here. No HTTP code touches SQLite directly.

### Database

- **Engine:** SQLite via `better-sqlite3` (synchronous, zero-dependency)
- **ORM:** Drizzle ORM with type-safe schema definitions in `schema.ts`
- **Migrations:** Run automatically on startup via `runMigrations()`

### Tables

| Table | Purpose |
|-------|---------|
| `agents` | Registered agents and their status/capabilities |
| `tasks` | Work items with lifecycle state and retry tracking |
| `workflows` | Workflow definitions (JSON steps array) |
| `execution_runs` | Live workflow executions with step results |
| `events` | Durable event log for the EventBus |
| `webhooks` | Registered outbound HTTP notification endpoints |
| `api_keys` | Hashed API keys with roles and expiry |
| `audit_log` | Immutable write history |
| `alert_rules` | Threshold-based monitoring rules |
| `alert_states` | Current firing/resolved state per rule |
| `jobs` | Background job queue |
| `storage_objects` | File artifact metadata |

### EventBus

`EventBus` is an in-process pub/sub system backed by the `events` table for durability. All significant state transitions (agent registered, task assigned, task completed, workflow started, etc.) publish events. The SSE sub-app subscribes to all patterns and forwards matching events to connected browser clients.

---

## Task Dispatch

The dispatch algorithm (`queue.ts: dispatchNextTask`) runs synchronously on every `POST /api/tasks/dispatch` call:

1. Load all `pending` tasks, sorted by priority then FIFO.
2. Load all `idle` agents.
3. Count active tasks per agent and globally.
4. For each pending task, find the first idle agent whose capabilities are a superset of `requiredCapabilities`, and that hasn't hit per-agent or global concurrency limits.
5. Assign the task to that agent (`status: assigned`), mark the agent as consumed in memory (to avoid double-dispatch in the same call), and return.

If no task can be dispatched, returns `{ dispatched: false }`.

---

## Workflow Execution

Workflow definitions are DAGs of `WorkflowStep` nodes. Execution is managed by `advanceExecution` in `core`, called repeatedly until the run reaches a terminal state.

```
startExecution() → creates ExecutionRun with status=running
advanceExecution() (called by job worker tick):
  - Find steps whose dependsOn are all completed
  - Evaluate conditions (if any)
  - Dispatch tasks for eligible steps
  - Check approval gates
  - Update run status to completed/failed when all steps settle
```

Step types include `task`, `subworkflow`, and `approval`.

Execution is normally **asynchronous**: `POST /workflows/:id/execute` enqueues a `workflow_execution` job (202 Accepted). The background job worker calls `advanceExecution` in a loop until completion. For testing, pass `sync: true` in the request body.

---

## Background Job Worker

`JobWorker` (`job-worker.ts`) polls the `jobs` table on an interval (default 2 s) and runs registered handlers with configurable concurrency (default 4).

| Job type | Handler | Purpose |
|----------|---------|---------|
| `workflow_execution` | `workflowExecutionHandler` | Drive workflow execution ticks |
| `webhook_delivery` | `webhookDeliveryHandler` | Deliver events to registered webhooks with retries |
| `metric_aggregation` | `metricAggregationHandler` | Evaluate alert rules and fire/resolve alerts |

---

## Authentication & Authorization

- All mutating and read endpoints (except `/health`, `/metrics`, `/events/stream`, `/api/docs`) require `Authorization: Bearer <key>`.
- Keys are stored as SHA-256 hashes. The plaintext is returned once at creation and never persisted.
- RBAC is enforced per-endpoint via the `requireRole` middleware. Roles: `admin > operator > agent > viewer`.
- Set `DISABLE_AUTH=true` to bypass auth (development only).

---

## Observability

| Signal | Mechanism |
|--------|-----------|
| Structured logs | pino (JSON, configurable level via `LOG_LEVEL`) |
| Metrics | Prometheus endpoint at `GET /metrics` |
| Distributed tracing | OpenTelemetry (opt-in via `OTEL_ENABLED=true`) |
| Audit trail | Every write logged to `audit_log` table |
| Real-time events | SSE stream at `GET /events/stream` |

---

## Integrations

### GitHub

When `GITHUB_WEBHOOK_SECRET` is set, the GitHub sub-app is mounted before the JSON body parser so the raw body is available for HMAC signature verification. Verified events are published to the EventBus.

### Slack

Same pattern — mounted before `express.json()` for signature verification when `SLACK_SIGNING_SECRET` is set.

### Webhooks (outbound)

Registered webhooks receive HTTP `POST` deliveries for subscribed event types. Delivery is handled by the `webhook_delivery` job with retry logic. Payloads are signed with an HMAC using the per-webhook secret.

---

## SDK (`packages/sdk`)

Thin typed wrapper over `fetch`. No runtime dependencies. Exposes namespaced methods matching the API surface:

```typescript
client.agents.{create, list, get, update, delete, heartbeat}
client.tasks.{submit, list, get, dispatch, start, complete, fail, retry}
client.workflows.{create, list, get, execute, validate}
client.executionRuns.{get, advance, cancel}
client.webhooks.{create, list, get, update, delete}
client.apiKeys.{create, list, get, revoke}
client.artifacts.{upload, download, delete}
```

---

## Dashboard (`packages/dashboard`)

React + Vite SPA. In development, a Vite dev server proxies `/api` and `/events` to the API server. In production, `pnpm build` outputs the bundle into `packages/api/public/`, which the API serves as static files.

Key views:
- **Agents** — status and heartbeat monitoring
- **Tasks** — queue depth, status distribution, task detail
- **Workflows** — execution run list and step-level drill-down
- **Dashboard** — real-time charts for throughput, failure rate, agent utilisation

---

## Deployment

### Local (development)

```bash
DISABLE_AUTH=true pnpm dev
```

### Production (Node.js)

```bash
pnpm build
pnpm --filter @mission-control/api start
```

### Docker

```bash
docker compose up
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Listen port |
| `DB_PATH` | `./mission-control.db` | SQLite file path |
| `STORAGE_DIR` | `./artifacts` | Artifact storage directory |
| `DISABLE_AUTH` | `false` | Bypass auth (dev only) |
| `LOG_LEVEL` | `info` | pino log level |
| `WORKER_POLL_INTERVAL_MS` | `2000` | Job worker poll interval |
| `WORKER_CONCURRENCY` | `4` | Max concurrent jobs |
| `CACHE_TTL_MS` | `30000` | In-memory cache TTL |
| `CACHE_MAX` | `500` | Cache max entries |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |
| `GITHUB_WEBHOOK_SECRET` | — | GitHub webhook HMAC secret |
| `SLACK_SIGNING_SECRET` | — | Slack signing secret |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry |
| `OTEL_SERVICE_NAME` | `mission-control` | OTEL service name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP collector endpoint |
| `MC_API_URL` | `http://localhost:3000` | CLI/SDK base URL |
| `MC_API_KEY` | — | CLI/SDK API key |
