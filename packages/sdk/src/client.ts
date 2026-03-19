import { ApiError } from './errors.js';

export interface ClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  status: 'idle' | 'busy' | 'offline';
  metadata?: Record<string, unknown>;
  lastHeartbeatAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  requiredCapabilities?: string[];
  assigneeAgentId?: string | null;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string | null;
  maxRetries?: number;
  retryCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Workflow {
  id: string;
  name: string;
  steps?: unknown[];
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export class MissionControlClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  readonly agents: {
    list: (params?: { capability?: string }) => Promise<Agent[]>;
    get: (id: string) => Promise<Agent>;
    create: (body: { id: string; name: string; capabilities?: string[]; metadata?: Record<string, unknown> }) => Promise<Agent>;
    update: (id: string, body: Partial<Agent>) => Promise<Agent>;
    delete: (id: string) => Promise<void>;
    heartbeat: (id: string) => Promise<Agent>;
  };

  readonly tasks: {
    list: (params?: { status?: string }) => Promise<Task[]>;
    get: (id: string) => Promise<Task>;
    submit: (body: { title: string; description?: string; requiredCapabilities?: string[]; input?: Record<string, unknown>; maxRetries?: number }) => Promise<Task>;
    dispatch: () => Promise<{ dispatched: boolean; task: Task | null }>;
    start: (id: string) => Promise<Task>;
    complete: (id: string, output?: Record<string, unknown>) => Promise<Task>;
    fail: (id: string, error?: string) => Promise<Task>;
    retry: (id: string) => Promise<Task>;
    listDeadLetter: () => Promise<Task[]>;
  };

  readonly workflows: {
    get: (id: string) => Promise<Workflow>;
    create: (body: { name: string; steps?: unknown[] }) => Promise<Workflow>;
    execute: (id: string) => Promise<unknown>;
    validate: (id: string) => Promise<unknown>;
  };

  readonly webhooks: {
    list: () => Promise<Webhook[]>;
    get: (id: string) => Promise<Webhook>;
    create: (body: { url: string; events: string[]; secret: string; active?: boolean }) => Promise<Webhook>;
    update: (id: string, body: Partial<Pick<Webhook, 'url' | 'events' | 'active'>>) => Promise<Webhook>;
    delete: (id: string) => Promise<void>;
  };

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'X-Api-Key': config.apiKey } : {}),
    };

    this.agents = {
      list: (p) => this.get(`/agents${p?.capability ? `?capability=${p.capability}` : ''}`),
      get: (id) => this.get(`/agents/${id}`),
      create: (body) => this.post('/agents', body),
      update: (id, body) => this.patch(`/agents/${id}`, body),
      delete: (id) => this.del(`/agents/${id}`),
      heartbeat: (id) => this.post(`/agents/${id}/heartbeat`, {}),
    };

    this.tasks = {
      list: (p) => this.get(`/tasks${p?.status ? `?status=${p.status}` : ''}`),
      get: (id) => this.get(`/tasks/${id}`),
      submit: (body) => this.post('/tasks', body),
      dispatch: () => this.post('/tasks/dispatch', {}),
      start: (id) => this.post(`/tasks/${id}/start`, {}),
      complete: (id, output) => this.post(`/tasks/${id}/complete`, { output }),
      fail: (id, error) => this.post(`/tasks/${id}/fail`, { error }),
      retry: (id) => this.post(`/tasks/${id}/retry`, {}),
      listDeadLetter: () => this.get('/tasks/dead-letter'),
    };

    this.workflows = {
      get: (id) => this.get(`/workflows/${id}`),
      create: (body) => this.post('/workflows', body),
      execute: (id) => this.post(`/workflows/${id}/execute`, {}),
      validate: (id) => this.get(`/workflows/${id}/validate`),
    };

    this.webhooks = {
      list: () => this.get('/webhooks'),
      get: (id) => this.get(`/webhooks/${id}`),
      create: (body) => this.post('/webhooks', body),
      update: (id, body) => this.patch(`/webhooks/${id}`, body),
      delete: (id) => this.del(`/webhooks/${id}`),
    };
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async patch<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  private async del<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 204) return undefined as T;

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new ApiError(res.status, data);
    }

    return data as T;
  }
}
