import { describe, expect, it, vi } from 'vitest';
import { createGridStore } from './createGridStore';
import type { Module } from '../core/types';

interface CounterState { value: number }

function counter(id: string, initialValue = 0): Module<CounterState> {
  return {
    id,
    name: id,
    schemaVersion: 1,
    priority: 100,
    getInitialState: () => ({ value: initialValue }),
    serialize: (s) => s,
    deserialize: (raw) =>
      raw && typeof raw === 'object' && 'value' in raw
        ? { value: Number((raw as { value: unknown }).value) || 0 }
        : { value: initialValue },
  };
}

describe('createGridStore', () => {
  it('seeds initial state from each module', () => {
    const store = createGridStore({
      gridId: 'g1',
      modules: [counter('a', 5), counter('b', 7)],
    });
    expect(store.getModuleState<CounterState>('a')).toEqual({ value: 5 });
    expect(store.getModuleState<CounterState>('b')).toEqual({ value: 7 });
  });

  it('setModuleState applies the updater and notifies subscribers', () => {
    const store = createGridStore({ gridId: 'g1', modules: [counter('a')] });
    const fn = vi.fn();
    store.subscribe(fn);
    store.setModuleState<CounterState>('a', (prev) => ({ value: prev.value + 1 }));
    expect(store.getModuleState<CounterState>('a')).toEqual({ value: 1 });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('returns a new outer module-states object on each change so external diffing works', () => {
    const store = createGridStore({ gridId: 'g1', modules: [counter('a')] });
    const before = store.getAllModuleStates();
    store.setModuleState<CounterState>('a', () => ({ value: 99 }));
    const after = store.getAllModuleStates();
    expect(after).not.toBe(before);
    expect(after.a).toEqual({ value: 99 });
  });

  it('treats updater returning the same reference as a no-op (no notify)', () => {
    const store = createGridStore({ gridId: 'g1', modules: [counter('a')] });
    const fn = vi.fn();
    store.subscribe(fn);
    store.setModuleState<CounterState>('a', (prev) => prev);
    expect(fn).not.toHaveBeenCalled();
  });

  it('subscribeToModule fires only when its slice changes by reference', () => {
    const store = createGridStore({
      gridId: 'g1',
      modules: [counter('a'), counter('b')],
    });
    const aFn = vi.fn();
    const bFn = vi.fn();
    store.subscribeToModule<CounterState>('a', aFn);
    store.subscribeToModule<CounterState>('b', bFn);

    store.setModuleState<CounterState>('a', () => ({ value: 1 }));
    expect(aFn).toHaveBeenCalledTimes(1);
    expect(bFn).not.toHaveBeenCalled();

    store.setModuleState<CounterState>('b', () => ({ value: 2 }));
    expect(aFn).toHaveBeenCalledTimes(1);
    expect(bFn).toHaveBeenCalledTimes(1);
  });

  it('subscribeToModule passes (next, prev) so consumers can diff', () => {
    const store = createGridStore({ gridId: 'g1', modules: [counter('a', 10)] });
    const fn = vi.fn();
    store.subscribeToModule<CounterState>('a', fn);
    store.setModuleState<CounterState>('a', () => ({ value: 11 }));
    expect(fn).toHaveBeenCalledWith({ value: 11 }, { value: 10 });
  });

  it('subscribeToModule disposer prevents further notifications', () => {
    const store = createGridStore({ gridId: 'g1', modules: [counter('a')] });
    const fn = vi.fn();
    const off = store.subscribeToModule<CounterState>('a', fn);
    off();
    store.setModuleState<CounterState>('a', () => ({ value: 1 }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('replaceModuleState always notifies, even with deep-equal value', () => {
    // Used by deserialize where the snapshot may reproduce the current state
    // structurally — we still want subscribers to know "a load happened".
    const store = createGridStore({ gridId: 'g1', modules: [counter('a', 5)] });
    const fn = vi.fn();
    store.subscribe(fn);
    store.replaceModuleState<CounterState>('a', { value: 5 });
    expect(fn).toHaveBeenCalledOnce();
    // But subscribeToModule still uses reference identity, so a structural-
    // dupe replace WILL fire it — caller's responsibility to dedupe if needed.
  });
});
