/// <reference lib="webworker" />
import { createSsrmEngine, type SsrmRow } from '@starui/ssrm-engine';
import { serveSsrmEngineWorker, type SsrmBook } from '@starui/ssrm-engine/worker';
import { stressBookChunks, stressBookSchema, stressTickPatch } from '../data/stressBook';

/**
 * The SharedWorker that holds the Stress book.
 *
 * The engine package hosts, dispatches and broadcasts; this file decides what a
 * book CONTAINS and when it ticks. That split is why `@starui/ssrm-engine/worker`
 * has no idea a lab exists, and why this file is the only thing that has to
 * change when the book comes from a provider instead of a generator.
 *
 * **Nothing here may reach for the DOM.** A worker that imports a module
 * touching `document` or `customElements` at module scope dies before
 * `onconnect` — and a SharedWorker has no visible console, so the only symptom
 * in a window is a page that never gets its rows. `stressBook.ts` is kept free
 * of React and AG Grid for exactly this reason.
 */

export interface StressBookOptions {
  rows: number;
  tickMs: number;
}

function openStressBook(
  bookId: string,
  raw: unknown,
  publish: (rows: SsrmRow[]) => void,
): SsrmBook {
  const options = (raw ?? {}) as Partial<StressBookOptions>;
  const rows = options.rows ?? 20_000;
  const tickMs = options.tickMs ?? 200;

  const engine = createSsrmEngine({ schema: stressBookSchema() });
  // Chunked rather than one array: see `stressBookChunks`. On a fresh engine an
  // upsert per chunk and one whole-book snapshot are the same book.
  for (const chunk of stressBookChunks(rows)) engine.applyUpdate(chunk);

  let cursor = 0;
  const timer =
    tickMs > 0
      ? setInterval(() => {
          const tick = stressTickPatch(cursor, rows);
          cursor = tick.cursor;
          engine.applyUpdate(tick.patch);
          // The engine's own delta is KEYS. Windows need values, and the values
          // are the patch we just applied — so publish that rather than reading
          // 121 columns back out of the store for each of 200 rows.
          publish(tick.patch);
        }, tickMs)
      : undefined;

  return {
    engine,
    dispose: () => {
      if (timer !== undefined) clearInterval(timer);
      // eslint-disable-next-line no-console
      console.log(`[ssrm worker] retired book '${bookId}'`);
    },
  };
}

const host = serveSsrmEngineWorker({
  openBook: (bookId, options) =>
    openStressBook(bookId, options, (rows) => host.publish(bookId, rows)),
  /**
   * A SharedWorker's console reaches nobody, so a fault is pushed to every
   * attached window as well as logged. Without this an engine throw is a page
   * that simply never finishes loading.
   */
  onFault: (error, bookId) => {
    // eslint-disable-next-line no-console
    console.error(`[ssrm worker] fault${bookId ? ` in '${bookId}'` : ''}`, error);
  },
});
