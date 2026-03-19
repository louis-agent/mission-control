import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTasksCommand } from './tasks.js';
import type { MissionControlClient, Task } from '@mission-control/sdk';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    status: 'pending',
    ...overrides,
  };
}

function makeClient(overrides: Partial<MissionControlClient['tasks']> = {}): MissionControlClient {
  return {
    agents: {} as MissionControlClient['agents'],
    tasks: {
      list: vi.fn().mockResolvedValue([makeTask()]),
      get: vi.fn().mockResolvedValue(makeTask()),
      submit: vi.fn().mockResolvedValue(makeTask()),
      dispatch: vi.fn().mockResolvedValue({ dispatched: true, task: makeTask() }),
      start: vi.fn().mockResolvedValue(makeTask()),
      complete: vi.fn().mockResolvedValue(makeTask()),
      fail: vi.fn().mockResolvedValue(makeTask()),
      retry: vi.fn().mockResolvedValue(makeTask()),
      listDeadLetter: vi.fn().mockResolvedValue([]),
      ...overrides,
    },
    workflows: {} as MissionControlClient['workflows'],
    webhooks: {} as MissionControlClient['webhooks'],
    get: vi.fn(),
  } as unknown as MissionControlClient;
}

describe('tasks commands', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('tasks list', () => {
    it('calls client.tasks.list and prints table', async () => {
      const client = makeClient();
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(['list'], { from: 'user' });

      expect(client.tasks.list).toHaveBeenCalledWith({ status: undefined });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ID'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task-1'));
    });

    it('passes status filter to client', async () => {
      const client = makeClient();
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(['list', '--status', 'running'], { from: 'user' });

      expect(client.tasks.list).toHaveBeenCalledWith({ status: 'running' });
    });

    it('outputs JSON when --json flag is set', async () => {
      const client = makeClient();
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(['list', '--json'], { from: 'user' });

      const logArg = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logArg)).not.toThrow();
      const parsed = JSON.parse(logArg) as Task[];
      expect(parsed[0].id).toBe('task-1');
    });

    it('prints message when no tasks found', async () => {
      const client = makeClient({ list: vi.fn().mockResolvedValue([]) });
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(['list'], { from: 'user' });

      expect(consoleSpy).toHaveBeenCalledWith('No tasks found.');
    });
  });

  describe('tasks submit', () => {
    it('calls client.tasks.submit with the given title', async () => {
      const client = makeClient();
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(['submit', 'Do some work'], { from: 'user' });

      expect(client.tasks.submit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Do some work' }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task-1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('pending'));
    });

    it('passes optional description, capabilities, and maxRetries', async () => {
      const client = makeClient();
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(
        ['submit', 'Build', '--description', 'Build the thing', '--capability', 'coding', '--max-retries', '3'],
        { from: 'user' },
      );

      expect(client.tasks.submit).toHaveBeenCalledWith({
        title: 'Build',
        description: 'Build the thing',
        requiredCapabilities: ['coding'],
        maxRetries: 3,
      });
    });

    it('outputs JSON when --json flag is set', async () => {
      const client = makeClient();
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(['submit', 'Work', '--json'], { from: 'user' });

      const logArg = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logArg)).not.toThrow();
    });
  });

  describe('tasks status', () => {
    it('calls client.tasks.get with the given id and prints result', async () => {
      const client = makeClient();
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(['status', 'task-1'], { from: 'user' });

      expect(client.tasks.get).toHaveBeenCalledWith('task-1');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task-1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('pending'));
    });

    it('outputs JSON when --json flag is set', async () => {
      const client = makeClient();
      const cmd = buildTasksCommand(client);
      await cmd.parseAsync(['status', 'task-1', '--json'], { from: 'user' });

      const logArg = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logArg)).not.toThrow();
    });
  });
});
