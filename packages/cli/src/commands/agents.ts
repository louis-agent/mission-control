import { Command } from 'commander';
import type { MissionControlClient } from '@mission-control/sdk';

export function buildAgentsCommand(client: MissionControlClient): Command {
  const cmd = new Command('agents').description('Manage agents');

  cmd
    .command('list')
    .description('List all registered agents')
    .option('--capability <cap>', 'Filter by capability')
    .option('--json', 'Output as JSON')
    .action(async (opts: { capability?: string; json?: boolean }) => {
      const agents = await client.agents.list({ capability: opts.capability });
      if (opts.json) {
        console.log(JSON.stringify(agents, null, 2));
        return;
      }
      if (agents.length === 0) {
        console.log('No agents registered.');
        return;
      }
      console.log(`${'ID'.padEnd(36)}  ${'NAME'.padEnd(20)}  STATUS`);
      for (const a of agents) {
        console.log(`${a.id.padEnd(36)}  ${a.name.padEnd(20)}  ${a.status}`);
      }
    });

  cmd
    .command('register <id> <name>')
    .description('Register a new agent')
    .option('--capability <caps...>', 'Required capabilities')
    .option('--json', 'Output as JSON')
    .action(async (id: string, name: string, opts: { capability?: string[]; json?: boolean }) => {
      const agent = await client.agents.create({ id, name, capabilities: opts.capability ?? [] });
      if (opts.json) {
        console.log(JSON.stringify(agent, null, 2));
        return;
      }
      console.log(`Agent '${name}' registered with id '${id}'.`);
    });

  cmd
    .command('deregister <id>')
    .description('Deregister an agent')
    .action(async (id: string) => {
      await client.agents.delete(id);
      console.log(`Agent '${id}' deregistered.`);
    });

  return cmd;
}
