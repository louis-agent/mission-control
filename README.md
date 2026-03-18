# Mission Control

AI-powered mission control system for coordinating autonomous agent workflows and validating multi-agent collaboration patterns.

## Overview

Mission Control is a monorepo containing the core domain logic and API server for managing AI agents, tasks, and workflows.

## Packages

- **`packages/core`** — Core domain models, entities, and business logic
- **`packages/api`** — HTTP API server exposing the mission control interface

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Install

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

### Lint

```bash
pnpm lint
pnpm format:check
```

## Development

Run tests in watch mode:

```bash
pnpm --filter @mission-control/core test:watch
```

## CI

GitHub Actions runs lint, typecheck, and tests on every push and pull request to `main`.
