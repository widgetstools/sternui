/**
 * Per-window View lifecycle for the AG Grid datasource.
 *
 * AG Grid asks for a block; this decides which View that block should be read
 * from. Perspective view configs are immutable, so every sort/filter change
 * means a NEW View and the disposal of the old one — the operation the engine
 * can be killed by (see `safeView.ts`). Every disposal therefore goes through
 * `createSafeView`, which drains in-flight reads before deleting.
 *
 * MEASURED, and the reason this file exists in this shape: the datasource's
 * generation fence must NOT be bumped by a request-driven swap. The fence is
 * captured at `getRows` entry and re-checked after `getView` resolves, so if
 * building the View that a request asked for bumps it, that request fences
 * ITSELF off and resolves empty. Symptom: the grid renders blank after every
 * sort and filter change (and on first load), while the log cheerfully
 * reports the View was rebuilt with the right row count.
 *
 * So the generation means "something OTHER than a block request invalidated
 * the View" — a schema change, new calculated columns, a different Table.
 * `invalidate()` is how that is signalled. Blocks in flight across a
 * request-driven swap are handled by re-reading (see `to_columns` below)
 * rather than by fencing.
 */
import { createSafeView } from '../src/safeView.js';
import { toPerspectiveViewConfig, viewConfigKey } from '../src/viewConfig.js';

export function createViewManager({ table, onEvent = () => {}, onUpdate = null }) {
  /** `{ key, config, safe, rows }` for the View currently serving blocks. */
  let current = null;
  let generation = 0;
  /** Serializes swaps so two concurrent blocks cannot both build a View. */
  let swapping = Promise.resolve();
  let closed = false;

  async function swap(config, key) {
    // Re-check inside the critical section: the block that queued behind us
    // may have been asking for the very config that just landed.
    if (closed || current?.key === key) return;

    const started = performance.now();
    const view = await table.view(config);
    const safe = createSafeView(view);
    const previous = current;

    // How the window learns the book moved. The default (no `mode`) delivers
    // notification only — no rows — so the cost is a callback, not a delta of
    // every changed row. The subscription belongs to this View and dies with
    // it, so it has to be re-made on every swap.
    if (onUpdate) {
      await view.on_update(() => {
        // A tick that lands during a swap belongs to the View being replaced;
        // firing it would refresh against rows the grid is already discarding.
        if (current?.safe === safe) onUpdate();
      });
    }

    current = { key, config, safe };

    // Only now is the old View unreachable by new blocks. `close()` drains
    // whatever is still in flight before deleting it.
    if (previous) void previous.safe.close();

    const rows = await view.num_rows();
    if (current?.key !== key) return;
    current.rows = rows;

    onEvent({ type: 'view', key, config, rows, ms: performance.now() - started, generation });
  }

  return {
    getGeneration: () => generation,

    /** Signal that every live View is invalid for a reason the grid did not
     *  cause. Blocks already in flight will resolve empty instead of painting
     *  rows the grid can no longer interpret. */
    invalidate() {
      generation += 1;
    },

    /** Rows in the current View — published to AG so the scrollbar spans the
     *  whole book instead of growing a block at a time. */
    get rows() {
      return current?.rows ?? null;
    },

    async getView(request) {
      if (closed) return null;

      const config = toPerspectiveViewConfig({
        sortModel: request.sortModel,
        filterModel: request.filterModel,
      });
      const key = viewConfigKey(config);

      if (current?.key !== key) {
        swapping = swapping.then(() => swap(config, key));
        await swapping;
      }
      if (closed || current === null) return null;

      const entry = current;
      return {
        to_columns: async (window) => {
          const columns = await entry.safe.read(window);
          if (columns !== null) return columns;

          // The View this block was handed got replaced before the read
          // started. Re-read from whatever is current rather than settling
          // short: an empty window at a non-zero start row is
          // indistinguishable from the end of the book and would cap the
          // store permanently (ARCHITECTURE.md, "Empty resolutions omit
          // rowCount"). AG Grid purges on sort/filter change, so these rows
          // are discarded by the grid anyway — they just have to be rows.
          const live = current;
          if (live === null) throw new Error('no live view for an in-flight block');
          const retry = await live.safe.read(window);
          if (retry === null) throw new Error('view closed twice under one block');
          return retry;
        },
        num_rows: () => Promise.resolve(entry.rows ?? 0),
      };
    },

    async close() {
      closed = true;
      const previous = current;
      current = null;
      if (previous) await previous.safe.close();
    },
  };
}
