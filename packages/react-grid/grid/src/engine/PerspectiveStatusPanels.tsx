/**
 * CSRM-parity status panels for the Perspective pull path.
 *
 * ## What was actually wrong, measured on both labs
 *
 * A host that supplies its own `statusBar` — the lab's Stress tab does, with
 * AG's four stock panels — got this on the pull path:
 *
 * | panel | CSRM (:5300) | Perspective (:5301) |
 * |---|---|---|
 * | `total-and-filtered-row-count` | `Rows : 53,127` | **nothing rendered** |
 * | `filtered-row-count` | `Filtered : 53,127` | **nothing rendered** |
 * | `selected-row-count` | `Selected : 50,000` | `Selected : ?` |
 * | `aggregations` | `Count : 15` | `Count : 3` (its own range) |
 *
 * So the row counts were not wrong, they were ABSENT: AG's own row-count
 * components render nothing under the server row model, because the client does
 * not hold the book. And select-all answers `?` for the same reason.
 *
 * **The aggregation panel needs no replacement, which the handoff assumed it
 * would.** MEASURED: it aggregates the selected CELL RANGE, not the row
 * selection — select-all left it showing the earlier drag on BOTH surfaces — and
 * a dragged range is rows this window holds. Its one divergence is a range
 * dragged past the loaded blocks, where the unloaded nodes carry no data and are
 * silently left out; that needs worker-side range aggregation and is not done.
 *
 * ## Look and feel
 *
 * The markup below is AG's own, copied from the rendered DOM rather than
 * guessed: the panel root carries `ag-status-name-value ag-status-panel
 * ag-status-panel-<kind>`, the label and value are two spans separated by a
 * literal ` :&nbsp;`, and a panel with nothing to say is `ag-hidden` +
 * `aria-hidden` rather than absent, so the bar does not reflow as numbers
 * appear.
 */
import { useEffect, useState } from 'react';
import type { PerspectiveGridStatus, PerspectiveRowEngine } from '@starui/perspective-grid';
import type { PerspectiveEngineHolder } from './perspectiveEngineHolder.js';

/** What AG passes a custom status panel. `context` is our own grid option. */
export interface PerspectiveStatusPanelParams {
  api?: {
    getSelectedNodes?(): unknown[];
    getServerSideSelectionState?(): unknown;
    addEventListener?(type: string, listener: () => void): void;
    removeEventListener?(type: string, listener: () => void): void;
  };
  context?: { perspectiveEngineHolder?: PerspectiveEngineHolder };
}

const count = (n: number) => n.toLocaleString();

/**
 * The engine behind this panel, tracked as state rather than read once: AG
 * hands a panel the context object the grid was CREATED with, and the engine
 * behind it is swapped on a provider restart.
 */
function useEngineStatus(params: PerspectiveStatusPanelParams): PerspectiveGridStatus | null {
  const holder = params.context?.perspectiveEngineHolder;
  const [engine, setEngine] = useState<PerspectiveRowEngine | null>(holder?.get() ?? null);
  const [status, setStatus] = useState<PerspectiveGridStatus | null>(
    engine ? engine.status : null,
  );

  useEffect(() => {
    if (!holder) return;
    setEngine(holder.get());
    return holder.subscribe(setEngine);
  }, [holder]);

  useEffect(() => {
    if (!engine) return;
    setStatus(engine.status);
    return engine.subscribe(setStatus);
  }, [engine]);

  // Belt to the holder's braces: AG constructs a panel during grid creation,
  // which can land in the window before the surface's engine settles.
  useEffect(() => {
    const api = params.api;
    if (!api?.addEventListener || !holder) return;
    const resync = () => setEngine(holder.get());
    api.addEventListener('modelUpdated', resync);
    return () => api.removeEventListener?.('modelUpdated', resync);
  }, [params.api, holder]);

  return status;
}

/**
 * Rows the user is looking at.
 *
 * `leafRows` and not `filteredRows`: the latter is what AG sizes its store
 * from, which under grouping is the number of top-level GROUPS. MEASURED on the
 * stress tab before this: an unfiltered 50,000-row book grouped into nine asset
 * classes reported "Rows : 9 of 50,000". Falls back only while the leaf count
 * is still being measured, and to null rather than a guess before either
 * exists.
 */
function rowsOf(status: PerspectiveGridStatus | null): number | null {
  if (!status) return null;
  return status.leafRows ?? status.filteredRows;
}

/** AG's own name/value row, class for class. */
function NameValue({
  kind,
  label,
  value,
  hidden = false,
}: {
  kind: string;
  label: string;
  value: string;
  hidden?: boolean;
}) {
  return (
    <div
      className={`ag-status-name-value ag-status-panel ag-status-panel-${kind}${hidden ? ' ag-hidden' : ''}`}
      aria-hidden={hidden}
    >
      <span>{label}</span> :&nbsp;
      <span className="ag-status-name-value-value">{value}</span>
    </div>
  );
}

/**
 * `Rows : N`, or `Rows : N of M` while a filter is narrowing the book.
 *
 * Both figures come from the worker-held Table — the filtered count from the
 * View the grid is scrolling, the total from `table.size()` — because the rows
 * this window holds are its loaded blocks and counting those is how AG's own
 * panel would produce a confidently wrong number.
 */
export function PerspectiveTotalAndFilteredRowCountPanel(params: PerspectiveStatusPanelParams) {
  const status = useEngineStatus(params);
  const rows = rowsOf(status);
  if (rows === null) {
    // Before the first View there is no honest count. Rendered hidden rather
    // than omitted so the bar does not jump when it arrives.
    return <NameValue kind="total-and-filtered-row-count" label="Rows" value="" hidden />;
  }
  return (
    <NameValue
      kind="total-and-filtered-row-count"
      label="Rows"
      value={
        status!.filtered && status!.bookRows !== null
          ? `${count(rows)} of ${count(status!.bookRows)}`
          : count(rows)
      }
    />
  );
}

/** `Filtered : N` — hidden unless a filter is actually narrowing the book, as
 *  AG's own panel is. */
export function PerspectiveFilteredRowCountPanel(params: PerspectiveStatusPanelParams) {
  const status = useEngineStatus(params);
  const rows = rowsOf(status);
  const show = !!status && status.filtered && rows !== null;
  return (
    <NameValue
      kind="filtered-row-count"
      label="Filtered"
      value={show ? count(rows as number) : ''}
      hidden={!show}
    />
  );
}

/**
 * `Selected : N`, answered for select-all too.
 *
 * MEASURED: AG's own panel renders `Selected : ?` after the header checkbox on
 * a server row model, because the rows it would count have never been sent to
 * this window. The server-side selection state says what the user MEANT —
 * "everything, except these" — and the filtered count from the engine turns
 * that into a number.
 */
export function PerspectiveSelectedRowCountPanel(params: PerspectiveStatusPanelParams) {
  const status = useEngineStatus(params);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const api = params.api;
    if (!api?.addEventListener) return;
    const update = () => {
      const state = api.getServerSideSelectionState?.() as
        | { selectAll?: boolean; toggledNodes?: unknown[] }
        | null
        | undefined;
      if (state && typeof state.selectAll === 'boolean') {
        const toggled = Array.isArray(state.toggledNodes) ? state.toggledNodes.length : 0;
        if (state.selectAll) {
          const rows = rowsOf(status);
          // Null while the first View is still building — fall back to the
          // toggle count rather than inventing a total.
          setSelected(rows === null || rows === undefined ? 0 : Math.max(0, rows - toggled));
        } else {
          setSelected(toggled);
        }
        return;
      }
      setSelected(api.getSelectedNodes?.().length ?? 0);
    };
    api.addEventListener('selectionChanged', update);
    update();
    return () => api.removeEventListener?.('selectionChanged', update);
    // `status` is a dependency because a select-all count is only knowable once
    // the filtered count is.
  }, [params.api, status]);

  return (
    <NameValue
      kind="selected-row-count"
      label="Selected"
      value={count(selected)}
      hidden={selected === 0}
    />
  );
}

/** Names the surface registers these under. */
export const PERSPECTIVE_STATUS_PANEL_COMPONENTS = {
  perspectiveTotalAndFilteredRowCount: PerspectiveTotalAndFilteredRowCountPanel,
  perspectiveFilteredRowCount: PerspectiveFilteredRowCountPanel,
  perspectiveSelectedRowCount: PerspectiveSelectedRowCountPanel,
} as const;

/**
 * AG's stock panel name -> the one that can answer it on this path.
 *
 * `agAggregationComponent` is deliberately absent: it already aggregates the
 * selected cell range, which this window holds.
 */
const REPLACEMENTS: Record<string, string> = {
  agTotalRowCountComponent: 'perspectiveTotalAndFilteredRowCount',
  agTotalAndFilteredRowCountComponent: 'perspectiveTotalAndFilteredRowCount',
  agFilteredRowCountComponent: 'perspectiveFilteredRowCount',
  agSelectedRowCountComponent: 'perspectiveSelectedRowCount',
};

interface StatusPanelDef {
  statusPanel?: string;
  [key: string]: unknown;
}

/**
 * Rewrite a host's `statusBar` so the stock row-count panels are served by the
 * ones above, keeping alignment and order exactly as the host wrote them.
 *
 * Rewriting rather than asking hosts to name our components is the point: a
 * profile or app config written for the CSRM grid then means the same thing on
 * this surface, which is what "behaves exactly like the CSRM grid" has to mean
 * for a status bar. A panel we have no answer for is passed through untouched.
 */
export function withPerspectiveStatusPanels(statusBar: unknown): unknown {
  if (!statusBar || typeof statusBar !== 'object') return statusBar;
  const panels = (statusBar as { statusPanels?: StatusPanelDef[] }).statusPanels;
  if (!Array.isArray(panels)) return statusBar;
  let changed = false;
  const next = panels.map((panel) => {
    const replacement = typeof panel?.statusPanel === 'string' ? REPLACEMENTS[panel.statusPanel] : undefined;
    if (!replacement) return panel;
    changed = true;
    return { ...panel, statusPanel: replacement };
  });
  return changed ? { ...(statusBar as object), statusPanels: next } : statusBar;
}
