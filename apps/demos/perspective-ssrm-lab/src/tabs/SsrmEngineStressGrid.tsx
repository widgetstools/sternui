import { useCallback, useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { SsrmEngineClient } from '@starui/ssrm-engine/worker';
import {
  planSsrmCalcColumns,
  ssrmEngineCalcColumnDefs,
} from '@starui/grid/engine/ssrmCalcColumns';
import { SsrmEngineGrid } from './SsrmEngineGrid';
import { STRESS_KEY_FIELD, STRESS_ROW_COUNT } from '../data/stressColumns';
import { STRESS_BOOK_ID } from '../data/stressBook';

/**
 * Calculated columns for `?engine=ssrm&calc=1`, authored as STRINGS and parsed
 * by the real customizer planner.
 *
 * Authored strings rather than hand-built ASTs on purpose: the path being
 * exercised is the one a user takes — `tokenize` / `parse` in
 * `@starui/engine`, `planSsrmCalcColumns` in the customizer, and the AST across
 * the SharedWorker port — and a hand-built tree would skip the two stages most
 * likely to be wrong. The expressions are the lab's own curriculum shapes over
 * fields the stress book actually has.
 *
 * `calc_ratio` is the one to sort and filter on when measuring: it is null on
 * exactly the rows where the guard fails, so it exercises the absent-last rule
 * rather than only the arithmetic.
 */
const CALC_EXPRESSIONS = [
  { colId: 'calc_pnlPct', expression: 'IF([marketValue] > 0, ([dailyPnL] / [marketValue]) * 100, null)' },
  { colId: 'calc_dollarDur', expression: '[marketValue] * [modifiedDuration] / 100' },
  { colId: 'calc_band', expression: 'IFS([midPrice] >= 105, "rich", [midPrice] >= 95, "fair", "cheap")' },
  { colId: 'calc_notional', expression: '[quantityFace] * [midPrice] / 100' },
];

/**
 * The GENERATED Stress book, in the app's own SharedWorker.
 *
 * Reached with `?engine=ssrm`. Same row count, same 120 columns, same types and
 * the same tick rate as the Perspective surface beside it, so the probes that
 * measure that path — `rendererProcessProbe.mjs`, `multiWindowProbe.mjs` —
 * apply here unchanged and the numbers line up.
 *
 * A generated book has no provider, so it can live anywhere and lives here: an
 * app-owned worker keeps `stressBook.ts` (which may not touch React, AG Grid or
 * the DOM) out of `@starui/host-data`'s worker asset entirely. The provider-fed
 * peer is `SsrmProviderGrid`, and it does NOT have that freedom — see its note.
 */
export interface SsrmEngineStressGridProps {
  columnDefs: ColDef[];
  rowHeight?: number;
  /** Live tick interval, applied in the worker. 0 disables ticking. */
  tickMs?: number;
}

export function SsrmEngineStressGrid({
  columnDefs,
  rowHeight = 28,
  tickMs = 200,
}: SsrmEngineStressGridProps) {
  /**
   * `new URL(..., import.meta.url)` is what makes Vite emit the worker as its
   * own chunk; a string path would be shipped verbatim and 404 in a production
   * build. `name` matters too — a SharedWorker is identified by script URL AND
   * name, so every window naming the same pair lands on ONE worker, which is
   * the entire point.
   */
  const openClient = useCallback(() => {
    const worker = new SharedWorker(new URL('../workers/ssrmBookWorker.ts', import.meta.url), {
      type: 'module',
      name: 'starui-ssrm-book',
    });
    return SsrmEngineClient.open(worker.port, STRESS_BOOK_ID, {
      bookOptions: { rows: STRESS_ROW_COUNT, tickMs },
      onFault: (error) => {
        // eslint-disable-next-line no-console
        console.error('[ssrm-engine worker]', error);
      },
    });
  }, [tickMs]);

  /**
   * `&calc=1`, OFF by default, and the default is what the boundary baseline is
   * measured on.
   *
   * A flag rather than always-on because the block round trip through the port
   * is a documented figure (2.10 ms median) and installing four calculated
   * columns changes what a block carries. Both numbers are worth having and
   * neither is worth silently replacing with the other.
   */
  const calc = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    if (new URLSearchParams(window.location.search).get('calc') !== '1') return undefined;
    const plans = planSsrmCalcColumns(CALC_EXPRESSIONS, { backend: 'ssrm-engine' });
    for (const plan of plans) {
      if (plan.kind === 'unsupported') {
        // eslint-disable-next-line no-console
        console.warn(`[lab] ${plan.colId} did not parse: ${plan.reason}`);
      }
    }
    return ssrmEngineCalcColumnDefs(plans);
  }, []);

  /**
   * The calculated columns' colDefs carry NO `valueGetter`: the engine stamps
   * the value onto `data[colId]`, which is the same place `buildVirtualColDef`
   * falls back to on a group row ("SSRM stamps the folded agg onto
   * data[field]"). A getter here would recompute in the window what the block
   * already carries, and would answer null on every group row.
   */
  const defs = useMemo(
    () =>
      calc === undefined
        ? columnDefs
        : [
            ...columnDefs,
            ...calc.map((column) => ({
              colId: column.colId,
              field: column.colId,
              headerName: column.colId,
              sortable: true,
              filter: true,
              enableRowGroup: true,
              enableValue: true,
              width: 130,
            })),
          ],
    [columnDefs, calc],
  );

  return (
    <SsrmEngineGrid
      columnDefs={defs}
      rowHeight={rowHeight}
      keyField={STRESS_KEY_FIELD}
      openClient={openClient}
      calcColumns={calc}
    />
  );
}
