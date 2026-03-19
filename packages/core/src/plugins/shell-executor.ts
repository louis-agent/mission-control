import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TaskHandler } from '../plugin.js';
import type { Task } from '../types.js';

const execFileAsync = promisify(execFile);

export const shellExecutorHandler: TaskHandler = {
  name: 'shell-executor',

  canHandle(task: Task): boolean {
    return task.title.startsWith('shell:');
  },

  async execute(task: Task): Promise<Record<string, unknown>> {
    const command = String(task.input.command ?? '');
    const args = Array.isArray(task.input.args) ? task.input.args.map(String) : [];
    const timeoutMs = typeof task.input.timeoutMs === 'number' ? task.input.timeoutMs : 30_000;

    try {
      const { stdout, stderr } = await execFileAsync(command, args, { timeout: timeoutMs });
      return { exitCode: 0, stdout, stderr };
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
      return {
        exitCode: e.code ?? 1,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? e.message ?? '',
      };
    }
  },
};
