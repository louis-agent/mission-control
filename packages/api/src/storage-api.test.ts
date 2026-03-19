import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from '@mission-control/core';
import { createStorageApp } from './storage-api.js';

let tmpDir: string;
let app: express.Express;
let adapter: LocalStorageAdapter;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mc-storage-api-test-'));
  adapter = new LocalStorageAdapter(tmpDir);
  app = express();
  app.use(createStorageApp(adapter));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('storage API', () => {
  it('PUT /artifacts/:key uploads a file', async () => {
    const res = await request(app)
      .put('/artifacts/test%2Ffile.txt')
      .set('Content-Type', 'text/plain')
      .send('hello world');
    expect(res.status).toBe(201);
    expect(res.body.key).toBe('test/file.txt');
    expect(res.body.url).toBeDefined();
  });

  it('GET /artifacts/:key downloads a file', async () => {
    await adapter.put('dl/file.txt', Buffer.from('content'), 'text/plain');

    const res = await request(app).get('/artifacts/dl%2Ffile.txt');
    expect(res.status).toBe(200);
    expect(res.text).toBe('content');
  });

  it('GET /artifacts/:key returns 404 for missing file', async () => {
    const res = await request(app).get('/artifacts/missing%2Ffile.txt');
    expect(res.status).toBe(404);
  });

  it('DELETE /artifacts/:key removes a file', async () => {
    await adapter.put('del/file.txt', Buffer.from('data'), 'text/plain');

    const res = await request(app).delete('/artifacts/del%2Ffile.txt');
    expect(res.status).toBe(204);
  });
});
