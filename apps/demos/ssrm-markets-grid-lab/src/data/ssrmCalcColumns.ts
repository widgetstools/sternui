import type { ColDef } from 'ag-grid-community';
import {
  planSsrmCalcColumns,
  ssrmEngineCalcColumnDefs,
} from '@starui/grid/engine/ssrmCalcColumns';

/**
 * The calculated columns the `@starui/ssrm-engine` surfaces install.
 *
 * ONE list, shared by the Stress tab's `&calc=1` flag and the SSRM Engine tab,
 * because two lists is how they drift — which is the defect class this session
 * spent its time removing (a per-file stub with 2 of 21 names; a `beforeEach`
 * rebuilding a fixture from a stale literal).
 *
 * **Authored as STRINGS and run through the real planner**, not hand-built
 * ASTs. The path being demonstrated is the one a user takes — `tokenize` /
 * `parse` in `@starui/engine`, `planSsrmCalcColumns` in the customizer, and the
 * AST across a SharedWorker port — and a hand-built tree would skip the two
 * stages most likely to be wrong. The expressions are the lab's own curriculum
 * shapes over fields the stress book actually has.
 */
export interface LabCalcColumn {
  colId: string;
  headerName: string;
  expression: string;
  /**
   * The filter TYPE, never a bare `filter: true` — **on the CONTROL surface**.
   *
   * Under AG 36 enterprise `filter: true` resolves to `agSetColumnFilter`, and a
   * set filter under a SERVER row model has no values to offer: AG builds its
   * list from the rows the client model holds, which here is one block. Opening
   * one threw `r.values is not iterable` out of AG's own filter validation and
   * took the filter menu with it.
   *
   * The MarketsGrid surface does not need this and does not use it. There the
   * calculated columns come from the customizer, `buildVirtualColDef` gives them
   * `filter: true`, and `withServerSetFilterValues` hands every column a values
   * callback backed by `engine.distinctValues` — which answers a CALCULATED
   * column too, by scanning, and refuses above its ceiling rather than
   * truncating. The plain-`AgGridReact` control has no such wiring, so it keeps
   * the explicit filter type.
   */
  filter: 'agNumberColumnFilter' | 'agTextColumnFilter';
  /** Short note shown in the tab's legend, so the demo explains itself. */
  note: string;
}

export const LAB_SSRM_CALC_COLUMNS: LabCalcColumn[] = [
  {
    colId: 'calc_pnlPct',
    headerName: 'P&L % of Mkt',
    expression: 'IF([marketValue] > 0, ([dailyPnL] / [marketValue]) * 100, null)',
    filter: 'agNumberColumnFilter',
    note: 'A guarded division — the shape that produces a real calculated NULL.',
  },
  {
    colId: 'calc_dollarDur',
    headerName: 'Dollar Duration',
    expression: '[marketValue] * [modifiedDuration] / 100',
    filter: 'agNumberColumnFilter',
    note: 'Plain arithmetic over two stored columns.',
  },
  {
    colId: 'calc_band',
    headerName: 'Price Band',
    expression: 'IFS([midPrice] >= 105, "rich", [midPrice] >= 95, "fair", "cheap")',
    filter: 'agTextColumnFilter',
    note: 'A STRING result — group by this one.',
  },
  {
    colId: 'calc_notional',
    headerName: 'Notional',
    expression: '[quantityFace] * [midPrice] / 100',
    filter: 'agNumberColumnFilter',
    note: 'Depends on midPrice, so it moves on every price tick.',
  },
  /**
   * A guard that ACTUALLY FAILS on this book, which is the whole reason it is
   * here.
   *
   * `calc_pnlPct` above guards on `marketValue > 0` — realistic, and on the
   * generated stress book it is true for all 20,000 rows, so that column never
   * produces a calculated null. The first version of the SSRM Engine tab told
   * the reader to sort by it and "scroll to the bottom to see the nulls last".
   * There were none: the bottom rows read 0.002, 0.009, 0.016. Documentation
   * promising a behaviour the running demo cannot show is worse than not
   * mentioning it.
   *
   * `midPrice >= 105` is false for the ~15% of rows the price bands call
   * "cheap" and "fair", so this column is genuinely null on thousands of rows —
   * without poisoning the book, which is shared with the Stress tab and with
   * every documented measurement taken on it.
   */
  {
    colId: 'calc_richCarry',
    headerName: 'Carry (rich only)',
    expression: 'IF([midPrice] >= 105, [yieldToMaturity] / [modifiedDuration], null)',
    filter: 'agNumberColumnFilter',
    note: 'NULL wherever the guard fails — sort by this one to see nulls last in both directions.',
  },
  /**
   * The ONLY calculated column on this book that actually ticks — and the
   * reason it exists is a claim that was false without it.
   *
   * `stressTickPatch` moves exactly two fields, `NUMERIC_FIELDS[0]` and `[1]`,
   * which on this schema are `esgScore` and `originalMaturity`. Not one of the
   * columns above reads either, so none of them recomputes on a tick — while
   * the tab's help said "calc_notional depends on midPrice, so it moves on
   * every price tick". True of the expression, false of this book, and stated
   * to a reader watching a grid that was not moving.
   *
   * Built over the fields the book DOES tick, this makes the dependency rule
   * visible as a contrast rather than an assertion: this column moves, the
   * other five hold, and the difference is exactly which fields the frame
   * names. That is what `engine.calcPatch` decides per frame — AG flashes a
   * cell it is told changed, so re-stamping every calculated column on every
   * tick would paint a lie.
   */
  {
    colId: 'calc_liveSum',
    headerName: 'Live Sum (ticks)',
    expression: 'ROUND([esgScore] + [originalMaturity], 2)',
    filter: 'agNumberColumnFilter',
    note: 'Reads the two fields this book ticks — the only one that moves. Watch it against the others.',
  },
];

/**
 * Plan the expressions and collect the `{ colId, ast }` pairs the engine takes.
 *
 * A plan that does not parse is reported rather than dropped silently: the
 * engine's own refusals (unknown functions, cross-row reducers) surface through
 * `calcDiagnostics()` instead, which is the channel that works in a
 * SharedWorker — `console.warn` there reaches no console anywhere.
 */
export function buildLabCalcColumnDefs(): {
  defs: { colId: string; ast: unknown }[];
  unsupported: { colId: string; reason: string }[];
} {
  const plans = planSsrmCalcColumns(LAB_SSRM_CALC_COLUMNS, { backend: 'ssrm-engine' });
  return {
    defs: ssrmEngineCalcColumnDefs(plans),
    unsupported: plans
      .filter((plan): plan is Extract<typeof plan, { kind: 'unsupported' }> => plan.kind === 'unsupported')
      .map((plan) => ({ colId: plan.colId, reason: plan.reason })),
  };
}

/**
 * The SAME expressions as CUSTOMIZER state — what the MarketsGrid surface uses.
 *
 * This is the round trip session 6 has to prove, and it is a different path
 * from the control tab's: the calculated-columns MODULE holds these, its
 * pipeline stage builds the colDefs, `useSsrmEngineCalcColumns` plans them for
 * the `ssrm-engine` backend, and the AST crosses the worker port. Nothing here
 * is hand-built — the same authored strings, the same planner, one list.
 *
 * `position` puts them after the book's 120 stored columns; the pinning is a
 * column-customization assignment below, because that is where a user pinning a
 * column in the UI would put it.
 */
export const LAB_SSRM_VIRTUAL_COLUMNS = LAB_SSRM_CALC_COLUMNS.map((column, index) => ({
  colId: column.colId,
  headerName: column.headerName,
  expression: column.expression,
  cellDataType: column.filter === 'agTextColumnFilter' ? ('string' as const) : ('number' as const),
  position: 500 + index,
  initialWidth: 150,
}));

/**
 * Filter kind, row grouping and pinning — set the way the UI sets them.
 *
 * `buildVirtualColDef` gives a calculated column `sortable: true` and
 * `filter: true` and nothing else, and all three of those defaults need
 * amending for this demo:
 *
 * - **the filter kind.** `filter: true` resolves to `agSetColumnFilter` under
 *   AG Enterprise, and a set filter is the wrong control for a continuous
 *   number — worse, applying a NUMBER filter model to a column whose filter is
 *   a set filter throws `values is not iterable` out of AG's own validation.
 *   That surfaced here as a page error while the rows were nonetheless filtered
 *   correctly, because the ENGINE reads the model and AG's column filter is
 *   only the UI for it. `calc_band` keeps the set filter deliberately: it is a
 *   calculated STRING column, and its checkbox list is the thing the engine's
 *   `distinctValues` has to answer by scanning;
 * - **row grouping.** Without `enableRowGroup` a user cannot DRAG one into the
 *   row-group or values panel, and "group it from the grid's own UI" is the
 *   claim being demonstrated;
 * - **pinning.** Appended after 120 stored columns they sit off the right edge,
 *   so a reader arriving at a tab about calculated columns sees none of them.
 */
export const LAB_SSRM_CALC_CUSTOMIZATION = {
  assignments: Object.fromEntries(
    LAB_SSRM_CALC_COLUMNS.map((column) => [
      column.colId,
      {
        colId: column.colId,
        initialPinned: 'left' as const,
        filter: {
          enabled: true,
          kind:
            column.filter === 'agTextColumnFilter'
              ? ('agSetColumnFilter' as const)
              : ('agNumberColumnFilter' as const),
        },
        rowGrouping: {
          enableRowGroup: true,
          enableValue: true,
        },
      },
    ]),
  ),
};

/**
 * AG column defs for the calculated columns.
 *
 * No `valueGetter`: the engine stamps the value onto `data[colId]`, which is
 * the same place `buildVirtualColDef` falls back to on a group row ("SSRM
 * stamps the folded agg onto data[field]"). A getter here would recompute in
 * the window what the block already carries, and would answer null on every
 * group row.
 */
export function labCalcColumnDefs(
  colIds: readonly string[],
  options?: { pinned?: boolean },
): ColDef[] {
  const byId = new Map(LAB_SSRM_CALC_COLUMNS.map((c) => [c.colId, c]));
  return colIds.map((colId) => {
    const spec = byId.get(colId);
    return {
      colId,
      field: colId,
      headerName: spec?.headerName ?? colId,
      sortable: true,
      filter: spec?.filter ?? 'agNumberColumnFilter',
      enableRowGroup: true,
      enableValue: true,
      width: 150,
      /**
       * PINNED LEFT on the tab whose subject they are.
       *
       * They are appended after the book's 120 stored columns, so unpinned they
       * sit off the right edge and a reader arriving at a tab about calculated
       * columns sees none of them without scrolling — which is how "I don't see
       * any ticking" happens even when the ticking is real. The Stress tab
       * leaves them unpinned: there the 120 stored columns are the subject and
       * the calculated ones are a measured overhead.
       */
      ...(options?.pinned ? { pinned: 'left' as const } : {}),
    };
  });
}
