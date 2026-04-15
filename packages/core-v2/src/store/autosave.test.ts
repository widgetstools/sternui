import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGridStore } from './createGridStore';
import { startAutoSave } from './autosave';
import type { Module, SerializedState } from '../core/types';

interface CounterState { value: number }

const counter: Module<CounterState> = {
  id: 'counter',
  name: 'counter',
  schemaVersion: 1,
  priority: 100,
  getInitialState: () => ({ value: 0 }),
  serialize: (s) => s,
  deserialize: (raw) => (raw as CounterState) ?? { value: 0 },
};

function bootHarness() {
  const store = createGridStore({ gridId: 'g1', modules: [counter] });
  const core = {
    serializeAll: (): Record<string, SerializedState> => ({
      counter: { v: counter.schemaVersion, data: store.getModuleState<CounterState>('counter') },
    }),
  };
  return { store, core };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startAutoSave — debouncing', () => {
  it('does not persist before the debounce window elapses', () => {
    const { store, core } = bootHarness();
    const persist = vi.fn();
    const handle = startAutoSave({ core, store, persist, debounceMs: 300 });

    store.setModuleState<CounterState>('counter', () => ({ value: 1 }));
    vi.advanceTimersByTime(299);
    expect(persist).not.toHaveBeenCalled();

    handle.dispose();
  });

  it('persists once after the debounce settles', async () => {
    const { store, core } = bootHarness();
    const persist = vi.fn();
    const handle = startAutoSave({ core, store, persist, debounceMs: 300 });

    store.setModuleState<CounterState>('counter', () => ({ value: 1 }));
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith({
      counter: { v: 1, data: { value: 1 } },
    });

    handle.dispose();
  });

  it('coalesces a burst of updates into one persist with the latest snapshot', async () => {
    const { store, core } = bootHarness();
    const persist = vi.fn();
    const handle = startAutoSave({ core, store, persist, debounceMs: 100 });

    store.setModuleState<CounterState>('counter', () => ({ value: 1 }));
    vi.advanceTimersByTime(50);
    store.setModuleState<CounterState>('counter', () => ({ value: 2 }));
    vi.advanceTimersByTime(50);
    store.setModuleState<CounterState>('counter', () => ({ value: 3 }));
    vi.advanceTimersByTime(100);
    await Promise.resolve();

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith({
      counter: { v: 1, data: { value: 3 } },
    });
    handle.dispose();
  });
});

describe('startAutoSave — concurrency', () => {
  it('serialises concurrent persists: a write during an in-flight one queues exactly one follow-up', async () => {
    const { store, core } = bootHarness();
    let resolveFirst: () => void;
    const firstPersist = new Promise<void>((r) => { resolveFirst = r; });
    const persist = vi.fn()
      .mockImplementationOnce(() => firstPersist)
      .mockImplementationOnce(() => Promise.resolve());

    const handle = startAutoSave({ core, store, persist, debounceMs: 50 });

    store.setModuleState<CounterState>('counter', () => ({ value: 1 }));
    vi.advanceTimersByTime(50);
    await Promise.resolve(); // let drain() start

    // First persist is hung. Now mutate twice — both should coalesce into one
    // follow-up persist that runs after the first resolves.
    store.setModuleState<CounterState>('counter', () => ({ value: 2 }));
    vi.advanceTimersByTime(50);
    await Promise.resolve();
    store.setModuleState<CounterState>('counter', () => ({ value: 3 }));
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // Release the first persist; the loop should grab the *latest* snapshot.
    resolveFirst!();
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));

    expect(persist).toHaveBeenNthCalledWith(1, { counter: { v: 1, data: { value: 1 } } });
    expect(persist).toHaveBeenNthCalledWith(2, { counter: { v: 1, data: { value: 3 } } });

    handle.dispose();
  });

  it('flushNow cancels the debounce timer and persists immediately', async () => {
    const { store, core } = bootHarness();
    const persist = vi.fn().mockResolvedValue(undefined);
    const handle = startAutoSave({ core, store, persist, debounceMs: 5_000 });

    store.setModuleState<CounterState>('counter', () => ({ value: 7 }));
    // No advance — debounce hasn't fired.
    expect(persist).not.toHaveBeenCalled();

    await handle.flushNow();
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith({ counter: { v: 1, data: { value: 7 } } });

    handle.dispose();
  });
});

describe('startAutoSave — error handling', () => {
  it('persist failures route to onError and do not break the engine', async () => {
    const { store, core } = bootHarness();
    const onError = vi.fn();
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const handle = startAutoSave({ core, store, persist, debounceMs: 50, onError });

    store.setModuleState<CounterState>('counter', () => ({ value: 1 }));
    vi.advanceTimersByTime(50);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);

    // Engine still alive — next change persists fine.
    store.setModuleState<CounterState>('counter', () => ({ value: 2 }));
    vi.advanceTimersByTime(50);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));

    handle.dispose();
  });

  it('serializeAll throwing routes to onError without calling persist', async () => {
    const { store } = bootHarness();
    const onError = vi.fn();
    const persist = vi.fn();
    const core = {
      serializeAll: () => {
        throw new Error('serialize bug');
      },
    };
    const handle = startAutoSave({ core, store, persist, debounceMs: 50, onError });

    store.setModuleState<CounterState>('counter', () => ({ value: 1 }));
    vi.advanceTimersByTime(50);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(persist).not.toHaveBeenCalled();

    handle.dispose();
  });
});

describe('startAutoSave — disposal', () => {
  it('dispose cancels the pending debounce', async () => {
    const { store, core } = bootHarness();
    const persist = vi.fn();
    const handle = startAutoSave({ core, store, persist, debounceMs: 100 });

    store.setModuleState<CounterState>('counter', () => ({ value: 1 }));
    handle.dispose();
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(persist).not.toHaveBeenCalled();
  });

  it('dispose stops listening to further store mutations', async () => {
    const { store, core } = bootHarness();
    const persist = vi.fn();
    const handle = startAutoSave({ core, store, persist, debounceMs: 100 });
    handle.dispose();

    store.setModuleState<CounterState>('counter', () => ({ value: 1 }));
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(persist).not.toHaveBeenCalled();
  });
});
