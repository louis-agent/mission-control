import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PluginRegistry } from '@mission-control/core';
import { createPluginManagerApp } from './plugin-manager.js';

function makeApp() {
  const registry = new PluginRegistry();
  const app = express();
  app.use(express.json());
  app.use(createPluginManagerApp(registry));
  return app;
}

describe('plugin-manager router', () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    app = makeApp();
  });

  it('GET /plugins lists registered plugins (includes built-ins)', async () => {
    const res = await request(app).get('/plugins');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Built-ins should be auto-registered
    const names = res.body.map((p: { name: string }) => p.name);
    expect(names).toContain('shell-executor');
    expect(names).toContain('http-caller');
  });

  it('GET /plugins/:name returns plugin info', async () => {
    const res = await request(app).get('/plugins/shell-executor');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('shell-executor');
  });

  it('GET /plugins/:name returns 404 for unknown plugin', async () => {
    const res = await request(app).get('/plugins/unknown-plugin');
    expect(res.status).toBe(404);
  });

  it('POST /plugins/:name/execute returns 404 for unknown plugin', async () => {
    const res = await request(app).post('/plugins/unknown/execute').send({ input: {} });
    expect(res.status).toBe(404);
  });

  it('POST /plugins/shell-executor/execute runs the plugin', async () => {
    const res = await request(app)
      .post('/plugins/shell-executor/execute')
      .send({ input: { command: 'echo', args: ['hello'] }, title: 'shell: echo' });
    expect(res.status).toBe(200);
    expect(res.body.output).toBeDefined();
    expect(res.body.output.exitCode).toBe(0);
  });
});
