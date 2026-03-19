import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageAdapter } from './storage.js';

let tmpDir: string;
let adapter: LocalStorageAdapter;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'mc-storage-test-'));
  adapter = new LocalStorageAdapter(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('LocalStorageAdapter', () => {
  it('stores and retrieves a buffer', async () => {
    const data = Buffer.from('hello world');
    await adapter.put('artifacts/test.txt', data, 'text/plain');
    const retrieved = await adapter.get('artifacts/test.txt');
    expect(retrieved).toEqual(data);
  });

  it('returns null for missing key', async () => {
    const result = await adapter.get('missing/file.txt');
    expect(result).toBeNull();
  });

  it('deletes a stored artifact', async () => {
    await adapter.put('to-delete.bin', Buffer.from('data'), 'application/octet-stream');
    await adapter.delete('to-delete.bin');
    expect(await adapter.get('to-delete.bin')).toBeNull();
  });

  it('generates a URL for a stored key', () => {
    const url = adapter.url('artifacts/test.txt');
    expect(url).toContain('artifacts/test.txt');
  });

  it('lists keys under a prefix', async () => {
    await adapter.put('prefix/a.txt', Buffer.from('a'), 'text/plain');
    await adapter.put('prefix/b.txt', Buffer.from('b'), 'text/plain');
    await adapter.put('other/c.txt', Buffer.from('c'), 'text/plain');
    const keys = await adapter.list('prefix/');
    expect(keys).toHaveLength(2);
    expect(keys).toContain('prefix/a.txt');
  });
});
