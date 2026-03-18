import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db.js';
import type { DB } from './db.js';
import { EventBus } from './event-bus.js';
import type { Event } from './types.js';

let db: DB;
let bus: EventBus;

beforeEach(() => {
  db = createDb(':memory:');
  bus = new EventBus(db);
});

// ──────────────────────────────────────────────────────────────────────────────
// subscribe / publish
// ──────────────────────────────────────────────────────────────────────────────

describe('EventBus.subscribe / publish', () => {
  it('delivers a published event to a matching subscriber', () => {
    const received: Event[] = [];
    bus.subscribe('agent.started', e => received.push(e));

    const published = bus.publish({ type: 'agent.started', source: 'test' });

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(published.id);
    expect(received[0].type).toBe('agent.started');
    expect(received[0].source).toBe('test');
  });

  it('does not deliver an event to a non-matching subscriber', () => {
    const received: Event[] = [];
    bus.subscribe('agent.stopped', e => received.push(e));

    bus.publish({ type: 'agent.started', source: 'test' });

    expect(received).toHaveLength(0);
  });

  it('delivers to multiple matching subscribers', () => {
    const received1: Event[] = [];
    const received2: Event[] = [];
    bus.subscribe('task.done', e => received1.push(e));
    bus.subscribe('task.done', e => received2.push(e));

    bus.publish({ type: 'task.done', source: 'worker' });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it('persists the event payload', () => {
    const received: Event[] = [];
    bus.subscribe('task.done', e => received.push(e));

    bus.publish({ type: 'task.done', source: 'worker', payload: { result: 42 } });

    expect(received[0].payload).toEqual({ result: 42 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// wildcard subscriptions
// ──────────────────────────────────────────────────────────────────────────────

describe('EventBus wildcard subscriptions', () => {
  it('matches all events under a namespace with agent.*', () => {
    const received: Event[] = [];
    bus.subscribe('agent.*', e => received.push(e));

    bus.publish({ type: 'agent.started', source: 'a' });
    bus.publish({ type: 'agent.stopped', source: 'b' });
    bus.publish({ type: 'task.done', source: 'c' });

    expect(received).toHaveLength(2);
    expect(received.map(e => e.type)).toEqual(['agent.started', 'agent.stopped']);
  });

  it('does not match nested segments for single-star wildcard', () => {
    const received: Event[] = [];
    bus.subscribe('agent.*', e => received.push(e));

    bus.publish({ type: 'agent.started.extra', source: 'a' });

    expect(received).toHaveLength(0);
  });

  it('matches exact segment with wildcard', () => {
    const received: Event[] = [];
    bus.subscribe('*.done', e => received.push(e));

    bus.publish({ type: 'task.done', source: 'a' });
    bus.publish({ type: 'workflow.done', source: 'b' });
    bus.publish({ type: 'task.started', source: 'c' });

    expect(received).toHaveLength(2);
    expect(received.map(e => e.type)).toEqual(['task.done', 'workflow.done']);
  });

  it('supports mid-pattern wildcard', () => {
    const received: Event[] = [];
    bus.subscribe('agent.*.status', e => received.push(e));

    bus.publish({ type: 'agent.123.status', source: 'monitor' });
    bus.publish({ type: 'agent.abc.status', source: 'monitor' });
    bus.publish({ type: 'agent.abc.other', source: 'monitor' });

    expect(received).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// unsubscribe
// ──────────────────────────────────────────────────────────────────────────────

describe('EventBus unsubscribe', () => {
  it('stops delivery after unsubscribe', () => {
    const received: Event[] = [];
    const unsub = bus.subscribe('agent.started', e => received.push(e));

    bus.publish({ type: 'agent.started', source: 'a' });
    unsub();
    bus.publish({ type: 'agent.started', source: 'b' });

    expect(received).toHaveLength(1);
  });

  it('does not affect other subscribers when one unsubscribes', () => {
    const received1: Event[] = [];
    const received2: Event[] = [];
    const unsub1 = bus.subscribe('agent.started', e => received1.push(e));
    bus.subscribe('agent.started', e => received2.push(e));

    bus.publish({ type: 'agent.started', source: 'a' });
    unsub1();
    bus.publish({ type: 'agent.started', source: 'b' });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(2);
  });

  it('handler that unsubscribes itself mid-dispatch does not affect sibling handlers', () => {
    const received1: Event[] = [];
    const received2: Event[] = [];
    let unsub1: () => void;

    unsub1 = bus.subscribe('ev', () => {
      received1.push({ type: 'ev' } as Event);
      unsub1();
    });
    bus.subscribe('ev', e => received2.push(e));

    bus.publish({ type: 'ev', source: 'x' });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// persistence
// ──────────────────────────────────────────────────────────────────────────────

describe('EventBus persistence', () => {
  it('stores published events in the database', () => {
    bus.publish({ type: 'task.done', source: 'worker', payload: { id: '1' } });
    bus.publish({ type: 'agent.started', source: 'launcher' });

    // Create a new bus on the same db — no in-memory subscribers, but events are stored
    const bus2 = new EventBus(db);
    const replayed: Event[] = [];
    bus2.subscribe('*.*', e => replayed.push(e));
    bus2.replay();

    expect(replayed).toHaveLength(2);
    expect(replayed.map(e => e.type)).toContain('task.done');
    expect(replayed.map(e => e.type)).toContain('agent.started');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// replay
// ──────────────────────────────────────────────────────────────────────────────

describe('EventBus.replay', () => {
  it('replays all persisted events in chronological order', () => {
    bus.publish({ type: 'a.1', source: 's' });
    bus.publish({ type: 'a.2', source: 's' });
    bus.publish({ type: 'a.3', source: 's' });

    const replayed: Event[] = [];
    bus.subscribe('a.*', e => replayed.push(e));
    bus.replay('a.*');

    expect(replayed.map(e => e.type)).toEqual(['a.1', 'a.2', 'a.3']);
  });

  it('replays only matching events when a pattern is provided', () => {
    bus.publish({ type: 'agent.started', source: 'x' });
    bus.publish({ type: 'task.done', source: 'y' });
    bus.publish({ type: 'agent.stopped', source: 'z' });

    const replayed: Event[] = [];
    bus.subscribe('agent.*', e => replayed.push(e));
    bus.replay('agent.*');

    expect(replayed).toHaveLength(2);
    expect(replayed.every(e => e.type.startsWith('agent.'))).toBe(true);
  });

  it('returns the list of replayed events', () => {
    bus.publish({ type: 'ping', source: 's' });
    bus.publish({ type: 'pong', source: 's' });

    const result = bus.replay();
    expect(result).toHaveLength(2);
  });
});
