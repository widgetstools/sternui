/**
 * Peer-pricing engine simulator. Every interval, a random row's
 * bid / ask / spread gets a small tick. If the trader has a pending
 * edit on that cell, we DON'T overwrite — instead we flag the entry
 * with `conflict: true` so the cell renders the ⚠ glyph (see
 * .cell-conflict in globals.css).
 *
 * Uses MarketsGrid's `gridApi` directly via the EditCoordinator.
 * The coordinator owns row state; the streamer just nudges values
 * and triggers a refresh.
 */
import type { GridApi } from 'ag-grid-community';
import type { AxeRow } from './data';
import { round } from './data';
import type { EditCoordinator, LogFn, PendingEditBuffer } from './editing';

export interface StreamingHandle {
  stop(): void;
  setPaused(paused: boolean): void;
}

export function startPeerPricing(opts: {
  gridApi: GridApi;
  coordinator: EditCoordinator;
  buffer: PendingEditBuffer;
  rows: AxeRow[];
  log: LogFn;
  intervalMs?: number;
}): StreamingHandle {
  const { gridApi, coordinator, buffer, rows, log, intervalMs = 1500 } = opts;
  let paused = false;

  const id = setInterval(() => {
    if (paused) return;
    const row = rows[Math.floor(Math.random() * rows.length)];
    const col = (['bid', 'ask', 'spread'] as const)[Math.floor(Math.random() * 3)];

    // Conflict detection — trader has a pending edit on this cell.
    const pending = buffer.get(row.id, col);
    if (pending) {
      pending.conflict = true;
      buffer.notify();
      coordinator.refreshCells([{ rowId: row.id, colId: col }]);
      log('stream', `⚠ Underlying ticked while you have pending edit on ${row.cusip}/${col}`);
      return;
    }

    if (coordinator.isSuspended(row.id, col)) return;

    const dir = Math.random() > 0.5 ? 1 : -1;
    const tick = (col === 'spread' ? 0.5 : 0.0625) * dir;
    const newVal = round((row[col] as number) + tick, col === 'spread' ? 1 : 4);
    row[col] = newVal as never;
    coordinator.setRows(rows); // keep coordinator's rowMap in sync
    const node = gridApi.getRowNode(row.id);
    if (node) node.setDataValue(col, newVal);

    // Tick flash via direct DOM (AG-Grid's row/col attribute targeting)
    const cellEl = document.querySelector(`[row-id="${row.id}"] [col-id="${col}"]`);
    if (cellEl) {
      cellEl.classList.remove('tick-up', 'tick-down');
      void (cellEl as HTMLElement).offsetWidth; // force reflow so animation re-fires
      cellEl.classList.add(dir > 0 ? 'tick-up' : 'tick-down');
    }
  }, intervalMs);

  return {
    stop: () => clearInterval(id),
    setPaused: (next: boolean) => { paused = next; },
  };
}
