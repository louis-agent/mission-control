#!/usr/bin/env node
import { Command } from 'commander';
import { MissionControlClient } from '@mission-control/sdk';
import { loadConfig } from './config.js';
import { buildAgentsCommand } from './commands/agents.js';
import { buildTasksCommand } from './commands/tasks.js';
import { buildWorkflowsCommand } from './commands/workflows.js';

const config = loadConfig();
const client = new MissionControlClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });

const program = new Command();
program
  .name('mc')
  .description('Mission Control CLI')
  .version('0.1.0');

program.addCommand(buildAgentsCommand(client));
program.addCommand(buildTasksCommand(client));
program.addCommand(buildWorkflowsCommand(client));

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
