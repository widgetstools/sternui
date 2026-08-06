import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarketsGrid, type SsrmEngineMarketsGridSurfaceHandle } from '@starui/grid';
import { buildStressColumnDefs, stressDefaultColDef, STRESS_KEY_FIELD } from '../data/stressColumns';
import { useSsrmBook } from '../data/useSsrmBook';
import { labStorage } from '../data/storage';
import { SSRM_LAB_PROFILES, SSRM_LAB_SEED } from '../profiles/seed';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { LAB_STATUS_BAR } from './labStatusBar';

/**
 * The product surface, and the only grid in this app.
 *
 * `rowModel="ssrm-engine"` with a client onto the worker-held book. There is no
 * engine switch here and no query parameter that changes what is mounted —
 * which is the whole reason this app exists. The bake-off lab
 * (`@starui/perspective-ssrm-lab`) puts two engines behind `?engine=`, and a
 * reader could not tell from the screen which one they were looking at; two
 * measurements in session 9 were taken on the wrong assumption before a probe
 * was written that could tell them apart.
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
  onReady?: () => void;
}

export function SsrmMarketsGrid({ tickMs = 200, onReady }: SsrmMarketsGridProps) {
  const { client, fault, openCost } = useSsrmBook(tickMs);
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
      blocks: () => ({ ...blocksRef.current, ms: [...blocksRef.current.ms] }),
      rpc: () => client.stats(),
      pump: () => surfaceRef.current?.pumpStats() ?? null,
      groupRefresh: () => surfaceRef.current?.groupRefreshStats() ?? null,
      refresh: () => surfaceRef.current?.refresh(),
      setLive: (live: boolean) => surfaceRef.current?.setLive(live),
      open: () => openCost(),
      introspect: () => client.introspect(),
      calcDiagnostics: () => surfaceRef.current?.calcDiagnostics() ?? Promise.resolve([]),
    };
    setStatus('ready');
    onReady?.();
  }, [client, onReady, openCost]);

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
        {...SSRM_LAB_SEED}
        onReady={onProfilesReady}
      />
    </div>
  );
}
