import { describe, it, expect } from 'vitest';
import { shellExecutorHandler } from './shell-executor.js';
import type { Task } from '../types.js';

function makeTask(cmd: string, args: string[] = []): Task {
  return {
    id: 't1', title: 'shell: run', description: '',
    status: 'running', priority: 'medium',
    requiredCapabilities: [], assigneeAgentId: null,
    workflowId: null, executionRunId: null, stepId: null,
    dependencies: [], input: { command: cmd, args },
    output: {}, errorMessage: null, maxRetries: 0, retryCount: 0,
    retryDelay: 1000, timeoutAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

describe('shell-executor', () => {
  it('canHandle tasks with shell: prefix', () => {
    const task = makeTask('echo');
    task.title = 'shell: echo hello';
    expect(shellExecutorHandler.canHandle(task)).toBe(true);
  });

  it('does NOT handle tasks without shell: prefix', () => {
    const task = makeTask('echo');
    task.title = 'do something';
    expect(shellExecutorHandler.canHandle(task)).toBe(false);
  });

  it('executes a simple command and captures stdout', async () => {
    const task = makeTask('echo', ['hello']);
    task.title = 'shell: echo hello';
    const output = await shellExecutorHandler.execute(task);
    expect(output.exitCode).toBe(0);
    expect(String(output.stdout).trim()).toBe('hello');
    expect(output.stderr).toBe('');
  });

  it('returns non-zero exit code on failure', async () => {
    const task = makeTask('false');
    task.title = 'shell: false';
    const output = await shellExecutorHandler.execute(task);
    expect(output.exitCode).not.toBe(0);
  });
});
