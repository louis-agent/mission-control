import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface CliConfig {
  baseUrl: string;
  apiKey?: string;
}

const CONFIG_PATH = join(homedir(), '.mc', 'config.json');

export function loadConfig(): CliConfig {
  const envUrl = process.env['MC_API_URL'];
  const envKey = process.env['MC_API_KEY'];

  if (envUrl) {
    return { baseUrl: envUrl, apiKey: envKey };
  }

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      const cfg = JSON.parse(raw) as Partial<CliConfig>;
      return {
        baseUrl: cfg.baseUrl ?? 'http://localhost:3000',
        apiKey: cfg.apiKey,
      };
    } catch {
      // ignore malformed config
    }
  }

  return { baseUrl: 'http://localhost:3000' };
}
