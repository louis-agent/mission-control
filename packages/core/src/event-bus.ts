import { randomUUID } from 'node:crypto';
import type { DB } from './db.js';
import { createEvent, listEvents } from './crud.js';
import type { Event } from './types.js';

export type EventHandler = (event: Event) => void;
export type Unsubscribe = () => void;

interface Subscription {
  id: string;
  pattern: string;
  regex: RegExp;
  handler: EventHandler;
}

// Convert a dot-separated pattern with optional '*' wildcards to a RegExp.
// '*' matches exactly one non-dot segment (e.g. 'agent.*' matches 'agent.started').
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .split('.')
    .map(seg =>
      seg === '*'
        ? '[^.]+'
        : seg.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'),
    )
    .join('\\.');
  return new RegExp(`^${escaped}$`);
}

export interface PublishInput {
  type: string;
  source: string;
  payload?: Record<string, unknown>;
}

export class EventBus {
  private subscriptions: Subscription[] = [];

  constructor(private readonly db: DB) {}

  // Subscribe to events matching `pattern`. Returns an unsubscribe function.
  subscribe(pattern: string, handler: EventHandler): Unsubscribe {
    const id = randomUUID();
    const sub: Subscription = {
      id,
      pattern,
      regex: patternToRegex(pattern),
      handler,
    };
    this.subscriptions.push(sub);
    return () => {
      this.subscriptions = this.subscriptions.filter(s => s.id !== id);
    };
  }

  // Persist an event to SQLite and dispatch it to matching subscribers.
  publish(input: PublishInput): Event {
    const now = new Date();
    const event = createEvent(this.db, {
      id: randomUUID(),
      type: input.type,
      source: input.source,
      payload: input.payload ?? {},
      timestamp: now,
    });
    this.dispatch(event);
    return event;
  }

  // Replay persisted events from SQLite (oldest first), dispatching each to
  // current subscribers. Returns the replayed events. Optionally filter by pattern.
  replay(pattern?: string): Event[] {
    const all = listEvents(this.db).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    const filter = pattern != null ? patternToRegex(pattern) : null;
    const matching = filter != null ? all.filter(e => filter.test(e.type)) : all;
    for (const event of matching) {
      this.dispatch(event);
    }
    return matching;
  }

  private dispatch(event: Event): void {
    // Iterate over a snapshot so that handlers that unsubscribe mid-dispatch
    // don't affect the current iteration.
    for (const sub of [...this.subscriptions]) {
      if (sub.regex.test(event.type)) {
        sub.handler(event);
      }
    }
  }
}
