import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3StorageAdapter } from './storage-s3.js';

const mockClient = {
  send: vi.fn(),
};

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => mockClient),
  PutObjectCommand: vi.fn((params) => ({ _type: 'PutObject', ...params })),
  GetObjectCommand: vi.fn((params) => ({ _type: 'GetObject', ...params })),
  DeleteObjectCommand: vi.fn((params) => ({ _type: 'DeleteObject', ...params })),
  ListObjectsV2Command: vi.fn((params) => ({ _type: 'ListObjectsV2', ...params })),
}));

describe('S3StorageAdapter', () => {
  let adapter: S3StorageAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new S3StorageAdapter({ bucket: 'test-bucket', region: 'us-east-1' });
  });

  it('put calls PutObjectCommand', async () => {
    mockClient.send.mockResolvedValue({});
    await adapter.put('key/file.txt', Buffer.from('data'), 'text/plain');
    expect(mockClient.send).toHaveBeenCalledOnce();
  });

  it('get returns buffer on success', async () => {
    const { Readable } = await import('node:stream');
    const stream = Readable.from([Buffer.from('content')]);
    mockClient.send.mockResolvedValue({ Body: stream });
    const result = await adapter.get('key/file.txt');
    expect(result).toBeInstanceOf(Buffer);
    expect(result?.toString()).toBe('content');
  });

  it('get returns null when object not found', async () => {
    mockClient.send.mockRejectedValue(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    const result = await adapter.get('missing.txt');
    expect(result).toBeNull();
  });

  it('url returns S3 URL', () => {
    const url = adapter.url('path/to/file.txt');
    expect(url).toContain('test-bucket');
    expect(url).toContain('path/to/file.txt');
  });

  it('list returns keys from ListObjectsV2', async () => {
    mockClient.send.mockResolvedValue({ Contents: [{ Key: 'prefix/a.txt' }, { Key: 'prefix/b.txt' }] });
    const keys = await adapter.list('prefix/');
    expect(keys).toEqual(['prefix/a.txt', 'prefix/b.txt']);
  });
});
