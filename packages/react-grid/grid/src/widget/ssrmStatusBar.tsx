/**
 * ssrmStatusBar — Server-Side Row Model status-bar adaptation.
 *
 * AG-Grid's built-in row-count status panels
 * (`agTotalAndFilteredRowCountComponent`, `agFilteredRowCountComponent`,
 * `agTotalRowCountComponent`) are CLIENT-SIDE only — under SSRM they emit
 * warning #224 and render nothing, so a status bar made only of them appears
 * empty / absent. {@link adaptStatusBarForServerSide} swaps them for a single
 * SSRM-compatible row-count panel ({@link SsrmRowCountStatusPanel}); the
 * aggregation / selected-count panels are left as-is (they work in any row
 * model).
 *
 * Row total: the panel prefers `context.getSsrmRowCount()` — the hub's total
 * leaf-row count, which the container wires onto the grid context. That stays
 * the full row total even when grouped (matching CSRM's count panel), whereas
 * `getDisplayedRowCount()` would collapse to the visible group/expanded-row
 * count under grouping. It falls back to the displayed count when no getter is
 * present (e.g. ungrouped before the first block resolves).
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { GridApi } from 'ag-grid-community';

/** Built-in count panels that only work with the Client-Side Row Model. */
const CSRM_ONLY_COUNT_PANELS = new Set([
  'agTotalAndFilteredRowCountComponent',
  'agFilteredRowCountComponent',
  'agTotalRowCountComponent',
]);

interface SsrmStatusPanelProps {
  api: GridApi;
  context?: { getSsrmRowCount?: () => number };
}

/** SSRM-compatible row-count panel — shows the hub's total leaf-row count. */
export function SsrmRowCountStatusPanel(props: SsrmStatusPanelProps): ReactNode {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => {
      const fromHub = props.context?.getSsrmRowCount?.();
      setCount(typeof fromHub === 'number' && fromHub > 0 ? fromHub : props.api.getDisplayedRowCount());
    };
    update();
    props.api.addEventListener('modelUpdated', update);
    return () => {
      try { props.api.removeEventListener('modelUpdated', update); } catch { /* grid gone */ }
    };
  }, [props.api, props.context]);
  return (
    <div className="ag-status-name-value" style={{ paddingLeft: 12, paddingRight: 12 }}>
      <span>Rows:&nbsp;</span>
      <span className="ag-status-name-value-value">{count.toLocaleString()}</span>
    </div>
  );
}

/** Custom component to register on the grid when serverSide. */
export const SSRM_STATUS_BAR_COMPONENTS = { ssrmRowCount: SsrmRowCountStatusPanel };

interface StatusPanelDefLike { statusPanel?: string; align?: string }

/**
 * Replace CSRM-only count panels with the SSRM row-count panel (deduped — at
 * most one is injected). Returns the input unchanged when there's nothing to
 * swap, so CSRM is unaffected. `undefined`/non-object passes through.
 */
export function adaptStatusBarForServerSide(statusBar: unknown): unknown {
  if (!statusBar || typeof statusBar !== 'object') return statusBar;
  const sb = statusBar as { statusPanels?: StatusPanelDefLike[] };
  if (!Array.isArray(sb.statusPanels)) return statusBar;

  let injected = false;
  let changed = false;
  const panels: StatusPanelDefLike[] = [];
  for (const p of sb.statusPanels) {
    if (p.statusPanel && CSRM_ONLY_COUNT_PANELS.has(p.statusPanel)) {
      changed = true;
      if (!injected) { panels.push({ statusPanel: 'ssrmRowCount', align: 'left' }); injected = true; }
      continue;
    }
    panels.push(p);
  }
  return changed ? { ...sb, statusPanels: panels } : statusBar;
}
