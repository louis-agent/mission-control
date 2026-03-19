import { Command } from 'commander';
import type { MissionControlClient } from '@mission-control/sdk';

export function buildTasksCommand(client: MissionControlClient): Command {
  const cmd = new Command('tasks').description('Manage tasks');

  cmd
    .command('list')
    .description('List tasks')
    .option('--status <status>', 'Filter by status')
    .option('--json', 'Output as JSON')
    .action(async (opts: { status?: string; json?: boolean }) => {
      const tasks = await client.tasks.list({ status: opts.status });
      if (opts.json) {
        console.log(JSON.stringify(tasks, null, 2));
        return;
      }
      if (tasks.length === 0) {
        console.log('No tasks found.');
        return;
      }
      console.log(`${'ID'.padEnd(36)}  ${'TITLE'.padEnd(30)}  STATUS`);
      for (const t of tasks) {
        console.log(`${t.id.padEnd(36)}  ${t.title.padEnd(30)}  ${t.status}`);
      }
    });

  cmd
    .command('submit <title>')
    .description('Submit a new task')
    .option('--description <desc>', 'Task description')
    .option('--capability <caps...>', 'Required capabilities')
    .option('--max-retries <n>', 'Max retry attempts', parseInt)
    .option('--json', 'Output as JSON')
    .action(async (title: string, opts: { description?: string; capability?: string[]; maxRetries?: number; json?: boolean }) => {
      const task = await client.tasks.submit({
        title,
        description: opts.description,
        requiredCapabilities: opts.capability,
        maxRetries: opts.maxRetries,
      });
      if (opts.json) {
        console.log(JSON.stringify(task, null, 2));
        return;
      }
      console.log(`Task '${task.id}' submitted (status: ${task.status}).`);
    });

  cmd
    .command('status <id>')
    .description('Get task status')
    .option('--json', 'Output as JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      const task = await client.tasks.get(id);
      if (opts.json) {
        console.log(JSON.stringify(task, null, 2));
        return;
      }
      console.log(`${task.id}  ${task.title ?? ''}  ${task.status}`);
    });

  return cmd;
}
