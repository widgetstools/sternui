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
   * The filter TYPE, never a bare `filter: true`.
   *
   * Under AG 36 enterprise `filter: true` resolves to `agSetColumnFilter`, and a
   * set filter under a SERVER row model has no values to offer — AG builds its
   * list from the rows the client model holds, which here is one block. Opening
   * one threw `r.values is not iterable` out of AG's own filter validation and
   * took the filter menu with it. Wiring the engine's `distinctValues` into a
   * real set filter is session 6's job.
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
 * AG column defs for the calculated columns.
 *
 * No `valueGetter`: the engine stamps the value onto `data[colId]`, which is
 * the same place `buildVirtualColDef` falls back to on a group row ("SSRM
 * stamps the folded agg onto data[field]"). A getter here would recompute in
 * the window what the block already carries, and would answer null on every
 * group row.
 */
export function labCalcColumnDefs(colIds: readonly string[]): ColDef[] {
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
      cellClass: 'lab-calc-cell',
    };
  });
}
