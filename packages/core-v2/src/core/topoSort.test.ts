import { describe, expect, it } from 'vitest';
import { topoSortModules } from './topoSort';
import type { AnyModule } from './types';

function mod(id: string, deps: string[] = [], priority = 100): AnyModule {
  return {
    id,
    name: id,
    schemaVersion: 1,
    priority,
    dependencies: deps,
    getInitialState: () => ({}),
    serialize: (s) => s,
    deserialize: (raw) => raw ?? {},
  };
}

describe('topoSortModules', () => {
  it('returns the empty array unchanged', () => {
    expect(topoSortModules([])).toEqual([]);
  });

  it('preserves stable order when there are no deps and equal priorities', () => {
    const a = mod('a');
    const b = mod('b');
    const c = mod('c');
    expect(topoSortModules([a, b, c]).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by priority within the ready frontier', () => {
    const a = mod('a', [], 200);
    const b = mod('b', [], 50);
    const c = mod('c', [], 100);
    expect(topoSortModules([a, b, c]).map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('respects dependency edges across priority boundaries', () => {
    // Even though `dependent` has a lower priority, it must come after its dep.
    const dependent = mod('dependent', ['producer'], 10);
    const producer = mod('producer', [], 999);
    expect(topoSortModules([dependent, producer]).map((m) => m.id)).toEqual([
      'producer',
      'dependent',
    ]);
  });

  it('throws on duplicate ids', () => {
    expect(() => topoSortModules([mod('x'), mod('x')])).toThrow(/Duplicate module id: "x"/);
  });

  it('throws on unknown deps with the offending pair in the message', () => {
    expect(() => topoSortModules([mod('a', ['ghost'])])).toThrow(
      /Module "a" depends on unknown module "ghost"/,
    );
  });

  it('throws on cycles with the involved ids in the message', () => {
    const a = mod('a', ['b']);
    const b = mod('b', ['a']);
    expect(() => topoSortModules([a, b])).toThrow(/Cyclic module dependencies.*a.*b|b.*a/);
  });

  it('handles a diamond dependency graph', () => {
    //   a
    //  / \
    // b   c
    //  \ /
    //   d
    const a = mod('a');
    const b = mod('b', ['a'], 10);
    const c = mod('c', ['a'], 20);
    const d = mod('d', ['b', 'c']);
    const order = topoSortModules([d, c, b, a]).map((m) => m.id);
    expect(order[0]).toBe('a');
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    // Within ready frontier, b (priority 10) precedes c (priority 20).
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });
});
