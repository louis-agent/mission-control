# Quickstart Guide

Get Mission Control up and running in minutes.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- Git

## 1. Install Dependencies

```bash
git clone https://github.com/louis-agent/mission-control.git
cd mission-control
pnpm install
```

## 2. Build

```bash
pnpm build
```

## 3. Start the Server

```bash
pnpm dev
```

The API starts on **http://localhost:3000**.

> **Skip auth in development:** set `DISABLE_AUTH=true` to bypass API key checks.
>
> ```bash
> DISABLE_AUTH=true pnpm dev
> ```

## 4. Register an Agent

An **agent** is a worker that can be assigned tasks. Each agent declares a set of **capabilities** (strings) used for task matching.

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "agent-1",
    "name": "My First Agent",
    "capabilities": ["text-generation"]
  }'
```

Response:

```json
{
  "id": "agent-1",
  "name": "My First Agent",
  "capabilities": ["text-generation"],
  "status": "idle",
  "metadata": {},
  "lastHeartbeatAt": null,
  "createdAt": "2026-03-19T00:00:00.000Z",
  "updatedAt": "2026-03-19T00:00:00.000Z"
}
```

## 5. Submit a Task

A **task** represents a unit of work. The `requiredCapabilities` field determines which agents are eligible to receive it.

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Summarise the quarterly report",
    "description": "Read Q1 report and produce a 3-sentence summary.",
    "requiredCapabilities": ["text-generation"],
    "priority": "high"
  }'
```

Response:

```json
{
  "id": "task-uuid",
  "title": "Summarise the quarterly report",
  "status": "pending",
  "priority": "high",
  "requiredCapabilities": ["text-generation"],
  "assigneeAgentId": null,
  ...
}
```

## 6. Dispatch the Task

Dispatch finds the highest-priority pending task whose required capabilities are covered by an idle agent, and assigns it.

```bash
curl -X POST http://localhost:3000/api/tasks/dispatch
```

Response:

```json
{
  "dispatched": true,
  "task": {
    "id": "task-uuid",
    "status": "assigned",
    "assigneeAgentId": "agent-1",
    ...
  }
}
```

## 7. Run the Task

The assigned agent transitions the task to `running` when it picks it up:

```bash
curl -X POST http://localhost:3000/api/tasks/task-uuid/start
```

## 8. Complete the Task

When the agent finishes, it reports the output:

```bash
curl -X POST http://localhost:3000/api/tasks/task-uuid/complete \
  -H "Content-Type: application/json" \
  -d '{"output": {"summary": "Q1 revenue grew 12%..."}}'
```

## 9. View in the Dashboard

Open **http://localhost:3000** in your browser to see the real-time dashboard showing agent utilisation, task throughput, and workflow status.

---

## Using the TypeScript SDK

The `@mission-control/sdk` package provides a fully typed client.

```typescript
import { MissionControlClient } from '@mission-control/sdk';

const client = new MissionControlClient({
  baseUrl: 'http://localhost:3000',
  // apiKey: 'mc_...',  // omit when DISABLE_AUTH=true
});

// Register an agent
const agent = await client.agents.create({
  id: 'agent-1',
  name: 'My First Agent',
  capabilities: ['text-generation'],
});

// Submit a task
const task = await client.tasks.submit({
  title: 'Summarise the quarterly report',
  requiredCapabilities: ['text-generation'],
  priority: 'high',
});

// Dispatch the task to an agent
const { task: dispatched } = await client.tasks.dispatch();

// Start and complete
await client.tasks.start(dispatched!.id);
await client.tasks.complete(dispatched!.id, { summary: 'Q1 revenue grew 12%...' });
```

---

## Using the CLI

```bash
# Set connection details
export MC_API_URL=http://localhost:3000

mc agents list
mc tasks submit "Summarise the quarterly report" --capability text-generation
mc tasks dispatch
mc tasks complete <task-id>
```

Or write a config file:

```bash
mkdir -p ~/.mc
echo '{"baseUrl":"http://localhost:3000"}' > ~/.mc/config.json
```

---

## Running a Workflow

Workflows chain tasks together with dependencies, conditions, and approval gates.

### 1. Define a workflow

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "id": "summarise-and-translate",
    "name": "Summarise then Translate",
    "steps": [
      {
        "id": "summarise",
        "name": "Summarise",
        "type": "task",
        "requiredCapabilities": ["text-generation"]
      },
      {
        "id": "translate",
        "name": "Translate to French",
        "type": "task",
        "requiredCapabilities": ["translation"],
        "dependsOn": ["summarise"]
      }
    ]
  }'
```

### 2. Execute the workflow

```bash
curl -X POST http://localhost:3000/api/workflows/summarise-and-translate/execute
```

This returns a job ID. The execution runs asynchronously. Poll the execution run for status:

```bash
curl http://localhost:3000/api/execution-runs/<run-id>
```

---

## Authentication

By default, all endpoints require a **Bearer token** (`Authorization: Bearer <key>`).

### Create an API key

```bash
# Requires an existing admin key
curl -X POST http://localhost:3000/api/api-keys \
  -H "Authorization: Bearer <admin-key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent-key", "role": "agent"}'
```

The response includes the plaintext key — store it securely, it is never shown again.

Available roles: `admin`, `operator`, `agent`, `viewer`.

---

## Docker

```bash
docker compose up
# API + dashboard at http://localhost:3000
```

---

## Interactive API Docs

Swagger UI is available at **http://localhost:3000/api/docs** once the server is running.

The raw OpenAPI spec is at **http://localhost:3000/api/openapi.json**.
