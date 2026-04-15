import type { EventBusInstance, EventMap } from './types';

type Handler<T> = (payload: T) => void;

/**
 * Minimal typed pub/sub. Returned disposers remove the listener and prune
 * empty bucket entries, so long-lived buses don't accumulate dead keys.
 */
export class EventBus implements EventBusInstance {
  private listeners = new Map<string, Set<Handler<unknown>>>();

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const handlers = this.listeners.get(event as string);
    if (!handlers) return;
    // Iterate a copy — handlers can unsubscribe themselves mid-emit.
    for (const handler of [...handlers]) {
      handler(payload);
    }
  }

  on<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
  ): () => void {
    const key = event as string;
    let bucket = this.listeners.get(key);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(key, bucket);
    }
    bucket.add(handler as Handler<unknown>);

    return () => {
      const b = this.listeners.get(key);
      if (!b) return;
      b.delete(handler as Handler<unknown>);
      if (b.size === 0) this.listeners.delete(key);
    };
  }

  destroy(): void {
    this.listeners.clear();
  }
}
