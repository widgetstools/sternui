import { STRESS_ROW_COUNT } from './stressColumns';

/**
 * The lab's runtime knobs, read from the page URL.
 *
 * **Window-only, deliberately.** A SharedWorker has a `location` too, but it is
 * the WORKER SCRIPT's URL — so the same `location.search` read inside
 * `stressBook.ts` would silently resolve to nothing and build the default book
 * while the page reported the size the reader asked for. That failure has no
 * symptom: the grid shows a row count, and it is the right number for the wrong
 * book. Every value here is resolved in the window and PASSED to the worker.
 *
 * This does not reintroduce the `?engine=` problem the app was built to avoid.
 * That switch changed WHICH ENGINE was mounted while the screen looked
 * identical; these change the size of the one book, and the size is on screen.
 */

/** The default. 500,000 is the session-7 gate, not the everyday size. */
const DEFAULT_ROWS = STRESS_ROW_COUNT;

/**
 * A ceiling, because the book shares an address space with the grid.
 *
 * MEASURED, and not intuitive: the worker holding the book is NOT in its own
 * process — it competes with the renderer for Chrome's ~4 GB. So a row count
 * typed with one extra zero does not fail cleanly in the worker; it takes the
 * TAB down, which looks like a crash in whatever was on screen at the time.
 */
const MAX_ROWS = 2_000_000;

function intParam(search: URLSearchParams, name: string, fallback: number, max: number): number {
  const raw = search.get(name);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  // NaN, negative and absurd all fall back rather than half-applying. A book of
  // NaN rows builds an empty one, which reads exactly like a broken engine.
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export interface LabParams {
  rows: number;
  /** Live tick interval in the worker. `?tick=0` disables ticking. */
  tickMs: number;
}

export function readLabParams(search = globalThis.location?.search ?? ''): LabParams {
  const params = new URLSearchParams(search);
  return {
    rows: intParam(params, 'rows', DEFAULT_ROWS, MAX_ROWS),
    // 0 is a MEANINGFUL value here (ticking off, for a cold measurement), so it
    // cannot go through the same "<= 0 falls back" rule as the row count.
    tickMs: (() => {
      const raw = params.get('tick');
      if (raw === null) return 200;
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 200;
    })(),
  };
}
