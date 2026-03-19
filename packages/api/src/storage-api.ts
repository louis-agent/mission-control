import express, { type Application, type Request, type Response } from 'express';
import type { StorageAdapter } from '@mission-control/core';

export function createStorageApp(storage: StorageAdapter): Application {
  const app = express();

  // PUT /artifacts/:key — upload an artifact (raw body)
  app.put('/artifacts/{*key}', async (req: Request<{ key: string }>, res: Response) => {
    const key = decodeURIComponent(req.params.key);
    const contentType = (req.headers['content-type'] as string) ?? 'application/octet-stream';
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        await storage.put(key, Buffer.concat(chunks), contentType);
        res.status(201).json({ key, url: storage.url(key) });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });
    req.on('error', (err) => {
      res.status(500).json({ error: (err as Error).message });
    });
  });

  // GET /artifacts/:key — download an artifact
  app.get('/artifacts/{*key}', async (req: Request<{ key: string }>, res: Response) => {
    const key = decodeURIComponent(req.params.key);
    const data = await storage.get(key);
    if (!data) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }
    res.status(200).type('text/plain').send(data);
  });

  // DELETE /artifacts/:key — remove an artifact
  app.delete('/artifacts/{*key}', async (req: Request<{ key: string }>, res: Response) => {
    const key = decodeURIComponent(req.params.key);
    await storage.delete(key);
    res.status(204).send();
  });

  return app;
}
