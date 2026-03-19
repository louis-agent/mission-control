import express, { type Application, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Mission Control API',
    version: '0.1.0',
    description: 'HTTP API for coordinating autonomous AI agent workflows',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
    },
    schemas: {
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          capabilities: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['idle', 'busy', 'offline'] },
          metadata: { type: 'object' },
          lastHeartbeatAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled', 'dead_letter'] },
          requiredCapabilities: { type: 'array', items: { type: 'string' } },
          assigneeAgentId: { type: 'string', nullable: true },
          workflowId: { type: 'string', nullable: true },
          input: { type: 'object' },
          output: { type: 'object' },
          errorMessage: { type: 'string', nullable: true },
          maxRetries: { type: 'integer' },
          retryCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Workflow: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          steps: { type: 'array', items: { $ref: '#/components/schemas/WorkflowStep' } },
          status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      WorkflowStep: {
        type: 'object',
        required: ['id', 'name', 'type'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
          config: { type: 'object' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          requiredCapabilities: { type: 'array', items: { type: 'string' } },
        },
      },
      Webhook: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string' } },
          active: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          source: { type: 'string' },
          payload: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['System'],
        security: [],
        responses: { '200': { description: 'Service healthy' } },
      },
    },
    '/agents': {
      get: { summary: 'List agents', tags: ['Agents'], parameters: [{ name: 'capability', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'List of agents' } } },
      post: { summary: 'Register agent', tags: ['Agents'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' }, capabilities: { type: 'array', items: { type: 'string' } } } } } } }, responses: { '201': { description: 'Created' }, '409': { description: 'Conflict' } } },
    },
    '/agents/{id}': {
      get: { summary: 'Get agent', tags: ['Agents'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Agent' }, '404': { description: 'Not found' } } },
      patch: { summary: 'Update agent', tags: ['Agents'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Updated' } } },
      delete: { summary: 'Deregister agent', tags: ['Agents'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Deleted' }, '404': { description: 'Not found' } } },
    },
    '/agents/{id}/heartbeat': {
      post: { summary: 'Agent heartbeat', tags: ['Agents'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } },
    },
    '/tasks': {
      get: { summary: 'List tasks', tags: ['Tasks'], parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Tasks' } } },
      post: { summary: 'Submit task', tags: ['Tasks'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, description: { type: 'string' }, requiredCapabilities: { type: 'array', items: { type: 'string' } }, maxRetries: { type: 'integer' } } } } } }, responses: { '201': { description: 'Created' } } },
    },
    '/tasks/dispatch': { post: { summary: 'Dispatch next task', tags: ['Tasks'], responses: { '200': { description: 'Dispatch result' } } } },
    '/tasks/dead-letter': { get: { summary: 'List dead-lettered tasks', tags: ['Tasks'], responses: { '200': { description: 'Dead-letter queue' } } } },
    '/tasks/{id}': { get: { summary: 'Get task', tags: ['Tasks'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Task' }, '404': { description: 'Not found' } } } },
    '/tasks/{id}/start': { post: { summary: 'Start task', tags: ['Tasks'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Task' } } } },
    '/tasks/{id}/complete': { post: { summary: 'Complete task', tags: ['Tasks'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { output: { type: 'object' } } } } } }, responses: { '200': { description: 'Task' } } } },
    '/tasks/{id}/fail': { post: { summary: 'Fail task', tags: ['Tasks'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } } }, responses: { '200': { description: 'Task' } } } },
    '/tasks/{id}/retry': { post: { summary: 'Retry dead-lettered task', tags: ['Tasks'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Task' } } } },
    '/webhooks': {
      get: { summary: 'List webhooks', tags: ['Webhooks'], responses: { '200': { description: 'Webhooks' } } },
      post: { summary: 'Register webhook', tags: ['Webhooks'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['url', 'events', 'secret'], properties: { url: { type: 'string', format: 'uri' }, events: { type: 'array', items: { type: 'string' } }, secret: { type: 'string', minLength: 8 } } } } } }, responses: { '201': { description: 'Created' } } },
    },
    '/webhooks/{id}': {
      get: { summary: 'Get webhook', tags: ['Webhooks'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Webhook' }, '404': { description: 'Not found' } } },
      patch: { summary: 'Update webhook', tags: ['Webhooks'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Updated' } } },
      delete: { summary: 'Delete webhook', tags: ['Webhooks'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Deleted' }, '404': { description: 'Not found' } } },
    },
    '/events/stream': {
      get: { summary: 'SSE event stream', tags: ['Events'], security: [], parameters: [{ name: 'types', in: 'query', description: 'Comma-separated event type patterns', schema: { type: 'string' } }], responses: { '200': { description: 'Server-Sent Events stream', content: { 'text/event-stream': { schema: { type: 'string' } } } } } },
    },
    '/execution-runs/{id}': { get: { summary: 'Get execution run', tags: ['Workflows'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Execution run' }, '404': { description: 'Not found' } } } },
    '/execution-runs/{id}/advance': { post: { summary: 'Advance execution run', tags: ['Workflows'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Run' } } } },
    '/execution-runs/{id}/cancel': { post: { summary: 'Cancel execution run', tags: ['Workflows'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Run' } } } },
    '/workflows/{id}/execute': { post: { summary: 'Start workflow execution', tags: ['Workflows'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Execution run' } } } },
    '/workflows/{id}/validate': { get: { summary: 'Validate workflow', tags: ['Workflows'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Validation result' } } } },
    '/api-keys': {
      get: { summary: 'List API keys', tags: ['Security'], responses: { '200': { description: 'API keys' } } },
      post: { summary: 'Create API key', tags: ['Security'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, role: { type: 'string', enum: ['admin', 'operator', 'agent', 'viewer'] }, agentId: { type: 'string' } } } } } }, responses: { '201': { description: 'Created with plaintext key' } } },
    },
    '/api-keys/{id}': {
      get: { summary: 'Get API key', tags: ['Security'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'API key' }, '404': { description: 'Not found' } } },
      delete: { summary: 'Revoke API key', tags: ['Security'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Revoked' } } },
    },
    '/audit-log': {
      get: { summary: 'List audit log entries', tags: ['Security'], parameters: [{ name: 'actorId', in: 'query', schema: { type: 'string' } }, { name: 'resourceType', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: 'Audit log entries' } } },
    },
  },
} as const;

export function createOpenApiApp(): Application {
  const app = express();
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec as object));
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });
  return app;
}
