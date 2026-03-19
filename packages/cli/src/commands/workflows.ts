import { Command } from 'commander';
import type { MissionControlClient } from '@mission-control/sdk';

export function buildWorkflowsCommand(client: MissionControlClient): Command {
  const cmd = new Command('workflows').description('Manage workflows');

  cmd
    .command('create <name>')
    .description('Create a workflow')
    .option('--json', 'Output as JSON')
    .action(async (name: string, opts: { json?: boolean }) => {
      const workflow = await client.workflows.create({ name });
      if (opts.json) {
        console.log(JSON.stringify(workflow, null, 2));
        return;
      }
      console.log(`Workflow '${workflow.id}' created.`);
    });

  cmd
    .command('execute <id>')
    .description('Execute a workflow')
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      const run = await client.workflows.execute(id);
      if (opts.json) {
        console.log(JSON.stringify(run, null, 2));
        return;
      }
      console.log('Execution started:', JSON.stringify(run));
    });

  cmd
    .command('validate <id>')
    .description('Validate a workflow')
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      const result = await client.workflows.validate(id);
      console.log(JSON.stringify(result, null, 2));
    });

  return cmd;
}
