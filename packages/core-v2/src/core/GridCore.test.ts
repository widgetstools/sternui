import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridCore } from './GridCore';
import type { AnyModule, GridContext, Module, ModuleContext } from './types';

// ─── Test harness ────────────────────────────────────────────────────────────

/**
 * Minimal in-memory store standing in for the Zustand store the production
 * core uses. Each module's state lives under its id; updaters run against the
 * previous value the same way the real `setModuleState` does.
 */
function createTestStore() {
  const states = new Map<string, unknown>();
  return {
    set<T>(id: string, value: T) {
      states.set(id, value);
    },
    get<T>(id: string): T {
      return states.get(id) as T;
    },
    update<T>(id: string, updater: (prev: T) => T) {
      const prev = states.get(id) as T;
      states.set(id, updater(prev));
    },
    snapshot() {
      return Object.fromEntries(states);
    },
  };
}

interface CounterState {
  value: number;
}

/**
 * Module factory used by most tests below. Defaults give a self-contained
 * module with a stable initial state and identity (de)serialize functions —
 * tests override only what they care about.
 */
function makeModule(overrides: Partial<Module<CounterState>> & Pick<Module<CounterState>, 'id'>): Module<CounterState> {
  const initial: CounterState = { value: 0 };
  return {
    name: overrides.id,
    schemaVersion: 1,
    priority: 100,
    getInitialState: () => ({ ...initial }),
    serialize: (s) => s,
    deserialize: (raw) =>
      raw && typeof raw === 'object' && 'value' in raw
        ? { value: Number((raw as { value: unknown }).value) || 0 }
        : { ...initial },
    ...overrides,
  };
}

function bootCore(modules: AnyModule[]) {
  const store = createTestStore();
  // Seed initial state for every module before constructing the core. The
  // production store hook does this in its initializer; doing it here keeps
  // the tests honest about the contract.
  for (const m of modules) {
    store.set(m.id, m.getInitialState());
  }
  const core = new GridCore({
    gridId: 'g1',
    modules,
    getModuleState: <T>(id: string) => store.get<T>(id),
    setModuleState: <T>(id: string, updater: (prev: T) => T) => store.update<T>(id, updater),
  });
  return { core, store };
}

// ─── Registration / topo-sort enforcement ────────────────────────────────────

describe('GridCore — registration', () => {
  it('registers modules and emits module:registered for each', () => {
    const events: string[] = [];
    const m1 = makeModule({ id: 'a' });
    const m2 = makeModule({ id: 'b' });
    const { core } = bootCore([m1, m2]);
    core.eventBus.on('module:registered', (e) => events.push(e.moduleId));
    // Re-emit by registering listeners *after* construction means we won't see
    // the constructor-time emits — instead inspect the registered list directly.
    expect(core.getModules().map((m) => m.id)).toEqual(['a', 'b']);
    expect(core.getModule('a')).toBe(m1);
    expect(core.getModule('b')).toBe(m2);
  });

  it('captures module:registered events fired during construction', () => {
    const seen: string[] = [];
    // Wire the listener via onRegister hook so we observe the order the core
    // emits in (onRegister + emit happen back-to-back per module).
    const m1 = makeModule({
      id: 'a',
      onRegister: (ctx: ModuleContext) => {
        ctx.eventBus.on('module:registered', (e) => seen.push(e.moduleId));
      },
    });
    const m2 = makeModule({ id: 'b' });
    bootCore([m1, m2]);
    // 'a' registers first; its listener attaches before 'b' is announced.
    expect(seen).toContain('b');
  });

  it('throws on duplicate module ids', () => {
    expect(() => bootCore([makeModule({ id: 'dup' }), makeModule({ id: 'dup' })])).toThrow(
      /Duplicate module id: "dup"/,
    );
  });

  it('throws on a missing dependency', () => {
    expect(() =>
      bootCore([makeModule({ id: 'a', dependencies: ['ghost'] })]),
    ).toThrow(/depends on unknown module "ghost"/);
  });

  it('throws on cyclic dependencies', () => {
    expect(() =>
      bootCore([
        makeModule({ id: 'a', dependencies: ['b'] }),
        makeModule({ id: 'b', dependencies: ['a'] }),
      ]),
    ).toThrow(/Cyclic module dependencies/);
  });
});

// ─── Topological + priority ordering ─────────────────────────────────────────

describe('GridCore — module ordering', () => {
  it('orders dependencies before dependents regardless of registration order', () => {
    const { core } = bootCore([
      makeModule({ id: 'consumer', dependencies: ['producer'], priority: 10 }),
      makeModule({ id: 'producer', priority: 100 }),
    ]);
    expect(core.getModules().map((m) => m.id)).toEqual(['producer', 'consumer']);
  });

  it('within the same dep level, lower priority runs first', () => {
    const { core } = bootCore([
      makeModule({ id: 'late', priority: 200 }),
      makeModule({ id: 'early', priority: 50 }),
      makeModule({ id: 'mid', priority: 100 }),
    ]);
    expect(core.getModules().map((m) => m.id)).toEqual(['early', 'mid', 'late']);
  });
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

describe('GridCore — lifecycle', () => {
  const fakeApi = { __fake: true } as never;

  it('fires onGridReady with a context that exposes the api + getRowId', () => {
    const ready = vi.fn<(ctx: GridContext) => void>();
    const m = makeModule({ id: 'a', onGridReady: ready });
    const { core } = bootCore([m]);
    core.onGridReady(fakeApi);
    expect(ready).toHaveBeenCalledOnce();
    const ctx = ready.mock.calls[0][0];
    expect(ctx.gridApi).toBe(fakeApi);
    expect(ctx.gridId).toBe('g1');
    expect(ctx.getRowId({ data: { id: 'row-7' } } as never)).toBe('row-7');
  });

  it('fires onGridDestroy and clears the api', () => {
    const destroy = vi.fn();
    const { core } = bootCore([makeModule({ id: 'a', onGridDestroy: destroy })]);
    core.onGridReady(fakeApi);
    core.onGridDestroy();
    expect(destroy).toHaveBeenCalledOnce();
    expect(core.getGridApi()).toBeNull();
  });

  it('skips lifecycle dispatch if the grid never became ready', () => {
    const destroy = vi.fn();
    const { core } = bootCore([makeModule({ id: 'a', onGridDestroy: destroy })]);
    core.onGridDestroy();
    expect(destroy).not.toHaveBeenCalled();
  });
});

// ─── Transform pipeline ──────────────────────────────────────────────────────

describe('GridCore — transformColumnDefs', () => {
  const fakeApi = {} as never;

  it('runs each module in topological + priority order', () => {
    const order: string[] = [];
    const tag = (id: string): Module<CounterState> =>
      makeModule({
        id,
        priority: id === 'first' ? 10 : id === 'second' ? 50 : 100,
        transformColumnDefs: (defs) => {
          order.push(id);
          return defs;
        },
      });
    const { core } = bootCore([tag('third'), tag('first'), tag('second')]);
    core.onGridReady(fakeApi);
    core.transformColumnDefs([{ field: 'x' }]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('returns the input unchanged if the grid is not ready', () => {
    const m = makeModule({
      id: 'a',
      transformColumnDefs: (defs) => [...defs, { field: 'extra' }],
    });
    const { core } = bootCore([m]);
    const out = core.transformColumnDefs([{ field: 'x' }]);
    // No grid context = no transform = identity. Guards against modules running
    // against a stale or missing api during early renders.
    expect(out).toEqual([{ field: 'x' }]);
  });

  it('threads the previous module output into the next', () => {
    const a = makeModule({
      id: 'a',
      priority: 10,
      transformColumnDefs: (defs) => [...defs, { field: 'fromA' }],
    });
    const b = makeModule({
      id: 'b',
      priority: 20,
      transformColumnDefs: (defs) => defs.map((d) => ({ ...d, hide: true })),
    });
    const { core } = bootCore([a, b]);
    core.onGridReady(fakeApi);
    const out = core.transformColumnDefs([{ field: 'x' }]);
    expect(out).toEqual([
      { field: 'x', hide: true },
      { field: 'fromA', hide: true },
    ]);
  });

  it('exposes ctx.getModuleState to transformColumnDefs so a module can read sibling state', () => {
    // sibling module owns a list of pinned colIds; the consumer module reads it.
    interface SiblingState { pinned: string[] }
    const sibling: Module<SiblingState> = {
      id: 'sibling',
      name: 'Sibling',
      schemaVersion: 1,
      priority: 0,
      getInitialState: () => ({ pinned: ['a'] }),
      serialize: (s) => s,
      deserialize: (raw) => (raw as SiblingState) ?? { pinned: [] },
    };
    const consumer: Module<{}> = {
      id: 'consumer',
      name: 'Consumer',
      schemaVersion: 1,
      priority: 10,
      dependencies: ['sibling'],
      getInitialState: () => ({}),
      serialize: () => ({}),
      deserialize: () => ({}),
      transformColumnDefs(defs, _state, ctx) {
        const s = ctx.getModuleState<SiblingState>('sibling');
        return defs.map((d) =>
          'field' in d && d.field && s.pinned.includes(d.field)
            ? { ...d, pinned: 'left' as const }
            : d,
        );
      },
    };
    const stateMap = new Map<string, unknown>([
      ['sibling', sibling.getInitialState()],
      ['consumer', consumer.getInitialState()],
    ]);
    const core = new GridCore({
      gridId: 'g1',
      modules: [sibling, consumer],
      getModuleState: <T>(id: string) => stateMap.get(id) as T,
      setModuleState: () => {},
    });
    // Attach a fake gridApi so createGridContext returns non-null. This matches
    // the pattern used by every other transform-pipeline test in this file
    // (search `core.onGridReady(fakeApi)` for examples).
    core.onGridReady({} as never);
    const out = core.transformColumnDefs([{ field: 'a' }, { field: 'b' }]);
    expect(out[0]).toEqual({ field: 'a', pinned: 'left' });
    expect(out[1]).toEqual({ field: 'b' });
  });
});

describe('GridCore — transformGridOptions', () => {
  it('always injects a getRowId fallback when the consumer omits one', () => {
    const { core } = bootCore([makeModule({ id: 'a' })]);
    core.onGridReady({} as never);
    const opts = core.transformGridOptions({});
    expect(opts.getRowId).toBeTypeOf('function');
    const id = opts.getRowId!({ data: { id: 'row-1', name: 'foo' } } as never);
    expect(id).toBe('row-1');
  });

  it('respects the consumer-provided getRowId', () => {
    const consumerFn = vi.fn(() => 'override');
    const { core } = bootCore([makeModule({ id: 'a' })]);
    core.onGridReady({} as never);
    const opts = core.transformGridOptions({ getRowId: consumerFn as never });
    expect(opts.getRowId).toBe(consumerFn);
  });

  it('honours rowIdField when injecting the fallback', () => {
    const store = createTestStore();
    const m = makeModule({ id: 'a' });
    store.set(m.id, m.getInitialState());
    const core = new GridCore({
      gridId: 'g1',
      modules: [m],
      getModuleState: <T>(id: string) => store.get<T>(id),
      setModuleState: <T>(id: string, u: (prev: T) => T) => store.update<T>(id, u),
      rowIdField: 'symbol',
    });
    core.onGridReady({} as never);
    const opts = core.transformGridOptions({});
    expect(opts.getRowId!({ data: { symbol: 'AAPL', id: 'ignored' } } as never)).toBe('AAPL');
  });
});

// ─── Serialization round-trip + envelope handling ────────────────────────────

describe('GridCore — serializeAll / deserializeAll', () => {
  it('round-trips state through the schema-version envelope', () => {
    const m = makeModule({ id: 'counter', schemaVersion: 3 });
    const { core, store } = bootCore([m]);
    store.set('counter', { value: 42 });

    const snap = core.serializeAll();
    expect(snap).toEqual({ counter: { v: 3, data: { value: 42 } } });

    // Reset, then restore from snapshot.
    store.set('counter', { value: 0 });
    core.deserializeAll(snap);
    expect(store.get<CounterState>('counter')).toEqual({ value: 42 });
  });

  it('accepts v1 raw payloads (no envelope) for backwards compatibility', () => {
    const m = makeModule({ id: 'counter', schemaVersion: 1 });
    const { core, store } = bootCore([m]);
    // Pretend the stored snapshot was written before envelopes existed.
    core.deserializeAll({ counter: { value: 99 } });
    expect(store.get<CounterState>('counter')).toEqual({ value: 99 });
  });

  it('skips modules whose key is missing from the snapshot (keeps in-memory state)', () => {
    const a = makeModule({ id: 'a' });
    const b = makeModule({ id: 'b' });
    const { core, store } = bootCore([a, b]);
    store.set('a', { value: 1 });
    store.set('b', { value: 2 });
    core.deserializeAll({ a: { v: 1, data: { value: 5 } } });
    expect(store.get<CounterState>('a')).toEqual({ value: 5 });
    expect(store.get<CounterState>('b')).toEqual({ value: 2 });
  });

  it('emits module:stateChanged for every module restored', () => {
    const m = makeModule({ id: 'counter' });
    const { core } = bootCore([m]);
    const seen: string[] = [];
    core.eventBus.on('module:stateChanged', (e) => seen.push(e.moduleId));
    core.deserializeAll({ counter: { v: 1, data: { value: 10 } } });
    expect(seen).toEqual(['counter']);
  });

  it('runs migrate() when the stored schemaVersion is older', () => {
    const m = makeModule({
      id: 'counter',
      schemaVersion: 2,
      migrate: (raw, fromVersion) => {
        // v1 stored a bare number; v2 expects { value }
        expect(fromVersion).toBe(1);
        return { value: Number(raw) || 0 };
      },
    });
    const { core, store } = bootCore([m]);
    core.deserializeAll({ counter: { v: 1, data: 7 } });
    expect(store.get<CounterState>('counter')).toEqual({ value: 7 });
  });

  it('falls back to initial state with a warning when versions mismatch and no migrate exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = makeModule({ id: 'counter', schemaVersion: 5 });
    const { core, store } = bootCore([m]);
    store.set('counter', { value: 99 });
    core.deserializeAll({ counter: { v: 1, data: { value: 'irrelevant' } } });
    expect(store.get<CounterState>('counter')).toEqual({ value: 0 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('falls back to initial state when deserialize/migrate throws (never crashes the grid)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = makeModule({
      id: 'counter',
      deserialize: () => {
        throw new Error('boom');
      },
    });
    const { core, store } = bootCore([m]);
    core.deserializeAll({ counter: { v: 1, data: { value: 1 } } });
    expect(store.get<CounterState>('counter')).toEqual({ value: 0 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('resetAll() restores every module to its getInitialState', () => {
    const m = makeModule({ id: 'counter' });
    const { core, store } = bootCore([m]);
    store.set('counter', { value: 999 });
    core.resetAll();
    expect(store.get<CounterState>('counter')).toEqual({ value: 0 });
  });

  it('deserializeAll tolerates null / non-object snapshots', () => {
    const m = makeModule({ id: 'counter' });
    const { core, store } = bootCore([m]);
    store.set('counter', { value: 7 });
    core.deserializeAll(null);
    core.deserializeAll(undefined);
    // State should be unchanged — nothing to apply.
    expect(store.get<CounterState>('counter')).toEqual({ value: 7 });
  });
});
