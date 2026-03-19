import type { TaskHandler } from '../plugin.js';
import type { Task } from '../types.js';

export const httpCallerHandler: TaskHandler = {
  name: 'http-caller',

  canHandle(task: Task): boolean {
    return task.title.startsWith('http:');
  },

  async execute(task: Task): Promise<Record<string, unknown>> {
    const method = String(task.input.method ?? 'GET').toUpperCase();
    const url = String(task.input.url ?? '');
    const headers = (task.input.headers ?? {}) as Record<string, string>;
    const body = task.input.body;
    const timeoutMs = typeof task.input.timeoutMs === 'number' ? task.input.timeoutMs : 30_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
        init.body = JSON.stringify(body);
        (init.headers as Record<string, string>)['content-type'] ??= 'application/json';
      }

      const response = await fetch(url, init);
      const text = await response.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep as string */ }

      return {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: parsed,
      };
    } catch (err: unknown) {
      return { error: (err as Error).message };
    } finally {
      clearTimeout(timer);
    }
  },
};
