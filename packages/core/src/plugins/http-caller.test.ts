import { describe, it, expect, vi } from 'vitest';
import { httpCallerHandler } from './http-caller.js';
import type { Task } from '../types.js';

function makeTask(method: string, url: string, body?: unknown): Task {
  return {
    id: 't1', title: 'http: POST https://example.com/api', description: '',
    status: 'running', priority: 'medium',
    requiredCapabilities: [], assigneeAgentId: null,
    workflowId: null, executionRunId: null, stepId: null,
    dependencies: [], input: { method, url, body },
    output: {}, errorMessage: null, maxRetries: 0, retryCount: 0,
    retryDelay: 1000, timeoutAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

describe('http-caller', () => {
  it('canHandle tasks with http: prefix', () => {
    const task = makeTask('GET', 'https://example.com');
    expect(httpCallerHandler.canHandle(task)).toBe(true);
  });

  it('does NOT handle tasks without http: prefix', () => {
    const task = makeTask('GET', 'https://example.com');
    task.title = 'do something';
    expect(httpCallerHandler.canHandle(task)).toBe(false);
  });

  it('makes HTTP GET and returns status + body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"ok":true}',
    });
    vi.stubGlobal('fetch', mockFetch);

    const task = makeTask('GET', 'https://api.example.com/data');
    const output = await httpCallerHandler.execute(task);

    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', expect.objectContaining({ method: 'GET' }));
    expect(output.statusCode).toBe(200);
    expect(output.body).toEqual({ ok: true });
    vi.unstubAllGlobals();
  });

  it('returns error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const task = makeTask('GET', 'https://unreachable.example.com');
    const output = await httpCallerHandler.execute(task);
    expect(output.error).toMatch('network error');
    vi.unstubAllGlobals();
  });
});
