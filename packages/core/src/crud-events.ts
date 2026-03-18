import { eq } from 'drizzle-orm';
import type { DB } from './db.js';
import { events } from './schema.js';
import type { Event, CreateEventInput } from './types.js';
import { toJson, fromJson } from './json-utils.js';

type EventRow = typeof events.$inferSelect;

function rowToEvent(row: EventRow): Event {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    payload: fromJson<Record<string, unknown>>(row.payload),
    timestamp: row.timestamp as Date,
    createdAt: row.createdAt as Date,
  };
}

export function createEvent(db: DB, input: CreateEventInput): Event {
  const now = new Date();
  db.insert(events).values({
    id: input.id,
    type: input.type,
    source: input.source,
    payload: toJson(input.payload),
    timestamp: input.timestamp,
    createdAt: now,
  }).run();
  return getEventById(db, input.id)!;
}

export function getEventById(db: DB, id: string): Event | null {
  const row = db.select().from(events).where(eq(events.id, id)).get();
  return row ? rowToEvent(row) : null;
}

export function listEvents(db: DB): Event[] {
  return db.select().from(events).all().map(rowToEvent);
}
