/**
 * Tests for the framework-free grid-to-grid context-link helpers:
 * selection → context (publish side), context → filter model (receive
 * side), and the merge-with-user-filters apply step.
 */

import { describe, it, expect, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import {
  GRID_LINK_CONTEXT_TYPE,
  buildSelectionContext,
  buildRowIdContext,
  defaultGridLinkResolver,
  applyGridLinkContext,
  applyRowIdExternalFilter,
  normalizeRowIdField,
  type GridLinkSelectionContext,
} from './gridContextLink.js';

/** Minimal fake GridApi exposing only what the helpers touch. */
function fakeApi(opts: {
  selectedNodes?: unknown[];
  filterModel?: Record<string, unknown>;
}): GridApi & { _model: Record<string, unknown> | null } {
  const state = { _model: (opts.filterModel ?? null) as Record<string, unknown> | null };
  return {
    getSelectedNodes: () => opts.selectedNodes ?? [],
    getFilterModel: () => state._model ?? {},
    setFilterModel: (m: Record<string, unknown> | null) => {
      state._model = m;
    },
    get _model() {
      return state._model;
    },
  } as unknown as GridApi & { _model: Record<string, unknown> | null };
}

describe('normalizeRowIdField', () => {
  it('defaults to ["id"], wraps a string, and passes arrays through', () => {
    expect(normalizeRowIdField(undefined)).toEqual(['id']);
    expect(normalizeRowIdField('symbol')).toEqual(['symbol']);
    expect(normalizeRowIdField(['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('buildSelectionContext', () => {
  it('collects de-duplicated key-field values from selected leaf rows', () => {
    const api = fakeApi({
      selectedNodes: [
        { data: { symbol: 'AAPL', book: 'EQ1' } },
        { data: { symbol: 'MSFT', book: 'EQ1' } },
      ],
    });
    const ctx = buildSelectionContext(api, { instanceId: 'grid-a', rowIdField: ['symbol', 'book'] });
    expect(ctx?.type).toBe(GRID_LINK_CONTEXT_TYPE);
    expect(ctx?.source).toBe('grid-a');
    expect(ctx?.criteria.symbol).toEqual(['AAPL', 'MSFT']);
    expect(ctx?.criteria.book).toEqual(['EQ1']); // de-duplicated
  });

  it('uses the grouped column id + group key for group rows', () => {
    const api = fakeApi({
      selectedNodes: [{ group: true, field: 'sector', key: 'Tech' }],
    });
    const ctx = buildSelectionContext(api, { instanceId: 'grid-a', rowIdField: ['symbol'] });
    expect(ctx?.criteria).toEqual({ sector: ['Tech'] });
  });

  it('skips null/undefined values', () => {
    const api = fakeApi({ selectedNodes: [{ data: { symbol: null, book: 'EQ1' } }] });
    const ctx = buildSelectionContext(api, { instanceId: 'g', rowIdField: ['symbol', 'book'] });
    expect(ctx?.criteria).toEqual({ book: ['EQ1'] });
  });

  it('returns empty criteria when nothing is selected (peers clear their filter)', () => {
    const api = fakeApi({ selectedNodes: [] });
    const ctx = buildSelectionContext(api, { instanceId: 'g', rowIdField: ['symbol'] });
    expect(ctx?.criteria).toEqual({});
  });
});

describe('buildRowIdContext', () => {
  it('broadcasts the getRowId values (node.id) of selected leaf rows', () => {
    const api = fakeApi({
      selectedNodes: [{ id: 'AAPL-EQ1', data: {} }, { id: 'MSFT-EQ1', data: {} }],
    });
    const ctx = buildRowIdContext(api, { instanceId: 'grid-a', rowIdField: ['ignored'] });
    expect(ctx?.rowIds).toEqual(['AAPL-EQ1', 'MSFT-EQ1']);
    expect(ctx?.criteria).toEqual({});
    expect(ctx?.source).toBe('grid-a');
  });

  it('skips group rows and null ids', () => {
    const api = fakeApi({
      selectedNodes: [
        { group: true, id: 'row-group-sector-Tech' },
        { id: null, data: {} },
        { id: 'AAPL-EQ1', data: {} },
      ],
    });
    const ctx = buildRowIdContext(api, { instanceId: 'g', rowIdField: ['id'] });
    expect(ctx?.rowIds).toEqual(['AAPL-EQ1']);
  });

  it('returns empty rowIds when nothing is selected', () => {
    const api = fakeApi({ selectedNodes: [] });
    expect(buildRowIdContext(api, { instanceId: 'g', rowIdField: ['id'] })?.rowIds).toEqual([]);
  });
});

describe('applyRowIdExternalFilter', () => {
  it('installs an external filter that passes only the broadcast ids (groups always pass)', () => {
    const opts: Record<string, unknown> = {};
    let filterChanged = 0;
    const api = {
      setGridOption: (k: string, v: unknown) => { opts[k] = v; },
      onFilterChanged: () => { filterChanged += 1; },
    } as unknown as GridApi;

    applyRowIdExternalFilter(api, {
      type: GRID_LINK_CONTEXT_TYPE,
      criteria: {},
      rowIds: ['AAPL-EQ1', 'MSFT-EQ1'],
    });

    expect((opts.isExternalFilterPresent as () => boolean)()).toBe(true);
    const pass = opts.doesExternalFilterPass as (n: { group?: boolean; id?: string }) => boolean;
    expect(pass({ id: 'AAPL-EQ1' })).toBe(true);
    expect(pass({ id: 'IBM-EQ1' })).toBe(false);
    expect(pass({ group: true })).toBe(true);
    expect(filterChanged).toBe(1);
  });

  it('removes the external filter on an empty id set', () => {
    const opts: Record<string, unknown> = {};
    const api = {
      setGridOption: (k: string, v: unknown) => { opts[k] = v; },
      onFilterChanged: () => {},
    } as unknown as GridApi;

    applyRowIdExternalFilter(api, { type: GRID_LINK_CONTEXT_TYPE, criteria: {}, rowIds: [] });
    expect((opts.isExternalFilterPresent as () => boolean)()).toBe(false);
  });
});

describe('defaultGridLinkResolver', () => {
  it('builds a set-filter model from criteria', () => {
    const ctx: GridLinkSelectionContext = {
      type: GRID_LINK_CONTEXT_TYPE,
      criteria: { symbol: ['AAPL', 'MSFT'] },
    };
    expect(defaultGridLinkResolver(ctx, fakeApi({}))).toEqual({
      symbol: { filterType: 'set', values: ['AAPL', 'MSFT'] },
    });
  });

  it('returns null for empty criteria so the link filter clears', () => {
    const ctx: GridLinkSelectionContext = { type: GRID_LINK_CONTEXT_TYPE, criteria: {} };
    expect(defaultGridLinkResolver(ctx, fakeApi({}))).toBeNull();
  });

  it('stringifies values for the set filter', () => {
    const ctx: GridLinkSelectionContext = { type: GRID_LINK_CONTEXT_TYPE, criteria: { qty: [100, 200] } };
    expect(defaultGridLinkResolver(ctx, fakeApi({}))).toEqual({
      qty: { filterType: 'set', values: ['100', '200'] },
    });
  });
});

describe('applyGridLinkContext', () => {
  it('applies the link filter and reports the owned fields', () => {
    const api = fakeApi({});
    const setSpy = vi.spyOn(api, 'setFilterModel');
    const ctx: GridLinkSelectionContext = {
      type: GRID_LINK_CONTEXT_TYPE,
      criteria: { symbol: ['AAPL'] },
    };
    const owned = applyGridLinkContext(api, ctx, defaultGridLinkResolver, []);
    expect(owned).toEqual(['symbol']);
    expect(setSpy).toHaveBeenCalledWith({ symbol: { filterType: 'set', values: ['AAPL'] } });
  });

  it("preserves the user's own column filters and only replaces link-owned fields", () => {
    const api = fakeApi({ filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'NY' } } });
    const ctx: GridLinkSelectionContext = {
      type: GRID_LINK_CONTEXT_TYPE,
      criteria: { symbol: ['AAPL'] },
    };
    applyGridLinkContext(api, ctx, defaultGridLinkResolver, []);
    expect(api._model).toEqual({
      desk: { filterType: 'text', type: 'equals', filter: 'NY' },
      symbol: { filterType: 'set', values: ['AAPL'] },
    });
  });

  it('clears only the previously link-owned field on an empty context, keeping user filters', () => {
    const api = fakeApi({
      filterModel: {
        desk: { filterType: 'text', type: 'equals', filter: 'NY' },
        symbol: { filterType: 'set', values: ['AAPL'] },
      },
    });
    const empty: GridLinkSelectionContext = { type: GRID_LINK_CONTEXT_TYPE, criteria: {} };
    const owned = applyGridLinkContext(api, empty, defaultGridLinkResolver, ['symbol']);
    expect(owned).toEqual([]);
    expect(api._model).toEqual({ desk: { filterType: 'text', type: 'equals', filter: 'NY' } });
  });

  it('sets the model to null when nothing remains', () => {
    const api = fakeApi({ filterModel: { symbol: { filterType: 'set', values: ['AAPL'] } } });
    const empty: GridLinkSelectionContext = { type: GRID_LINK_CONTEXT_TYPE, criteria: {} };
    applyGridLinkContext(api, empty, defaultGridLinkResolver, ['symbol']);
    expect(api._model).toBeNull();
  });
});
