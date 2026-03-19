# API Reference

Base URL: `http://localhost:3000`

All API routes are under the `/api` prefix.
Interactive documentation (Swagger UI) is available at **`/api/docs`**.
Raw OpenAPI spec: **`/api/openapi.json`**.

---

## Authentication

All endpoints (except `/health`, `/metrics`, `/events/stream`, and `/api/docs`) require a Bearer token:

```
Authorization: Bearer <api-key>
```

Pass `DISABLE_AUTH=true` at startup to skip auth checks in development.

### Roles

| Role | Permissions |
|------|------------|
| `admin` | Full access including key management |
| `operator` | Create/update agents, tasks, workflows, webhooks |
| `agent` | Start/complete/fail tasks assigned to the agent |
| `viewer` | Read-only access |

---

## System

### `GET /health`

Health check. No authentication required.

**Response 200**

```json
{ "status": "ok" }
```

---

### `GET /metrics`

Prometheus metrics. No authentication required.

---

## Agents

Agents are workers that execute tasks. Each agent has a set of capabilities and a lifecycle status.

### Agent object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Agent identifier (set by caller on registration) |
| `name` | string | Human-readable name |
| `capabilities` | string[] | List of capability tags |
| `status` | `idle` \| `busy` \| `offline` | Current availability |
| `metadata` | object | Arbitrary key-value metadata |
| `lastHeartbeatAt` | datetime \| null | Last heartbeat timestamp |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

---

### `POST /api/agents`

Register a new agent.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique agent ID |
| `name` | string | yes | Display name |
| `capabilities` | string[] | no | Capability tags (default: `[]`) |
| `status` | string | no | Initial status (default: `idle`) |
| `metadata` | object | no | Arbitrary metadata |

**Responses**

| Status | Description |
|--------|-------------|
| 201 | Agent created — returns Agent object |
| 400 | Validation error |
| 409 | Agent ID already exists |

---

### `GET /api/agents`

List all registered agents.

**Query parameters**

| Param | Type | Description |
|-------|------|-------------|
| `capability` | string | Filter to agents with this capability |

**Response 200** — array of Agent objects.

---

### `GET /api/agents/:id`

Get a single agent by ID.

**Responses:** 200 Agent | 404 Not found

---

### `PATCH /api/agents/:id`

Update agent fields.

**Request body** (all optional)

| Field | Type |
|-------|------|
| `name` | string |
| `capabilities` | string[] |
| `status` | `idle` \| `busy` \| `offline` |
| `metadata` | object |

**Responses:** 200 updated Agent | 404 Not found

---

### `DELETE /api/agents/:id`

Deregister an agent. Returns 204 No Content.

---

### `POST /api/agents/:id/heartbeat`

Ping an agent to confirm it is alive. Updates `lastHeartbeatAt`.

**Response 200** — updated Agent object.

---

## Tasks

Tasks are units of work queued for execution. The scheduler matches pending tasks to idle agents by capability.

### Task object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Task UUID |
| `title` | string | Short description |
| `description` | string | Long description |
| `status` | string | See lifecycle below |
| `priority` | `critical` \| `high` \| `medium` \| `low` | Dispatch priority |
| `requiredCapabilities` | string[] | Capabilities needed to run this task |
| `assigneeAgentId` | string \| null | Agent assigned (null when pending) |
| `workflowId` | string \| null | Parent workflow, if any |
| `dependencies` | string[] | IDs of tasks that must complete first |
| `input` | object | Input payload |
| `output` | object | Output payload (set on completion) |
| `errorMessage` | string \| null | Failure message |
| `maxRetries` | integer | Max automatic retry attempts |
| `retryCount` | integer | Retry attempts so far |
| `retryDelay` | integer | Delay (ms) between retries |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

### Task lifecycle

```
pending → assigned → running → completed
                              ↘ failed → dead_letter
                              ↘ cancelled
```

Automatic retries: if `maxRetries > 0` and a running task fails, it returns to `pending` until the retry limit is hit, then transitions to `dead_letter`.

---

### `POST /api/tasks`

Submit a new task.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Short title |
| `description` | string | no | Long description |
| `priority` | string | no | Default: `medium` |
| `requiredCapabilities` | string[] | no | Capability tags |
| `workflowId` | string | no | Associate with workflow |
| `dependencies` | string[] | no | Task IDs that must complete first |
| `input` | object | no | Arbitrary input data |
| `maxRetries` | integer | no | Max retries (default: 0) |
| `retryDelay` | integer | no | Retry delay in ms (default: 1000) |
| `id` | string | no | Set explicit ID |

**Responses:** 201 Task | 400 Validation error

---

### `GET /api/tasks`

List tasks.

**Query parameters**

| Param | Description |
|-------|-------------|
| `status` | Filter by status (`pending`, `assigned`, `running`, `completed`, `failed`, `dead_letter`, `cancelled`) |

**Response 200** — array of Task objects.

---

### `GET /api/tasks/dead-letter`

List tasks in the dead-letter queue (exhausted all retries).

**Response 200** — array of Task objects.

---

### `GET /api/tasks/:id`

Get a single task.

**Responses:** 200 Task | 404 Not found

---

### `POST /api/tasks/dispatch`

Find the highest-priority pending task whose capabilities are satisfied by an idle agent, and assign it.

Respects optional quota config (set via `QueueQuotas` at server startup):
- `maxTasksPerAgent` — max concurrent active tasks per agent
- `globalConcurrencyLimit` — max concurrent active tasks across all agents

**Response 200**

```json
{ "dispatched": true, "task": { ...Task } }
// or
{ "dispatched": false, "task": null }
```

---

### `POST /api/tasks/:id/start`

Transition a task from `assigned` → `running`. Called by the assigned agent when it begins execution.

**Responses:** 200 Task | 404 Not found | 409 Wrong status

---

### `POST /api/tasks/:id/complete`

Transition a task from `running` → `completed`.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `output` | object | no |

**Responses:** 200 Task | 404 Not found | 409 Wrong status

---

### `POST /api/tasks/:id/fail`

Transition a task from `running` → `failed` (or re-queue for retry if `maxRetries > 0`).

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `error` | string | no |

**Responses:** 200 Task | 404 Not found | 409 Wrong status

---

### `POST /api/tasks/:id/retry`

Manually re-queue a `dead_letter` task back to `pending`.

**Responses:** 200 Task | 404 Not found | 409 Not in dead_letter status

---

### `DELETE /api/tasks/:id/dead-letter`

Cancel (discard) a dead-lettered task. Sets status to `cancelled`.

**Responses:** 200 Task | 404 Not found | 409 Not in dead_letter status

---

## Workflows

Workflows compose tasks into directed acyclic graphs (DAGs) with dependency ordering, conditions, and approval gates.

### Workflow object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | |
| `name` | string | |
| `steps` | WorkflowStep[] | Ordered step definitions |
| `status` | `pending` \| `running` \| `completed` \| `failed` | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

### WorkflowStep object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Step identifier (unique within workflow) |
| `name` | string | yes | Display name |
| `type` | string | yes | Step type (`task`, `subworkflow`, `approval`, etc.) |
| `config` | object | no | Step-type-specific config |
| `dependsOn` | string[] | no | Step IDs that must complete before this one |
| `requiredCapabilities` | string[] | no | Capabilities for task steps |
| `condition` | string | no | Boolean expression controlling conditional execution |
| `subworkflowId` | string | no | Referenced subworkflow (when `type=subworkflow`) |
| `timeoutMs` | integer | no | Step-level timeout |
| `approvalTimeoutHours` | number | no | Approval gate timeout |

---

### `POST /api/workflows`

Create a new workflow definition.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `id` | string | no (auto-generated) |
| `name` | string | yes |
| `steps` | WorkflowStep[] | no |

**Responses:** 201 Workflow | 400 Validation error

---

### `GET /api/workflows`

List all workflow definitions.

---

### `GET /api/workflows/:id`

Get a workflow definition.

**Responses:** 200 Workflow | 404 Not found

---

### `GET /api/workflows/:id/validate`

Validate a workflow (check for cycles, missing dependencies, etc.).

**Response 200**

```json
{ "valid": true }
// or
{ "valid": false, "errors": ["..."] }
```

---

### `POST /api/workflows/:id/execute`

Start a workflow execution (async by default).

**Request body**

| Field | Type | Description |
|-------|------|-------------|
| `timeoutMs` | integer | Optional global execution timeout |
| `sync` | boolean | Run synchronously (dev/test only) |

**Response 202** — job ID for async execution:
```json
{ "jobId": "...", "status": "pending" }
```

**Response 201** (sync mode) — ExecutionRun object.

---

## Execution Runs

An ExecutionRun tracks a live workflow execution with step-level results.

### ExecutionRun object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | |
| `workflowId` | string | |
| `status` | `pending` \| `running` \| `completed` \| `failed` \| `cancelled` | |
| `stepResults` | StepResult[] | Per-step status and output |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

---

### `GET /api/execution-runs/:id`

Get an execution run with step results.

**Responses:** 200 ExecutionRun | 404 Not found

---

### `POST /api/execution-runs/:id/advance`

Tick the execution engine — check for newly completed tasks and advance steps.

**Response 200** — updated ExecutionRun.

---

### `POST /api/execution-runs/:id/cancel`

Cancel a running execution.

**Responses:** 200 ExecutionRun | 404 Not found | 409 Invalid state transition

---

### `POST /api/execution-runs/:id/steps/:stepId/approve`

Approve an approval gate step. Execution continues past this step.

---

### `POST /api/execution-runs/:id/steps/:stepId/reject`

Reject an approval gate step. Execution is halted.

---

## Events (SSE)

### `GET /events/stream`

Server-Sent Events stream for real-time updates. No API prefix — connect directly at the root.

**Query parameters**

| Param | Description |
|-------|-------------|
| `types` | Comma-separated event type patterns to filter (e.g. `task.*,agent.updated`) |

**Response** — `text/event-stream` with events:

```
data: {"id":"...","type":"task.assigned","payload":{...},"timestamp":"..."}
```

No authentication required (safe for browser `EventSource`).

---

## Webhooks

Register HTTP endpoints to receive event notifications.

### Webhook object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | |
| `url` | string | Delivery URL |
| `events` | string[] | Event type patterns to subscribe to |
| `active` | boolean | Whether deliveries are enabled |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

> Note: `secret` is never returned in API responses.

---

### `POST /api/webhooks`

Register a webhook.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string (URI) | yes | Delivery endpoint |
| `events` | string[] | yes | At least one event type |
| `secret` | string | yes | Min 8 chars — used for HMAC signature verification |
| `active` | boolean | no | Default: `true` |

**Responses:** 201 Webhook | 400 Validation error

---

### `GET /api/webhooks`

List all webhooks.

---

### `GET /api/webhooks/:id`

Get a webhook.

---

### `PATCH /api/webhooks/:id`

Update a webhook (url, events, secret, active).

---

### `DELETE /api/webhooks/:id`

Delete a webhook. Returns 204.

---

## API Keys

API keys authenticate all requests. Keys are hashed at rest — the plaintext is returned only at creation.

### API key object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | |
| `name` | string | |
| `role` | `admin` \| `operator` \| `agent` \| `viewer` | |
| `agentId` | string \| null | Associated agent |
| `expiresAt` | datetime \| null | Optional expiry |
| `revokedAt` | datetime \| null | Null if active |
| `createdAt` | datetime | |

---

### `POST /api/api-keys` *(admin only)*

Create a new API key.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `name` | string | yes |
| `role` | string | no (default: `viewer`) |
| `agentId` | string | no |
| `expiresAt` | datetime | no |

**Response 201**

```json
{
  "key": { ...ApiKey },
  "plaintext": "mc_xxxxxxxxxxxxxxxx"
}
```

---

### `GET /api/api-keys` *(admin only)*

List all API keys (without plaintext).

---

### `GET /api/api-keys/:id` *(admin only)*

Get an API key.

---

### `DELETE /api/api-keys/:id` *(admin only)*

Revoke an API key. Returns 204.

---

## Audit Log

Immutable record of all write operations.

### `GET /api/audit-log` *(admin/operator)*

**Query parameters**

| Param | Description |
|-------|-------------|
| `actorId` | Filter by actor ID |
| `resourceType` | Filter by resource type (`agent`, `task`, etc.) |
| `limit` | Max entries (default: 50) |

**Response 200** — array of audit log entries.

---

## Dashboard

### `GET /api/dashboard`

Returns aggregated statistics for the dashboard UI.

**Response 200**

```json
{
  "agentUtilization": {
    "total": 3,
    "idle": 2,
    "busy": 1,
    "offline": 0
  },
  "taskThroughput": {
    "completedLastHour": 12,
    "completedLastDay": 87
  },
  "failureRate": 0.03,
  "queueDepth": 4,
  "activeWorkflows": 2,
  "taskTimeSeries": [...],
  "workflowTimeSeries": [...]
}
```

---

## Artifacts (Storage)

Binary file storage for task inputs/outputs.

### `PUT /api/artifacts/:key`

Upload an artifact. Body is the raw file bytes. `Content-Type` header is preserved.

**Response 201**

```json
{ "key": "reports/q1.pdf", "url": "/api/artifacts/reports/q1.pdf" }
```

---

### `GET /api/artifacts/:key`

Download an artifact.

**Responses:** 200 file bytes | 404 Not found

---

### `DELETE /api/artifacts/:key`

Delete an artifact. Returns 204.

---

## Jobs

Background job queue for async operations (workflow execution, webhook delivery, metric aggregation).

### `GET /api/jobs`

List background jobs.

### `GET /api/jobs/:id`

Get a job by ID.

---

## Error Responses

All errors follow this shape:

```json
{
  "error": "Human-readable message"
}
```

Validation errors (400) include details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": ["title"], "message": "Required" }]
  }
}
```

### Common status codes

| Status | Meaning |
|--------|---------|
| 400 | Validation error |
| 401 | Missing or invalid API key |
| 403 | Insufficient role |
| 404 | Resource not found |
| 409 | Conflict (duplicate ID, wrong lifecycle state) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
