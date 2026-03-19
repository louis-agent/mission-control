import type { Task } from './types.js';

/** A task handler plugin. */
export interface TaskHandler {
  /** Unique name identifying this plugin. */
  name: string;
  /** Return true if this handler can process the given task. */
  canHandle(task: Task): boolean;
  /** Execute the task and return output. */
  execute(task: Task): Promise<Record<string, unknown>>;
}

export class PluginRegistry {
  private handlers = new Map<string, TaskHandler>();

  register(handler: TaskHandler): void {
    if (this.handlers.has(handler.name)) {
      throw new Error(`Plugin '${handler.name}' already registered`);
    }
    this.handlers.set(handler.name, handler);
  }

  unregister(name: string): void {
    this.handlers.delete(name);
  }

  findHandler(task: Task): TaskHandler | null {
    for (const handler of this.handlers.values()) {
      if (handler.canHandle(task)) return handler;
    }
    return null;
  }

  getByName(name: string): TaskHandler | null {
    return this.handlers.get(name) ?? null;
  }

  list(): string[] {
    return [...this.handlers.keys()];
  }
}
