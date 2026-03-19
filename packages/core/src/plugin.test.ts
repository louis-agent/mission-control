// packages/core/src/plugin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from './plugin.js';
import type { TaskHandler } from './plugin.js';

const echoHandler: TaskHandler = {
  name: 'echo',
  canHandle: (task) => task.title.startsWith('echo:'),
  execute: async (task) => ({ echoed: task.input }),
};

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('registers and lists plugins', () => {
    registry.register(echoHandler);
    expect(registry.list()).toContain('echo');
  });

  it('finds handler for matching task', () => {
    registry.register(echoHandler);
    const handler = registry.findHandler({ title: 'echo: hello', input: { text: 'hi' } } as any);
    expect(handler?.name).toBe('echo');
  });

  it('returns null when no handler matches', () => {
    registry.register(echoHandler);
    const handler = registry.findHandler({ title: 'unknown task', input: {} } as any);
    expect(handler).toBeNull();
  });

  it('throws on duplicate name', () => {
    registry.register(echoHandler);
    expect(() => registry.register(echoHandler)).toThrow('already registered');
  });

  it('unregisters a plugin', () => {
    registry.register(echoHandler);
    registry.unregister('echo');
    expect(registry.list()).not.toContain('echo');
  });

  it('gets a handler by name', () => {
    registry.register(echoHandler);
    expect(registry.getByName('echo')).toBe(echoHandler);
    expect(registry.getByName('nonexistent')).toBeNull();
  });
});
