import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildWorkflowsCommand } from './workflows.js';
import type { MissionControlClient, Workflow } from '@mission-control/sdk';

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    status: 'idle',
    ...overrides,
  };
}

function makeClient(overrides: Partial<MissionControlClient['workflows']> = {}): MissionControlClient {
  return {
    agents: {} as MissionControlClient['agents'],
    tasks: {} as MissionControlClient['tasks'],
    workflows: {
      get: vi.fn().mockResolvedValue(makeWorkflow()),
      create: vi.fn().mockResolvedValue(makeWorkflow()),
      execute: vi.fn().mockResolvedValue({ runId: 'run-1', status: 'running' }),
      validate: vi.fn().mockResolvedValue({ valid: true }),
      ...overrides,
    },
    webhooks: {} as MissionControlClient['webhooks'],
    get: vi.fn(),
  } as unknown as MissionControlClient;
}

describe('workflows commands', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('workflows create', () => {
    it('calls client.workflows.create with the given name', async () => {
      const client = makeClient();
      const cmd = buildWorkflowsCommand(client);
      await cmd.parseAsync(['create', 'My Pipeline'], { from: 'user' });

      expect(client.workflows.create).toHaveBeenCalledWith({ name: 'My Pipeline' });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('wf-1'));
    });

    it('outputs JSON when --json flag is set', async () => {
      const client = makeClient();
      const cmd = buildWorkflowsCommand(client);
      await cmd.parseAsync(['create', 'Pipeline', '--json'], { from: 'user' });

      const logArg = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logArg)).not.toThrow();
    });
  });

  describe('workflows execute', () => {
    it('calls client.workflows.execute with the given id', async () => {
      const client = makeClient();
      const cmd = buildWorkflowsCommand(client);
      await cmd.parseAsync(['execute', 'wf-1'], { from: 'user' });

      expect(client.workflows.execute).toHaveBeenCalledWith('wf-1');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Execution started:'), expect.any(String));
    });

    it('outputs JSON when --json flag is set', async () => {
      const client = makeClient();
      const cmd = buildWorkflowsCommand(client);
      await cmd.parseAsync(['execute', 'wf-1', '--json'], { from: 'user' });

      const logArg = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logArg)).not.toThrow();
    });
  });

  describe('workflows validate', () => {
    it('calls client.workflows.validate and prints JSON result', async () => {
      const client = makeClient();
      const cmd = buildWorkflowsCommand(client);
      await cmd.parseAsync(['validate', 'wf-1'], { from: 'user' });

      expect(client.workflows.validate).toHaveBeenCalledWith('wf-1');
      const logArg = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logArg)).not.toThrow();
      const parsed = JSON.parse(logArg) as { valid: boolean };
      expect(parsed.valid).toBe(true);
    });
  });
});
