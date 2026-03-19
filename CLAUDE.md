# Mission Control — CLAUDE.md

## Project Overview

Mission Control is a TypeScript monorepo providing the core infrastructure for coordinating autonomous AI agent workflows. It exposes an HTTP API for managing agents, tasks, workflows, and events with SQLite persistence.

## Architecture

```
packages/
  core/   — Domain models, Drizzle ORM schema, CRUD operations, event bus
  api/    — HTTP API server, agent registry, task queue
```

- **Persistence**: SQLite via Drizzle ORM (better-sqlite3)
- **Runtime**: Node.js >= 20, TypeScript (ESM)
- **Package manager**: pnpm workspaces

### Key Modules

| Module | Purpose |
|--------|---------|
| `core/src/schema.ts` | Drizzle table definitions |
| `core/src/types.ts` | Domain type definitions |
| `core/src/crud-*.ts` | Entity-specific CRUD (agents, tasks, workflows, execution-runs, events) |
| `core/src/crud.ts` | Re-export barrel for all CRUD modules |
| `core/src/event-bus.ts` | In-process pub/sub with SQLite persistence |
| `core/src/db.ts` | Database initialisation |
| `api/src/registry.ts` | Agent registry service |
| `api/src/queue.ts` | Task queue with dispatch and assignment |

## Setup and Installation

```bash
pnpm install
pnpm build
```

## Running Tests

```bash
pnpm test                          # run all tests once
pnpm --filter @mission-control/core test:watch   # watch mode
```

## Linting and Formatting

```bash
pnpm lint          # ESLint
pnpm format:check  # Prettier dry-run
pnpm format        # Prettier write
```

## Key Conventions

- **Imports**: Use `.js` extension for all local imports (ESM compatibility)
- **CRUD split**: Each entity has its own `crud-<entity>.ts` file; `crud.ts` is a re-export barrel
- **JSON columns**: SQLite stores JSON as text; use `toJson`/`fromJson` from `json-utils.ts`
- **Tests**: Colocated with source files (e.g., `crud.test.ts` tests `crud.ts`)
- **File size limit**: 300 lines max per file; split into focused modules if exceeded
- **Function size limit**: 50 lines max; extract sub-functions as needed

## Deployment

No deployment configured yet. Runs locally via `node dist/index.js` per package.

## CI

GitHub Actions (`.github/workflows/`) runs lint, typecheck, and tests on every push and PR to `main`.
