/**
 * Transform-layer tests for column-customization.
 *
 * Focus: the `cellStyle` emission that drives Excel-format color tags
 * (`[Red]` / `[Green]`). The transition case — switching from a colored
 * format to a plain one — was broken because the transform used to only
 * assign `cellStyle` when the NEW format had color tags, leaving any
 * previous formatter's inline `color` stuck on already-rendered cells
 * until full reload. The fix: always emit `cellStyle` whenever a
 * formatter is active (either a color-resolving fn OR a constant
 * `{ color: '' }` clearer).
 */
import { afterEach, describe, it, expect } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import {
  applyAssignments,
  applyFilterConfigToColDef,
  __resetFilterParamsCacheForTests,
} from './transforms';
import type { ColumnCustomizationState, ColumnFilterConfig } from './state';
import type { ColumnTemplatesState } from '../column-templates';

/** Stub — transforms only touch engine in custom aggFunc path, which
 *  these tests don't exercise. We implement the full
 *  `ExpressionEngineLike` surface so the arg typechecks; every method
 *  is a no-op that returns a placeholder. */
const NOOP_ENGINE = {
  parse: () => ({}),
  evaluate: () => 0,
  parseAndEvaluate: () => 0,
  validate: () => ({ valid: true, errors: [] }),
};

const EMPTY_TEMPLATES: ColumnTemplatesState = { templates: {}, typeDefaults: {} };

function makeState(template: { kind: 'excelFormat'; format: string } | undefined): ColumnCustomizationState {
  return {
    assignments: {
      price: {
        colId: 'price',
        valueFormatterTemplate: template,
      },
    },
  };
}

function applyAndGetCellStyle(state: ColumnCustomizationState, sourceColDef: ColDef = { colId: 'price' }): ColDef['cellStyle'] {
  const [out] = applyAssignments([sourceColDef], state.assignments, EMPTY_TEMPLATES, NOOP_ENGINE);
  return (out as ColDef).cellStyle;
}

describe('applyAssignments — cellStyle emission for Excel format color tags', () => {
  it('emits a color-resolving cellStyle fn when format has [Green]/[Red]', () => {
    const state = makeState({ kind: 'excelFormat', format: '[Green]#,##0.00;[Red]#,##0.00' });
    const cellStyle = applyAndGetCellStyle(state);

    expect(typeof cellStyle).toBe('function');
    const posResult = (cellStyle as Function)({ value: 42 });
    expect(posResult).toHaveProperty('color');
    expect((posResult as { color: string }).color).toBeTruthy();
    const negResult = (cellStyle as Function)({ value: -42 });
    expect(negResult).toHaveProperty('color');
    expect((negResult as { color: string }).color).toBeTruthy();
  });

  it('emits a clearing cellStyle fn when format has NO color tags (regression: red stuck until reload)', () => {
    const state = makeState({ kind: 'excelFormat', format: '#,##0.00' });
    const cellStyle = applyAndGetCellStyle(state);

    // Must be a function so AG-Grid overrides the previous formatter's
    // inline color. Returning `{ color: '' }` resets `cell.style.color`.
    expect(typeof cellStyle).toBe('function');
    const result = (cellStyle as Function)({ value: 42 });
    expect(result).toEqual({ color: '' });
  });

  it('within a colored format, non-colored sections return `{ color: \'\' }` (not `null`)', () => {
    // `[Red]0.00;0.00` — section 1 red for positives, section 2 plain
    // for negatives. The negative section must clear any prior red on
    // re-render, not skip the update (that's what allowed the color to
    // stick across value changes before the fix).
    const state = makeState({ kind: 'excelFormat', format: '[Red]0.00;0.00' });
    const cellStyle = applyAndGetCellStyle(state);

    expect(typeof cellStyle).toBe('function');
    const negResult = (cellStyle as Function)({ value: -42 });
    expect(negResult).toEqual({ color: '' });
    // Positive side still paints red via the color resolver.
    const posResult = (cellStyle as Function)({ value: 42 });
    expect(posResult).toHaveProperty('color');
    expect((posResult as { color: string }).color).toBeTruthy();
    expect((posResult as { color: string }).color).not.toBe('');
  });

  it('leaves the source colDef.cellStyle alone when no formatter is active AND colDef has its own cellStyle', () => {
    // User-provided cellStyle must not be clobbered by the transform
    // when the column has no formatter assignment.
    const userCellStyle = () => ({ background: 'pink' });
    const source: ColDef = { colId: 'price', cellStyle: userCellStyle };
    const state: ColumnCustomizationState = { assignments: {} };

    const [out] = applyAssignments([source], state.assignments, EMPTY_TEMPLATES, NOOP_ENGINE);
    // No assignment → transform returns the input def unchanged (same reference).
    expect(out).toBe(source);
  });

  it('does NOT overwrite user-provided cellStyle when formatter has no color AND user set a cellStyle', () => {
    // Edge case: user already wired a cellStyle on the source colDef,
    // then adds a plain formatter. We must not stomp on their handler.
    const userCellStyle = () => ({ background: 'pink' });
    const source: ColDef = { colId: 'price', cellStyle: userCellStyle };
    const state = makeState({ kind: 'excelFormat', format: '#,##0.00' });

    const [out] = applyAssignments([source], state.assignments, EMPTY_TEMPLATES, NOOP_ENGINE);
    expect((out as ColDef).cellStyle).toBe(userCellStyle);
  });
});

// ─── filterParams reference stability ────────────────────────────────────
//
// AG-Grid's React adapter re-instantiates a column's filter component
// when its `filterParams` reference changes. For `agMultiColumnFilter`
// specifically, that re-instantiates every nested child filter — and
// the floating filter mini-input loses its in-progress text on every
// transform run. The fix: cache the produced params object per colId
// and return the same reference when the input config hasn't deep-
// changed since the last call.

describe('applyFilterConfigToColDef — filterParams reference stability', () => {
  afterEach(() => __resetFilterParamsCacheForTests());

  it('returns the SAME filterParams object across calls when cfg deep-equals (agMultiColumnFilter)', () => {
    const cfg1: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      floatingFilter: true,
      multiFilters: [
        { filter: 'agTextColumnFilter' },
        { filter: 'agSetColumnFilter', display: 'subMenu' },
      ],
    };
    // Fresh cfg object with the same SHAPE — simulates resolveTemplates
    // producing a new merged object each transform run while the user
    // hasn't actually changed anything.
    const cfg2: ColumnFilterConfig = JSON.parse(JSON.stringify(cfg1));

    const colDef1: ColDef = { colId: 'price' };
    const colDef2: ColDef = { colId: 'price' };

    applyFilterConfigToColDef(colDef1, cfg1, 'price');
    applyFilterConfigToColDef(colDef2, cfg2, 'price');

    // Same structural cfg ⇒ same params reference. AG-Grid's diff sees
    // no change ⇒ filter component does NOT re-instantiate.
    expect(colDef2.filterParams).toBe(colDef1.filterParams);
    // And nested filters[] inside the same params object stay
    // referentially identical too.
    expect(
      (colDef2.filterParams as { filters: unknown[] }).filters,
    ).toBe((colDef1.filterParams as { filters: unknown[] }).filters);
  });

  it('returns a DIFFERENT filterParams object when cfg actually changes', () => {
    const cfgA: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      multiFilters: [{ filter: 'agTextColumnFilter' }],
    };
    const cfgB: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      multiFilters: [{ filter: 'agSetColumnFilter' }],
    };

    const colDef1: ColDef = { colId: 'price' };
    const colDef2: ColDef = { colId: 'price' };
    applyFilterConfigToColDef(colDef1, cfgA, 'price');
    applyFilterConfigToColDef(colDef2, cfgB, 'price');

    expect(colDef2.filterParams).not.toBe(colDef1.filterParams);
  });

  it('caches per colId — same cfg on different cols produces different params', () => {
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      multiFilters: [{ filter: 'agTextColumnFilter' }],
    };
    const colA: ColDef = { colId: 'a' };
    const colB: ColDef = { colId: 'b' };
    applyFilterConfigToColDef(colA, cfg, 'a');
    applyFilterConfigToColDef(colB, cfg, 'b');
    // Each colId has its own cache slot — refs intentionally differ
    // even though the CONTENTS are equal. (A second pass with the same
    // cfg+colId WOULD reuse, covered above.)
    expect(colA.filterParams).not.toBe(colB.filterParams);
    // ...but the structures still match.
    expect(colA.filterParams).toEqual(colB.filterParams);
  });

  it('disabled cfg clears filter + drops cache entry', () => {
    const cfg1: ColumnFilterConfig = {
      enabled: true,
      kind: 'agTextColumnFilter',
      debounceMs: 200,
    };
    const colDef1: ColDef = { colId: 'price' };
    applyFilterConfigToColDef(colDef1, cfg1, 'price');
    expect(colDef1.filterParams).toBeDefined();

    // Now disable.
    const colDef2: ColDef = { colId: 'price' };
    applyFilterConfigToColDef(colDef2, { enabled: false }, 'price');
    expect(colDef2.filter).toBe(false);
    expect(colDef2.filterParams).toBeUndefined();

    // Re-enable with original cfg — should produce a NEW params (cache
    // was cleared on disable). Important: a stale cached object must
    // NOT survive a disable/re-enable cycle.
    const colDef3: ColDef = { colId: 'price' };
    applyFilterConfigToColDef(colDef3, cfg1, 'price');
    expect(colDef3.filterParams).toBeDefined();
    expect(colDef3.filterParams).not.toBe(colDef1.filterParams);
  });

  it('without colId, falls back to non-cached behavior (each call gets fresh params)', () => {
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      multiFilters: [{ filter: 'agTextColumnFilter' }],
    };
    const colDef1: ColDef = { colId: 'price' };
    const colDef2: ColDef = { colId: 'price' };
    applyFilterConfigToColDef(colDef1, cfg);
    applyFilterConfigToColDef(colDef2, cfg);
    // No cache key ⇒ no reuse. Documented escape hatch for callers
    // that don't have a stable colId to key on.
    expect(colDef2.filterParams).not.toBe(colDef1.filterParams);
  });

  it('layers on top of host-provided filterParams (e.g., defaultColDef.filterParams)', () => {
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agTextColumnFilter',
      debounceMs: 200,
    };
    const colDef: ColDef = {
      colId: 'price',
      filterParams: { applyMiniFilterWhilePresent: true } as Record<string, unknown>,
    };
    applyFilterConfigToColDef(colDef, cfg, 'price');
    expect(colDef.filterParams).toMatchObject({
      applyMiniFilterWhilePresent: true,
      debounceMs: 200,
    });
  });
});

// AG-Grid 35.2.x bug: agMultiColumnFloatingFilter mishandles backspace
// when the column id contains a dot. We bypass the wrapper by routing
// the floating filter to `agTextColumnFloatingFilter` directly when the
// first sub-filter is text and the column id is dotted.
describe('applyFilterConfigToColDef — nested-field multi-filter floating bypass', () => {
  afterEach(() => __resetFilterParamsCacheForTests());

  it('routes floating filter to agTextColumnFloatingFilter when id is dotted + text first', () => {
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      floatingFilter: true,
      multiFilters: [
        { filter: 'agTextColumnFilter' },
        { filter: 'agSetColumnFilter' },
      ],
    };
    const colDef: ColDef = { colId: 'quote.bid' };
    applyFilterConfigToColDef(colDef, cfg, 'quote.bid');
    expect(colDef.floatingFilterComponent).toBe('agTextColumnFloatingFilter');
    // The multi-filter itself stays as the column filter — only the
    // floating row's component is overridden. The popup still shows
    // both children.
    expect(colDef.filter).toBe('agMultiColumnFilter');
  });

  it('does NOT override when the col id is flat (no dot) — flat-id case has no bug', () => {
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      multiFilters: [
        { filter: 'agTextColumnFilter' },
        { filter: 'agSetColumnFilter' },
      ],
    };
    const colDef: ColDef = { colId: 'price' };
    applyFilterConfigToColDef(colDef, cfg, 'price');
    expect(colDef.floatingFilterComponent).toBeUndefined();
  });

  it('does NOT override when the first sub-filter is NOT text', () => {
    // Set first, text second: floating filter would represent set's
    // mini-search, which we don't have a clean bypass for. Leave AG-
    // Grid's default in place.
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      multiFilters: [
        { filter: 'agSetColumnFilter' },
        { filter: 'agTextColumnFilter' },
      ],
    };
    const colDef: ColDef = { colId: 'quote.bid' };
    applyFilterConfigToColDef(colDef, cfg, 'quote.bid');
    expect(colDef.floatingFilterComponent).toBeUndefined();
  });

  it('does NOT override for a non-multi filter even on a dotted id', () => {
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agTextColumnFilter',
    };
    const colDef: ColDef = { colId: 'quote.bid' };
    applyFilterConfigToColDef(colDef, cfg, 'quote.bid');
    expect(colDef.floatingFilterComponent).toBeUndefined();
  });

  it('falls back to merged.field when no explicit colId arg is provided', () => {
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      multiFilters: [{ filter: 'agTextColumnFilter' }],
    };
    const colDef: ColDef = { field: 'quote.bid' };
    applyFilterConfigToColDef(colDef, cfg);
    expect(colDef.floatingFilterComponent).toBe('agTextColumnFloatingFilter');
  });

  it('clears a previously-set bypass when the config changes to a non-bypass case', () => {
    // First run — bypass applied.
    const cfgWithBypass: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      multiFilters: [{ filter: 'agTextColumnFilter' }],
    };
    const colDef1: ColDef = { colId: 'quote.bid' };
    applyFilterConfigToColDef(colDef1, cfgWithBypass, 'quote.bid');
    expect(colDef1.floatingFilterComponent).toBe('agTextColumnFloatingFilter');

    // Second run — same colId, but the user has switched to a single
    // text filter. The colDef passed in carries the prior bypass (as
    // would happen if a host kept a reference) — we must clear it.
    const colDef2: ColDef = {
      colId: 'quote.bid',
      floatingFilterComponent: 'agTextColumnFloatingFilter',
    };
    const cfgPlain: ColumnFilterConfig = {
      enabled: true,
      kind: 'agTextColumnFilter',
    };
    applyFilterConfigToColDef(colDef2, cfgPlain, 'quote.bid');
    expect(colDef2.floatingFilterComponent).toBeUndefined();
  });

  it('does NOT clobber a host-provided floatingFilterComponent we did not set', () => {
    // Host explicitly registered their own custom floating filter — we
    // must not stomp on it. Detection: only clear when the value
    // matches our own bypass ('agTextColumnFloatingFilter').
    const cfg: ColumnFilterConfig = {
      enabled: true,
      kind: 'agTextColumnFilter',
    };
    const colDef: ColDef = {
      colId: 'price',
      floatingFilterComponent: 'myCustomFloatingFilter' as unknown as ColDef['floatingFilterComponent'],
    };
    applyFilterConfigToColDef(colDef, cfg, 'price');
    expect(colDef.floatingFilterComponent).toBe('myCustomFloatingFilter');
  });
});

describe('applyAssignments — filter reference stability through the walker', () => {
  afterEach(() => __resetFilterParamsCacheForTests());

  it('the same assignment across two transform runs preserves filterParams ref', () => {
    const filter: ColumnFilterConfig = {
      enabled: true,
      kind: 'agMultiColumnFilter',
      floatingFilter: true,
      multiFilters: [{ filter: 'agTextColumnFilter' }, { filter: 'agSetColumnFilter' }],
    };
    const stateA: ColumnCustomizationState = {
      assignments: { price: { colId: 'price', filter } },
    };
    // Simulate a second transform pass with a structurally-equal but
    // freshly-allocated filter (what resolveTemplates produces).
    const stateB: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          filter: JSON.parse(JSON.stringify(filter)) as ColumnFilterConfig,
        },
      },
    };

    const defs: ColDef[] = [{ colId: 'price' }];
    const [outA] = applyAssignments(defs, stateA.assignments, EMPTY_TEMPLATES, NOOP_ENGINE);
    const [outB] = applyAssignments(defs, stateB.assignments, EMPTY_TEMPLATES, NOOP_ENGINE);

    // The whole point of the cache: same filter content ⇒ same
    // filterParams ref ⇒ AG-Grid's React adapter doesn't re-instantiate
    // the multi-filter children mid-keystroke.
    expect((outB as ColDef).filterParams).toBe((outA as ColDef).filterParams);
  });
});
