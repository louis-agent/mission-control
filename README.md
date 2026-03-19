# Mission Control

AI-powered mission control system for coordinating autonomous agent workflows and validating multi-agent collaboration patterns.

## Packages

| Package | Description |
|---|---|
| [`packages/core`](#core) | Core domain models, database layer, and business logic |
| [`packages/api`](#api) | HTTP API server exposing the mission control interface |
| [`packages/cli`](#cli) | Command-line tool (`mc`) for interacting with the API |
| [`packages/sdk`](#sdk) | Type-safe TypeScript/JavaScript client for the API |
| [`packages/dashboard`](#dashboard) | React web dashboard for monitoring agents, tasks, and workflows |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Clients                            │
│   dashboard (React)   cli (mc)   sdk (@mission-control) │
└───────────────┬──────────────┬──────────────┬───────────┘
                │              │              │
                └──────────────▼──────────────┘
                         api (:3000)
                    (Express HTTP server)
                               │
                               ▼
                    core (domain + SQLite DB)
               agents / tasks / workflows / events
```

**Tech stack:**
- **Runtime:** Node.js ≥ 20, TypeScript (ESM)
- **API:** Express, SQLite via Drizzle ORM (`better-sqlite3`)
- **Dashboard:** React + Vite (served as static files by the API in production)
- **Background jobs:** Internal job queue with configurable worker concurrency
- **Observability:** OpenTelemetry (optional), structured JSON logging (pino), Prometheus metrics at `/metrics`
- **Integrations:** GitHub webhooks, Slack event ingestion

### Package roles

- **`core`** — All database access, CRUD helpers, event bus, and domain types. No HTTP layer. Other packages import from here.
- **`api`** — Express server wiring routes to `core` functions. Serves the dashboard static bundle in production. SSE stream at `/events`.
- **`sdk`** — Thin fetch wrapper with typed methods for every API endpoint. Used by the CLI and by external agent code.
- **`cli`** — Commander.js CLI (`mc`) that delegates to the SDK. Reads config from `~/.mc/config.json` or env vars.
- **`dashboard`** — Vite + React SPA. In development, proxies `/api` and `/events` to the API server. In production, built into `packages/api/public` and served statically.

## Quickstart

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

### Install

```bash
pnpm install
```

### Build

```bash
pnpm build
```

This compiles all packages in dependency order.

### Run the dev server

```bash
pnpm dev
```

The API starts on **http://localhost:3000**.

To also run the dashboard in development (with hot-reload):

```bash
# In a second terminal
pnpm --filter @mission-control/dashboard dev
# Open http://localhost:5173
```

### Open the dashboard

In production (after `pnpm build`):

```bash
pnpm --filter @mission-control/api start
# Dashboard available at http://localhost:3000
```

### Docker

```bash
docker compose up
# API + dashboard at http://localhost:3000
```

## API Quickstart

### 1. Create an agent

```bash
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{"id": "agent-1", "name": "My Agent", "capabilities": ["text-generation"]}'
```

### 2. Submit a task

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Summarise report", "requiredCapabilities": ["text-generation"]}'
```

### 3. Dispatch the task to an agent

```bash
curl -X POST http://localhost:3000/tasks/dispatch
# Returns the dispatched task with assigneeAgentId populated
```

### 4. Complete the task

```bash
TASK_ID=<id from dispatch response>
curl -X POST http://localhost:3000/tasks/$TASK_ID/complete \
  -H "Content-Type: application/json" \
  -d '{"output": {"result": "Summary complete"}}'
```

### Using the SDK

```typescript
import { MissionControlClient } from '@mission-control/sdk';

const client = new MissionControlClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',   // omit if DISABLE_AUTH=true
});

// Register an agent
const agent = await client.agents.create({
  id: 'agent-1',
  name: 'My Agent',
  capabilities: ['text-generation'],
});

// Submit a task
const task = await client.tasks.submit({
  title: 'Summarise report',
  requiredCapabilities: ['text-generation'],
});

// Dispatch (assign) it
const { task: dispatched } = await client.tasks.dispatch();

// Complete it
await client.tasks.complete(dispatched!.id, { result: 'Summary complete' });
```

### Using the CLI

```bash
# Configure (or use MC_API_URL / MC_API_KEY env vars instead)
mkdir -p ~/.mc && echo '{"baseUrl":"http://localhost:3000"}' > ~/.mc/config.json

mc agents list
mc tasks submit "Summarise report" --capability text-generation
mc tasks dispatch
mc tasks complete <task-id>
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API server port |
| `DB_PATH` | `./mission-control.db` | SQLite database file path |
| `STORAGE_DIR` | `./artifacts` | Directory for file storage artifacts |
| `DISABLE_AUTH` | `false` | Set `true` to skip API key auth (dev only) |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |
| `WORKER_POLL_INTERVAL_MS` | `2000` | Job worker polling interval |
| `WORKER_CONCURRENCY` | `4` | Maximum concurrent background jobs |
| `CACHE_TTL_MS` | `30000` | In-memory cache TTL |
| `CACHE_MAX` | `500` | In-memory cache max entries |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |
| `GITHUB_WEBHOOK_SECRET` | — | Secret for GitHub webhook HMAC verification (optional) |
| `SLACK_SIGNING_SECRET` | — | Slack signing secret for event ingestion (optional) |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |
| `OTEL_SERVICE_NAME` | `mission-control` | Service name reported to the OTEL collector |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP collector endpoint |
| `MC_API_URL` | `http://localhost:3000` | CLI / SDK base URL |
| `MC_API_KEY` | — | CLI / SDK API key |

## Development

Run tests:

```bash
pnpm test                                       # all packages, once
pnpm --filter @mission-control/core test:watch  # watch mode
pnpm --filter @mission-control/api test:watch
```

Lint and format:

```bash
pnpm lint
pnpm format:check
pnpm format
```

Type-check without emitting:

```bash
pnpm typecheck
```

## CI

GitHub Actions runs lint, typecheck, and tests on every push and pull request to `main`.
