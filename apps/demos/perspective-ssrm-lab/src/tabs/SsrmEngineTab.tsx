import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@starui/ui';
import { TabContainer } from '../components/TabContainer';
import { HELP } from '../help';
import { SsrmEngineStressGrid } from './SsrmEngineStressGrid';
import type { SsrmEngineGridHandle } from './SsrmEngineGrid';
import { buildStressColumnDefs } from '../data/stressColumns';
import { LAB_SSRM_CALC_COLUMNS } from '../data/ssrmCalcColumns';

/**
 * `@starui/ssrm-engine` — the columnar row engine, with CALCULATED COLUMNS that
 * behave like real ones.
 *
 * ## What this tab is for, and what it deliberately is not
 *
 * Until now the only way to see any of this was `?engine=ssrm&calc=1` on the
 * Stress tab — a URL flag discoverable only if you already knew it existed. The
 * capability the engine gained is also the kind that is invisible when it
 * works and invisible when it does not: before session 5, sorting or filtering
 * a calculated column was a **silent no-op**. It did not error. It did nothing,
 * and the grid looked like it had ignored the click. A demo that requires the
 * viewer to notice an absence is not a demo, so the buttons below DO the thing
 * and the panel says what the engine reports.
 *
 * It mounts a plain `AgGridReact`, exactly as the Stress tab does. That is a
 * statement about scope, not an oversight: the MarketsGrid surface
 * (`SsrmEngineMarketsGridSurface`, set-filter values served from the engine,
 * quick search bridged through `modelUpdated`, status-bar panels, cell-edit
 * commit, export) is session 6, and every one of those was a separate bug on
 * the Perspective path. Showing a MarketsGrid here before those exist would
 * demonstrate a surface that does not work yet.
 *
 * The Stress tab is untouched and still defaults to calc columns OFF, because
 * every documented boundary figure (2.40 ms median per block) was taken with
 * them off and both numbers are worth keeping.
 */

/** One row of the stats strip. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-[9rem] flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-[color:var(--ds-text-tertiary,var(--ds-text-secondary))]">
        {label}
      </span>
      <span className="font-mono text-[13px] text-[color:var(--ds-text-primary)]">{value}</span>
      {hint ? (
        <span className="text-[10px] text-[color:var(--ds-text-secondary)]">{hint}</span>
      ) : null}
    </div>
  );
}

const SORTED = { colId: 'calc_pnlPct', sort: 'desc' as const };
const FILTER_THRESHOLD = 500;

export function SsrmEngineTab() {
  const handleRef = useRef<SsrmEngineGridHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [stats, setStats] = useState({
    rows: 0,
    displayed: 0,
    blockMs: '—',
    blockHint: 'waiting for the first block',
    refusals: 0,
    pushed: 0,
  });

  const columnDefs = useState(() => buildStressColumnDefs())[0];

  const onSurfaceReady = useCallback((handle: SsrmEngineGridHandle) => {
    handleRef.current = handle;
    setReady(true);
  }, []);

  /**
   * Poll the handle rather than subscribe.
   *
   * The numbers shown are counters the grid and the client keep for the probes;
   * none of them emits an event, and a second event channel purely to drive a
   * stats strip would be machinery this tab does not need. 500 ms is slower
   * than a tick and fast enough to look live.
   */
  useEffect(() => {
    if (!ready) return;
    const read = () => {
      const handle = handleRef.current;
      if (!handle || handle.api.isDestroyed?.()) return;
      const ms = handle.blocks().ms;
      /**
       * The LAST block, not a median — and that took two corrections to get
       * honest.
       *
       * First draft: an all-time median, which read **62.90 ms** against the
       * 2.40 ms `workerBoundaryProbe` measures. Nothing was wrong with the
       * engine — `n` was **1**, and the one sample was the very first block,
       * which materialises an index over 20,000 rows before it can answer.
       *
       * Second draft: a trailing median with the count shown. Still misleading,
       * for a subtler reason: **every block this tab samples is cold.** Each
       * button changes the query SHAPE, so each one re-materialises the index —
       * a steady-state median is a number this tab never has, and quoting one
       * invites comparison against a figure measured under a warm index and
       * perturbed offsets.
       *
       * So: the last block, which makes no statistical claim at all. It is the
       * right number to show anyway — a query change costing tens of
       * milliseconds is the headline, against 400-1,100 ms for the same
       * operation on the Perspective pull path, where a sort is a fresh View.
       */
      const last = ms.length ? ms[ms.length - 1] : null;
      setStats({
        rows: handle.engine.size,
        displayed: handle.api.getDisplayedRowCount(),
        blockMs: last === null ? '—' : `${last.toFixed(1)} ms`,
        blockHint:
          ms.length === 0
            ? 'waiting for the first block'
            : `last of ${ms.length} — a query change re-materialises the index`,
        refusals: handle.calcDiagnostics().length,
        pushed: handle.pump()?.received ?? 0,
      });
    };
    read();
    const timer = setInterval(read, 500);
    return () => clearInterval(timer);
  }, [ready]);

  const reset = useCallback(() => {
    const api = handleRef.current?.api;
    if (!api) return;
    api.setFilterModel(null);
    api.applyColumnState({
      state: LAB_SSRM_CALC_COLUMNS.map((c) => ({ colId: c.colId, sort: null, rowGroup: false, aggFunc: null })),
      defaultState: { sort: null },
    });
    setActive(null);
  }, []);

  /** Sort by a CALCULATED column — a silent no-op before session 5. */
  const doSort = useCallback(() => {
    const api = handleRef.current?.api;
    if (!api) return;
    reset();
    api.applyColumnState({ state: [SORTED], defaultState: { sort: null } });
    api.ensureIndexVisible(0);
    setActive('sort');
  }, [reset]);

  /** Filter on a CALCULATED column. */
  const doFilter = useCallback(() => {
    const api = handleRef.current?.api;
    if (!api) return;
    reset();
    api.setFilterModel({
      calc_pnlPct: { filterType: 'number', type: 'greaterThan', filter: FILTER_THRESHOLD },
    });
    setActive('filter');
  }, [reset]);

  /** Group by a calculated STRING column and aggregate a calculated number. */
  const doGroup = useCallback(() => {
    const api = handleRef.current?.api;
    if (!api) return;
    reset();
    api.applyColumnState({
      state: [
        { colId: 'calc_band', rowGroup: true, rowGroupIndex: 0 },
        { colId: 'calc_notional', aggFunc: 'sum' },
      ],
    });
    setActive('group');
  }, [reset]);

  return (
    <TabContainer
      title="SSRM Engine — calculated columns"
      subtitle="20,000 × 120 in a SharedWorker. The four calc_* columns are expressions the engine evaluates where the book is — so they sort, filter, group, aggregate and tick like stored columns."
      help={HELP.ssrmEngine}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant={active === 'sort' ? 'default' : 'outline'} onClick={doSort} disabled={!ready} data-testid="ssrm-demo-sort">
            Sort by P&amp;L %
          </Button>
          <Button size="sm" variant={active === 'filter' ? 'default' : 'outline'} onClick={doFilter} disabled={!ready} data-testid="ssrm-demo-filter">
            Filter &gt; {FILTER_THRESHOLD}
          </Button>
          <Button size="sm" variant={active === 'group' ? 'default' : 'outline'} onClick={doGroup} disabled={!ready} data-testid="ssrm-demo-group">
            Group by band
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={!ready} data-testid="ssrm-demo-reset">
            Reset
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div
          className="flex flex-wrap items-start gap-x-6 gap-y-2 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] px-3 py-2"
          data-testid="ssrm-demo-stats"
        >
          <Stat label="Book (worker)" value={stats.rows.toLocaleString()} hint="rows the engine holds" />
          <Stat label="AG displays" value={stats.displayed.toLocaleString()} hint="after filter / grouping" />
          <Stat label="Last block read" value={stats.blockMs} hint={stats.blockHint} />
          <Stat
            label="Calc columns"
            value={`${LAB_SSRM_CALC_COLUMNS.length} installed`}
            hint={stats.refusals === 0 ? 'no refusals' : `${stats.refusals} refused — see console`}
          />
          <Stat label="Rows pushed" value={stats.pushed.toLocaleString()} hint="live ticks received" />
        </div>

        <div className="flex min-h-0 flex-1">
          <SsrmEngineStressGrid
            columnDefs={columnDefs}
            calc
            tickMs={200}
            onSurfaceReady={onSurfaceReady}
          />
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-[11px] text-[color:var(--ds-text-secondary)]">
          {LAB_SSRM_CALC_COLUMNS.map((c) => (
            <span key={c.colId} className="font-mono">
              <span className="text-[color:var(--ds-text-primary)]">{c.headerName}</span>
              {' = '}
              {c.expression}
            </span>
          ))}
        </div>
      </div>
    </TabContainer>
  );
}
