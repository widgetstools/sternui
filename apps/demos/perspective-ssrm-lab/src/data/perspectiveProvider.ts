/**
 * The lab's book, delivered through a Perspective Table.
 *
 * This is the ONE file that decides what the pull path can see. Everything
 * downstream — every column, calculated column, style rule, alert and saved
 * filter — reads columns out of a Table built from what is declared here.
 *
 * ## Why a provider per tab
 *
 * The CSRM lab gives each tab its own `providerId` so it can tune row count,
 * tick rate and updates-on/off independently (the editing tabs run with
 * updates OFF, or a sweep would overwrite the edit under the user's hand).
 * That maps one-to-one onto Perspective: one provider, one Table. So each tab
 * gets its own Table, named after its provider, and the tabs stay independent
 * exactly as they were.
 *
 * ## Why the field list is explicit, and what happens when it is wrong
 *
 * `mock-perspective` flattens each row down to the paths its
 * `columnDefinitions` declare and DROPS everything else — that is how a
 * 250-field nested mock row becomes a flat Perspective schema. The
 * consequence is sharp: **a field not declared here does not exist in the
 * Table**, so a rule or calculated column referencing it does not fail, it
 * silently answers null. There is no error anywhere.
 *
 * So the list is the union of three things, and all three matter:
 *
 *   1. every `field` in `baseColumns` — what the grid renders;
 *   2. `VALUE_GETTER_INPUTS` — fields no column binds directly but a
 *      synthetic column computes from (the KRD sparkline reads five buckets
 *      that are not columns of their own);
 *   3. `CURRICULUM_INPUTS` — fields the seeded calculated columns, style
 *      rules and alert profiles reference by name.
 *
 * ## Types
 *
 * Declared from the column defs: `type: 'numericColumn'` → `number`,
 * everything else → `string`. Numerics map to Perspective `float` rather than
 * `integer` on purpose — a double holds every integer up to 2^53 exactly, and
 * declaring `integer` risks silent truncation for nothing.
 *
 * Declaring types up front is what lets the Table be created EMPTY and
 * IMMEDIATELY, so a tab paints on open instead of waiting for the first
 * snapshot before there is anything to attach to.
 */

import type {
  ColumnDefinition,
  DataProviderConfig,
  FieldInfo,
  MockPerspectiveProviderConfig,
} from '@starui/types';
import { baseColumns } from './columns';
import type { LabStreamOptions } from '../demo/types';

/** Row identity. Mock positions carry `id: POS-<cusip>-<n>`, unique per row. */
export const KEY_COLUMN = 'id';

/**
 * Fields a synthetic column computes from but no column binds to directly.
 * Without these the sparkline reads five nulls and draws a flat line.
 */
const VALUE_GETTER_INPUTS = [
  'krd1Y',
  'krd2Y',
  'krd5Y',
  'krd10Y',
  'krd30Y',
] as const;

/**
 * Fields the seeded curriculum references by name — calculated columns, style
 * rules, alert profiles. Kept separate from the column list because nothing
 * renders them, so a reader deleting "unused" columns would otherwise break
 * the seeds silently.
 */
const CURRICULUM_INPUTS = [
  'avgDailyVolume30d',
  'benchmarkYield',
  'bidSize',
  'askSize',
  'issueDate',
  'side',
] as const;

/**
 * Declared type per field. Every field NOT bound to a rendered column must be
 * named here — guessing is not safe.
 *
 * MEASURED, and it cost a debugging cycle: with `id` guessed as `number`,
 * Perspective did not reject the string `POS-3133EPLR2-0`, it COERCED it to
 * `0`. The Table is indexed on `id`, so all 500 rows upserted onto the same
 * row and the grid showed exactly one. Nothing errored anywhere — the only
 * visible symptom was a book of one row.
 *
 * So the fallback below THROWS rather than guessing. A field added to
 * `VALUE_GETTER_INPUTS` or `CURRICULUM_INPUTS` without a type here fails at
 * build time, which is the only moment this is cheap to notice.
 */
const EXTRA_FIELD_TYPES: Record<string, FieldInfo['type']> = {
  // The index column. A string, and the reason for the note above.
  [KEY_COLUMN]: 'string',
  krd1Y: 'number',
  krd2Y: 'number',
  krd5Y: 'number',
  krd10Y: 'number',
  krd30Y: 'number',
  avgDailyVolume30d: 'number',
  benchmarkYield: 'number',
  bidSize: 'number',
  askSize: 'number',
  issueDate: 'string',
  side: 'string',
};

function fieldType(field: string): FieldInfo['type'] {
  const col = baseColumns.find((c) => c.field === field);
  if (col) return col.type === 'numericColumn' ? 'number' : 'string';
  const declared = EXTRA_FIELD_TYPES[field];
  if (!declared) {
    throw new Error(
      `[perspective-ssrm-lab] no declared type for '${field}'. Add it to ` +
        `EXTRA_FIELD_TYPES — a guessed type is silently COERCED by Perspective, ` +
        `not rejected.`,
    );
  }
  return declared;
}

/** Every path the Table will carry, in a stable order. */
export const TABLE_FIELDS: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [KEY_COLUMN];
  seen.add(KEY_COLUMN);
  for (const col of baseColumns) {
    const field = col.field;
    if (typeof field === 'string' && !seen.has(field)) {
      seen.add(field);
      out.push(field);
    }
  }
  for (const field of [...VALUE_GETTER_INPUTS, ...CURRICULUM_INPUTS]) {
    if (!seen.has(field)) {
      seen.add(field);
      out.push(field);
    }
  }
  return out;
})();

const inferredFields: FieldInfo[] = TABLE_FIELDS.map((path) => ({
  path,
  type: fieldType(path),
  nullable: true,
}));

/**
 * What the flattener projects each nested mock row down to. `field` is the
 * only part it reads; the rest is carried so the config reads like every
 * other provider's.
 */
const columnDefinitions: ColumnDefinition[] = TABLE_FIELDS.map((field) => ({
  field,
  headerName: field,
  cellDataType: fieldType(field) === 'number' ? ('number' as const) : ('text' as const),
}));

/**
 * Bump when anything above changes, so the app re-persists every catalog row
 * instead of attaching to a Table built from a stale declaration.
 */
export const LAB_PROVIDER_CFG_VERSION = 2;

/** Deterministic per-tab provider id — `configStore.save()` upserts by it. */
export function labProviderId(tabProviderId: string): string {
  return `perspective-ssrm-lab:${tabProviderId}`;
}

/**
 * Build the catalog row for one tab's Table.
 *
 * `enableUpdates` is honoured exactly as in the CSRM lab: the editing tabs
 * turn ticking off, and on this path that matters more, not less — a sweep
 * would overwrite an edit in the shared Table that every peer window reads.
 */
export function buildLabPerspectiveProvider(
  tabProviderId: string,
  stream: LabStreamOptions = {},
): DataProviderConfig {
  const providerId = labProviderId(tabProviderId);
  const cfg: MockPerspectiveProviderConfig = {
    providerType: 'mock-perspective',
    dataType: 'positions',
    rowCount: stream.rowCount ?? 500,
    updateIntervalMs: stream.updateIntervalMs ?? 500,
    enableUpdates: stream.enableUpdates ?? true,
    keyColumn: KEY_COLUMN,
    // Not optional here — a Perspective schema is flat and the mock row is
    // deeply nested. The transport defaults to this; set explicitly so the
    // reason is visible at the call site.
    rowShape: 'ssrm',
    tableName: providerId,
    inferredFields,
    columnDefinitions,
    // Every numeric stays `float`. See the note at the top of this file.
    integerColumns: [],
    inferDates: true,
  };

  return {
    providerId,
    name: `Lab · ${tabProviderId} (Perspective Table)`,
    providerType: 'mock-perspective',
    userId: 'dev1',
    public: false,
    config: cfg,
  };
}
