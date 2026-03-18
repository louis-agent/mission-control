import express from 'express';
import { createDb } from '@mission-control/core';
import { createRegistryApp } from './registry.js';
import { createQueueApp } from './queue.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const DB_PATH = process.env.DB_PATH ?? './mission-control.db';

const db = createDb(DB_PATH);

const app = express();
app.use(express.json());

app.use(createRegistryApp(db));
app.use(createQueueApp(db));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Mission Control API listening on http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
