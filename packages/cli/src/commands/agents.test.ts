import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildAgentsCommand } from './agents.js';
import type { MissionControlClient, Agent } from '@mission-control/sdk';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'TestBot',
    capabilities: [],
    status: 'idle',
    ...overrides,
  };
}

function makeClient(overrides: Partial<MissionControlClient['agents']> = {}): MissionControlClient {
  return {
    agents: {
      list: vi.fn().mockResolvedValue([makeAgent()]),
      get: vi.fn().mockResolvedValue(makeAgent()),
      create: vi.fn().mockResolvedValue(makeAgent()),
      update: vi.fn().mockResolvedValue(makeAgent()),
      delete: vi.fn().mockResolvedValue(undefined),
      heartbeat: vi.fn().mockResolvedValue(makeAgent()),
      ...overrides,
    },
    tasks: {} as MissionControlClient['tasks'],
    workflows: {} as MissionControlClient['workflows'],
    webhooks: {} as MissionControlClient['webhooks'],
    get: vi.fn(),
  } as unknown as MissionControlClient;
}

describe('agents commands', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('agents list', () => {
    it('calls client.agents.list and prints table', async () => {
      const client = makeClient();
      const cmd = buildAgentsCommand(client);
      await cmd.parseAsync(['list'], { from: 'user' });

      expect(client.agents.list).toHaveBeenCalledWith({ capability: undefined });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ID'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('agent-1'));
    });

    it('passes capability filter to client', async () => {
      const client = makeClient();
      const cmd = buildAgentsCommand(client);
      await cmd.parseAsync(['list', '--capability', 'coding'], { from: 'user' });

      expect(client.agents.list).toHaveBeenCalledWith({ capability: 'coding' });
    });

    it('outputs JSON when --json flag is set', async () => {
      const client = makeClient();
      const cmd = buildAgentsCommand(client);
      await cmd.parseAsync(['list', '--json'], { from: 'user' });

      const logArg = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logArg)).not.toThrow();
      const parsed = JSON.parse(logArg) as Agent[];
      expect(parsed[0].id).toBe('agent-1');
    });

    it('prints message when no agents found', async () => {
      const client = makeClient({ list: vi.fn().mockResolvedValue([]) });
      const cmd = buildAgentsCommand(client);
      await cmd.parseAsync(['list'], { from: 'user' });

      expect(consoleSpy).toHaveBeenCalledWith('No agents registered.');
    });
  });

  describe('agents register', () => {
    it('calls client.agents.create with id and name', async () => {
      const client = makeClient();
      const cmd = buildAgentsCommand(client);
      await cmd.parseAsync(['register', 'agent-2', 'MyBot'], { from: 'user' });

      expect(client.agents.create).toHaveBeenCalledWith({
        id: 'agent-2',
        name: 'MyBot',
        capabilities: [],
      });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('agent-2'));
    });

    it('passes capabilities to client', async () => {
      const client = makeClient();
      const cmd = buildAgentsCommand(client);
      await cmd.parseAsync(['register', 'a1', 'Bot', '--capability', 'coding', 'testing'], { from: 'user' });

      expect(client.agents.create).toHaveBeenCalledWith({
        id: 'a1',
        name: 'Bot',
        capabilities: ['coding', 'testing'],
      });
    });

    it('outputs JSON when --json flag is set', async () => {
      const client = makeClient();
      const cmd = buildAgentsCommand(client);
      await cmd.parseAsync(['register', 'a1', 'Bot', '--json'], { from: 'user' });

      const logArg = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(logArg)).not.toThrow();
    });
  });

  describe('agents deregister', () => {
    it('calls client.agents.delete with the given id', async () => {
      const client = makeClient();
      const cmd = buildAgentsCommand(client);
      await cmd.parseAsync(['deregister', 'agent-1'], { from: 'user' });

      expect(client.agents.delete).toHaveBeenCalledWith('agent-1');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('agent-1'));
    });
  });
});
