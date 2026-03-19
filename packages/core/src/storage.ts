import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/** Storage backend abstraction for large task artifacts. */
export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  url(key: string): string;
  list(prefix: string): Promise<string[]>;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    const safe = key.replace(/\.\./g, '_');
    return join(this.baseDir, safe);
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch { /* not found — ok */ }
  }

  url(key: string): string {
    return `/artifacts/${key}`;
  }

  async list(prefix: string): Promise<string[]> {
    // Normalise: always treat prefix as directory prefix ending with /
    const dirPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
    const dir = this.resolve(dirPrefix);
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => `${dirPrefix}${e.name}`);
    } catch {
      return [];
    }
  }
}
