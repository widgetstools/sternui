import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarketsGrid, type SsrmEngineMarketsGridSurfaceHandle } from '@starui/grid';
import { parse, tokenize } from '@starui/engine';
import {
  buildStressColumnDefs,
  stressDefaultColDef,
  STRESS_KEY_FIELD,
  STRESS_ROW_COUNT,
} from '../data/stressColumns';
import { useSsrmBook } from '../data/useSsrmBook';
import { labStorage } from '../data/storage';
import { SSRM_LAB_PROFILES, SSRM_LAB_SEED } from '../profiles/seed';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { LAB_STATUS_BAR } from './labStatusBar';

/**
 * The product surface, and the only grid in this app.
 *
 * `rowModel="ssrm-engine"` with a client onto the worker-held book. There is no
 * engine switch here and nothing that changes WHICH ENGINE is mounted — which
 * is the whole reason this app exists. The bake-off lab
 * (`@starui/perspective-ssrm-lab`) puts two engines behind `?engine=`, and a
 * reader could not tell from the screen which one they were looking at; two
 * measurements in session 9 were taken on the wrong assumption before a probe
 * was written that could tell them apart.
 *
 * `?rows=` and `?tick=` do not reintroduce that. They size the ONE book and set
 * its tick rate; the size is printed in the header, carried in the book id, and
 * reported on the measurement handle, so all three would have to agree on a lie
 * for a reader to be misled about what they are looking at.
 *
 * `client` is `null` while the book is opening, and the host reads that as
 * "mount NO grid". That is not a nicety: exactly one grid may mount per
 * `GridPlatform`, ever, and a CSRM stand-in during the attach fires
 * `onGridReady` and then `onGridPreDestroyed` → `platform.destroy()`, which is
 * permanent — leaving a grid that looks healthy with every platform-driven
 * feature silently dead.
 */

/** Required by the props type and UNUSED: the rows come from the worker. */
const NO_ROWS: never[] = [];

/** Block round trips, kept for the probes. Bounded — this runs for minutes. */
const BLOCK_SAMPLE_CAP = 4_000;

/** One grid, one id. Profiles and grid state key off it. */
const GRID_ID = 'ssrm-markets-grid-lab';

export interface SsrmMarketsGridProps {
  /** Live tick interval applied in the worker. 0 disables ticking. */
  tickMs?: number;
  /**
   * Rows in the book. The book id carries it, so two sizes are two books and a
   * still-running worker cannot hand back the previous one.
   */
  rows?: number;
  /**
   * Which row shape to mount. Tree data and master/detail are NEW MarketsGrid
   * API rather than restored parity — the CSRM surface exposes neither, and
   * until this session they existed only on the Perspective surface.
   */
  mode?: 'flat' | 'tree' | 'detail';
  onReady?: () => void;
}

/**
 * desk -> book. Two levels, so a child level is a route rather than a leaf.
 *
 * Both are REAL fields of this book, and that is not a detail: the first draft
 * used `region`, which this book does not have — the engine bucketed all 50,000
 * rows into one null group, AG showed a single empty-keyed root, and it looked
 * exactly like a broken hierarchy rather than a mistyped field name.
 */
const TREE_FIELDS = ['desk', 'book'] as const;

export function SsrmMarketsGrid({
  tickMs = 200,
  rows = STRESS_ROW_COUNT,
  mode = 'flat',
  onReady,
}: SsrmMarketsGridProps) {
  const { client, fault, openCost } = useSsrmBook(tickMs, rows);
  const surfaceRef = useRef<SsrmEngineMarketsGridSurfaceHandle | null>(null);
  const blocksRef = useRef<{ ms: number[]; served: number; failed: number }>({
    ms: [],
    served: 0,
    failed: 0,
  });
  const [status, setStatus] = useState<'opening' | 'ready'>('opening');

  const onBlock = useCallback((ms: number, outcome: 'ok' | 'fail') => {
    const blocks = blocksRef.current;
    if (outcome === 'ok') blocks.served += 1;
    else blocks.failed += 1;
    if (blocks.ms.length < BLOCK_SAMPLE_CAP) blocks.ms.push(ms);
  }, []);

  const columnDefs = useMemo(() => buildStressColumnDefs(), []);

  /**
   * The measurement handle, under the SAME global name every ssrm probe reads.
   *
   * Unconditional rather than DEV-only: every measurement in this repo is taken
   * against a PRODUCTION build, and a DEV-gated handle is one no probe can ever
   * reach. `surface` names which mount answered, so a probe that lands on the
   * wrong app can say so instead of reporting one surface's numbers as
   * another's.
   */
  useEffect(() => {
    if (!client) return;
    (globalThis as Record<string, unknown>).__ssrmEngineGrid = {
      get api() {
        return surfaceRef.current?.getApi() ?? null;
      },
      client,
      surface: 'ssrm-markets-grid-lab',
      // The SIZE the window asked for, so a probe can assert it got the book it
      // meant to measure. The worker memoises per id and would otherwise serve
      // a previous size with a plausible row count and no complaint.
      rows,
      tickMs,
      blocks: () => ({ ...blocksRef.current, ms: [...blocksRef.current.ms] }),
      rpc: () => client.stats(),
      pump: () => surfaceRef.current?.pumpStats() ?? null,
      groupRefresh: () => surfaceRef.current?.groupRefreshStats() ?? null,
      refresh: () => surfaceRef.current?.refresh(),
      setLive: (live: boolean) => surfaceRef.current?.setLive(live),
      open: () => openCost(),
      introspect: () => client.introspect(),
      calcDiagnostics: () => surfaceRef.current?.calcDiagnostics() ?? Promise.resolve([]),
      /**
       * StarUI source → the AST the engine takes, for probes that publish a
       * calculated column directly.
       *
       * The SAME `tokenize`/`parse` the surface uses, deliberately: a probe
       * that hand-built an AST would be measuring its own idea of the tree
       * rather than the one the product sends, and the shapes only have to
       * agree for the probe to keep passing after they stop agreeing.
       */
      parse: (source: string) => parse(tokenize(source)),
    };
    setStatus('ready');
    onReady?.();
  }, [client, onReady, openCost, rows, tickMs]);

  const onProfilesReady = useLabDemoProfiles(GRID_ID, SSRM_LAB_PROFILES, SSRM_LAB_PROFILES[0].id);

  if (fault) {
    return (
      <div className="p-4 text-sm text-[var(--bn-status-negative,#b91c1c)]">
        The worker-held book did not open: {fault}
      </div>
    );
  }

  return (
    <div
      style={{ flex: 1, minHeight: 0, width: '100%' }}
      data-testid="ssrm-lab-grid"
      data-status={status}
    >
      <MarketsGrid
        gridId={GRID_ID}
        componentName="SSRM MarketsGrid Lab"
        rowData={NO_ROWS}
        rowModel="ssrm-engine"
        ssrmEngineClient={client}
        ssrmEngineKeyColumn={STRESS_KEY_FIELD}
        ssrmEngineOnBlock={onBlock}
        ssrmEngineSurfaceRef={surfaceRef}
        columnDefs={columnDefs}
        defaultColDef={stressDefaultColDef}
        rowIdField={STRESS_KEY_FIELD}
        rowHeight={28}
        animateRows={false}
        storage={labStorage}
        statusBar={LAB_STATUS_BAR}
        {...(mode === 'tree' ? { treeFields: TREE_FIELDS } : {})}
        {...(mode === 'detail'
          ? {
              masterDetail: {
                // The detail grid shows the OTHER positions on the same desk,
                // read from the book by equality — deliberately not scoped to
                // whatever the parent grid is filtered to.
                detailColumnDefs: [
                  { field: 'id', headerName: 'Position' },
                  { field: 'ticker' },
                  { field: 'assetClass' },
                  { field: 'esgScore' },
                ],
                matchFields: { desk: 'desk' },
                detailLimit: 100,
              },
            }
          : {})}
        {...SSRM_LAB_SEED}
        onReady={onProfilesReady}
      />
    </div>
  );
}
