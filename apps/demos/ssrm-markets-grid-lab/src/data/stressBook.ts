import type { SsrmRow } from '@starui/ssrm-engine';
import {
  STRESS_COLUMN_FIELDS,
  STRESS_FIELD_TYPES,
  STRESS_KEY_FIELD,
  STRESS_ROW_COUNT,
} from './stressColumns';

/**
 * The stress book's contents, separated from the surface that renders them.
 *
 * It lives here because it is now built inside a **SharedWorker** and imported
 * by a React component only for its constants. Nothing in this file may touch
 * the DOM, React or AG Grid — a worker that imports one of those dies at module
 * scope, with no console anywhere to say so.
 */

/**
 * One book, shared by every window — and KEYED BY ITS ROW COUNT.
 *
 * The worker memoises a book per id and hands the existing one to the next
 * client that asks, ignoring its `bookOptions`. So a fixed id means that after
 * `STRESS_ROW_COUNT` changes, any window landing on a worker that is still
 * alive from before gets the OLD size, silently, with the right row count on
 * screen for the wrong reason. A SharedWorker outlives its pages, so "still
 * alive from before" is the normal case during a measurement session.
 */
export const STRESS_BOOK_ID = `stress-${STRESS_ROW_COUNT}`;

const DIMENSION_VALUES = [
  'Alpha',
  'Bravo',
  'Charlie',
  'Delta',
  'Echo',
  'Foxtrot',
  'Golf',
  'Hotel',
] as const;

const DIMENSION_FIELDS = STRESS_COLUMN_FIELDS.filter((f) => STRESS_FIELD_TYPES[f] === 'string');
const NUMERIC_FIELDS = STRESS_COLUMN_FIELDS.filter((f) => STRESS_FIELD_TYPES[f] === 'number');

/**
 * The book in chunks, deterministically — two runs of a probe measure the same
 * rows.
 *
 * Chunked because the whole book as one array is 20,000 objects of 121 fields
 * held live at the moment the engine copies them into its columnar columns, and
 * that transient peak is the exact shape this session moved out of the window.
 * Moving it into a worker that Chrome may host in the SAME renderer process
 * would have moved it nowhere.
 */
export function* stressBookChunks(rows: number, chunkSize = 2_000): Generator<SsrmRow[]> {
  let chunk: SsrmRow[] = [];
  for (let r = 0; r < rows; r++) {
    const row: SsrmRow = { [STRESS_KEY_FIELD]: `POS-${r}` };
    DIMENSION_FIELDS.forEach((field, d) => {
      row[field] = DIMENSION_VALUES[(r + d) % DIMENSION_VALUES.length];
    });
    NUMERIC_FIELDS.forEach((field, n) => {
      row[field] = ((r * 7 + n * 13) % 100_000) / 100;
    });
    chunk.push(row);
    if (chunk.length === chunkSize) {
      yield chunk;
      chunk = [];
    }
  }
  if (chunk.length > 0) yield chunk;
}

/** The engine's schema for this book — the key column plus every stress field. */
export function stressBookSchema() {
  return {
    keyField: STRESS_KEY_FIELD,
    fields: [
      { field: STRESS_KEY_FIELD, type: 'string' as const },
      ...STRESS_COLUMN_FIELDS.map((field) => ({ field, type: STRESS_FIELD_TYPES[field] })),
    ],
  };
}

/**
 * One tick's worth of SPARSE patches — a key and the two prices that moved.
 *
 * Sparse on purpose. The real STOMP feed carries 4.18 of 52 fields per row, and
 * a tick that broadcast whole rows would put 121 columns on the wire for two
 * changed cells, five times a second, to every window.
 */
export function stressTickPatch(cursor: number, rows: number, count = 200) {
  const patch: SsrmRow[] = [];
  let at = cursor;
  for (let i = 0; i < count; i++) {
    at = (at + 37) % rows;
    patch.push({
      [STRESS_KEY_FIELD]: `POS-${at}`,
      [NUMERIC_FIELDS[0]]: Math.round(Math.random() * 100_000) / 100,
      [NUMERIC_FIELDS[1]]: Math.round(Math.random() * 100_000) / 100,
    });
  }
  return { patch, cursor: at };
}
