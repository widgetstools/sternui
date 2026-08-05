import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import type { ColDef, GridApi } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  createSsrmDatasource,
  createSsrmEngine,
  makeSsrmGetRowId,
  SSRM_CHILD_COUNT,
  type SsrmRow,
} from '@starui/ssrm-engine';
import {
  STRESS_COLUMN_FIELDS,
  STRESS_FIELD_TYPES,
  STRESS_KEY_FIELD,
  STRESS_ROW_COUNT,
} from '../data/stressColumns';

/**
 * The Stress book on `@starui/ssrm-engine`, for a like-for-like comparison with
 * the Perspective surface beside it.
 *
 * Reached with `?engine=ssrm`. Same row count, same 120 columns, same types and
 * the same tick rate as the default surface, so the probes that measure the
 * Perspective path — `sortRecoveryProbe.mjs`, `stubVisibilityProbe.mjs` — apply
 * here unchanged and the numbers line up.
 *
 * **The book is generated IN THIS WINDOW**, deliberately and as a limitation.
 * The engine has no worker hosting yet, so this demonstrates the engine and the
 * AG contract, NOT the multi-window shared-book topology that the Perspective
 * path exists to provide. A renderer memory figure taken here is therefore not
 * comparable: this window holds the whole book by construction.
 *
 * Plain `AgGridReact` rather than `MarketsGrid`: the customizer, profiles,
 * toolbars and alerts all bind to the platform, and none of that is wired to
 * this engine. What is being tested is the row supply.
 */

/**
 * The SAME module set the rest of the lab uses, and registering a subset is not
 * an option.
 *
 * MEASURED the hard way, twice. First the surface mounted with no rows at all
 * and the only signal was AG **error #200 — missing ServerSideRowModelModule**,
 * because the lab registers its modules on the MarketsGrid path and this one
 * deliberately does not go through it. Registering three modules by hand fixed
 * the rows and produced a subtler failure: `getColumns()` and
 * `getDisplayedRowCount()` returned **null and undefined on a live, undestroyed
 * api** while 28 rows were painted on screen. AG Grid 36 gates its API surface
 * behind modules, so an unregistered one leaves the method present and inert.
 *
 * A silently inert api is exactly the kind of thing that makes a probe report a
 * confident zero, so this registers the whole enterprise bundle — the same thing
 * `ensureAgGridModules` does for `MarketsGrid` — rather than a hand-picked list.
 * Registration is idempotent, so doing it twice costs nothing.
 *
 * Imported straight from `ag-grid-enterprise` rather than through the
 * `@starui/grid` barrel: pulling that barrel in at module scope changed what
 * loads at app boot and left the Stress tab rendering nothing at all, with no
 * console error to say so.
 */
ModuleRegistry.registerModules([AllEnterpriseModule]);

/** Deterministic, so two runs of a probe measure the same book. */
function generateBook(rows: number): SsrmRow[] {
  const dimensions = STRESS_COLUMN_FIELDS.filter((f) => STRESS_FIELD_TYPES[f] === 'string');
  const numerics = STRESS_COLUMN_FIELDS.filter((f) => STRESS_FIELD_TYPES[f] === 'number');
  const values = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];

  const book: SsrmRow[] = [];
  for (let r = 0; r < rows; r++) {
    const row: SsrmRow = { [STRESS_KEY_FIELD]: `POS-${r}` };
    dimensions.forEach((field, d) => {
      row[field] = values[(r + d) % values.length];
    });
    numerics.forEach((field, n) => {
      row[field] = ((r * 7 + n * 13) % 100_000) / 100;
    });
    book.push(row);
  }
  return book;
}

export interface SsrmEngineStressGridProps {
  columnDefs: ColDef[];
  rowHeight?: number;
  /** Live tick interval. 0 disables ticking. */
  tickMs?: number;
}

export function SsrmEngineStressGrid({
  columnDefs,
  rowHeight = 28,
  tickMs = 200,
}: SsrmEngineStressGridProps) {
  const apiRef = useRef<GridApi | null>(null);
  const [ready, setReady] = useState(false);

  const engine = useMemo(() => {
    const built = createSsrmEngine({
      schema: {
        keyField: STRESS_KEY_FIELD,
        fields: [
          { field: STRESS_KEY_FIELD, type: 'string' },
          ...STRESS_COLUMN_FIELDS.map((field) => ({
            field,
            type: STRESS_FIELD_TYPES[field],
          })),
        ],
      },
    });
    built.applySnapshot(generateBook(STRESS_ROW_COUNT));
    return built;
  }, []);

  const datasource = useMemo(
    () =>
      createSsrmDatasource(engine, {
        // eslint-disable-next-line no-console
        onError: (error) => console.error('[ssrm-engine] block failed', error),
      }),
    [engine],
  );

  const getRowId = useMemo(() => makeSsrmGetRowId(STRESS_KEY_FIELD), []);

  /**
   * The live path: PUSH the rows that changed, do not invalidate blocks.
   *
   * This is the whole point of the engine reporting a delta. The Perspective
   * surface had to re-read its viewport every tick because `on_update` does not
   * say which rows moved; here the changed keys come back from `applyUpdate`,
   * so a tick is one transaction of exactly the rows that ticked.
   */
  useEffect(() => {
    if (!ready || tickMs <= 0) return;
    const numerics = STRESS_COLUMN_FIELDS.filter((f) => STRESS_FIELD_TYPES[f] === 'number');
    let cursor = 0;

    const timer = setInterval(() => {
      const batch: SsrmRow[] = [];
      for (let i = 0; i < 200; i++) {
        cursor = (cursor + 37) % STRESS_ROW_COUNT;
        batch.push({
          [STRESS_KEY_FIELD]: `POS-${cursor}`,
          [numerics[0]]: Math.round(Math.random() * 100_000) / 100,
          [numerics[1]]: Math.round(Math.random() * 100_000) / 100,
        });
      }
      const delta = engine.applyUpdate(batch);
      const api = apiRef.current;
      if (!api || api.isDestroyed?.()) return;

      // Only rows AG actually holds are worth pushing — a transaction for a row
      // outside the block cache is ignored, and building it is wasted work.
      const update: SsrmRow[] = [];
      for (const key of delta.changed) {
        const node = api.getRowNode(String(key));
        if (node?.data) update.push({ ...(node.data as SsrmRow), ...engineRow(engine, key) });
      }
      if (update.length > 0) api.applyServerSideTransaction({ update });
    }, tickMs);

    return () => clearInterval(timer);
  }, [ready, tickMs, engine]);

  return (
    <div style={{ flex: 1, minHeight: 0, width: '100%' }} data-testid="ssrm-engine-grid">
      <AgGridReact
        columnDefs={columnDefs}
        rowModelType="serverSide"
        serverSideDatasource={datasource as never}
        getRowId={getRowId as never}
        rowHeight={rowHeight}
        cacheBlockSize={100}
        maxBlocksInCache={100}
        blockLoadDebounceMillis={40}
        animateRows={false}
        suppressAggFuncInHeader
        /**
         * Must match the engine's `pivotResultFieldSeparator`. AG rebuilds its
         * secondary columns by SPLITTING each `pivotResultFields` entry on this,
         * so a mismatch does not error — it silently carves the field name in
         * the wrong place and produces columns named after fragments.
         */
        serverSidePivotResultFieldSeparator="_"
        sideBar={{ toolPanels: ['columns', 'filters'] }}
        rowGroupPanelShow="always"
        pivotPanelShow="always"
        getChildCount={(data: SsrmRow) => data?.[SSRM_CHILD_COUNT] as number}
        onGridReady={(event) => {
          apiRef.current = event.api;
          /**
           * A measurement handle, the same affordance `useLabPerspectiveRows`
           * gives the MarketsGrid path through `__labGrid`.
           *
           * Unconditional rather than DEV-only: every measurement on this path
           * is taken against a PRODUCTION build (the dev server serves hundreds
           * of modules per window and a third window never finishes loading), so
           * a DEV-gated handle is a handle that no probe can ever reach. Walking
           * `__reactFiber$` finds the api on the MarketsGrid surface but not on a
           * plain `AgGridReact`, which is what made this necessary.
           */
          (globalThis as Record<string, unknown>).__ssrmEngineGrid = {
            api: event.api,
            engine,
          };
          setReady(true);
        }}
      />
    </div>
  );
}

/** The engine's current row for a key, as a plain object. */
function engineRow(
  engine: ReturnType<typeof createSsrmEngine>,
  key: unknown,
): SsrmRow {
  const offset = engine.store.offsetOf(key);
  return offset === undefined ? {} : engine.store.rowAt(offset);
}
