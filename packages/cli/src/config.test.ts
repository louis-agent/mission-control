import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const savedUrl = process.env['MC_API_URL'];
  const savedKey = process.env['MC_API_KEY'];

  afterEach(() => {
    if (savedUrl === undefined) {
      delete process.env['MC_API_URL'];
    } else {
      process.env['MC_API_URL'] = savedUrl;
    }
    if (savedKey === undefined) {
      delete process.env['MC_API_KEY'];
    } else {
      process.env['MC_API_KEY'] = savedKey;
    }
  });

  it('returns default URL when no env vars set', () => {
    delete process.env['MC_API_URL'];
    delete process.env['MC_API_KEY'];
    const cfg = loadConfig();
    expect(cfg.baseUrl).toBe('http://localhost:3000');
  });

  it('uses MC_API_URL and MC_API_KEY env vars', () => {
    process.env['MC_API_URL'] = 'http://my-server:9000';
    process.env['MC_API_KEY'] = 'tok-123';
    const cfg = loadConfig();
    expect(cfg.baseUrl).toBe('http://my-server:9000');
    expect(cfg.apiKey).toBe('tok-123');
  });
});
