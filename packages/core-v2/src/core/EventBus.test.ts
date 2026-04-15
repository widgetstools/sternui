import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('grid:ready', fn);
    bus.emit('grid:ready', { gridId: 'g1' });
    expect(fn).toHaveBeenCalledWith({ gridId: 'g1' });
  });

  it('disposer removes the listener', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('grid:ready', fn);
    off();
    bus.emit('grid:ready', { gridId: 'g1' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('allows handlers to unsubscribe themselves mid-emit without skipping siblings', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const offA = bus.on('grid:ready', () => {
      seen.push('a');
      offA();
    });
    bus.on('grid:ready', () => {
      seen.push('b');
    });
    bus.emit('grid:ready', { gridId: 'g1' });
    // Both handlers fire on the first emit.
    expect(seen).toEqual(['a', 'b']);
    bus.emit('grid:ready', { gridId: 'g1' });
    // Only b survives the second emit.
    expect(seen).toEqual(['a', 'b', 'b']);
  });

  it('does nothing when emitting an event with no listeners', () => {
    const bus = new EventBus();
    expect(() => bus.emit('grid:ready', { gridId: 'g1' })).not.toThrow();
  });

  it('destroy() drops every listener', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('grid:ready', fn);
    bus.destroy();
    bus.emit('grid:ready', { gridId: 'g1' });
    expect(fn).not.toHaveBeenCalled();
  });
});
