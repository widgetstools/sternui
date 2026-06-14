/**
 * matchFieldToCatalog — resolve the formatting for a single column from its
 * field name (and, as a fallback, its data type).
 *
 * Resolution order:
 *   1. Exact alias match against the full normalised field, OR its last
 *      dotted segment (e.g. `rating.moody` → `moody`).
 *   2. Longest `suffix` match against the last segment / full field
 *      ("last element of the field name", e.g. `bidPrice` → `price`).
 *   3. Generic fallback by `cellDataType`:
 *        number  → right-aligned, grouped, 2dp
 *        date    → localised date
 *        boolean → centred
 *        other   → no change (null)
 *
 * A field-name match always wins over the type fallback so `asOfDate`
 * stored as an epoch number still gets a date format.
 */
import { FIELD_FORMAT_CATALOG } from './fieldFormatCatalog.js';
import type { AutoFormatAssignment, FieldFormatEntry } from './types.js';

/** Lowercase and strip every non-alphanumeric so casing/separators/abbrev
 *  differences (`unrealizedPnL` vs `unrealized_pnl` vs `unrealPnl`) collapse
 *  to a comparable key. */
export function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** The last dotted segment of a field path (`a.b.c` → `c`). */
function leafOf(field: string): string {
  const i = field.lastIndexOf('.');
  return i >= 0 ? field.slice(i + 1) : field;
}

/** Minimum suffix length — guards against tiny tokens matching by accident. */
const MIN_SUFFIX_LEN = 3;

function toAssignment(entry: FieldFormatEntry): AutoFormatAssignment {
  const out: AutoFormatAssignment = {};
  if (entry.format !== undefined) out.valueFormatterTemplate = entry.format;
  if (entry.alignment !== undefined) out.alignment = entry.alignment;
  if (entry.typography !== undefined) out.typography = entry.typography;
  if (entry.headerName !== undefined) out.headerName = entry.headerName;
  return out;
}

function genericForType(cellDataType: string | undefined): AutoFormatAssignment | null {
  switch (cellDataType) {
    case 'number':
      return {
        alignment: 'right',
        valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 2, thousands: true } },
      };
    case 'date':
    case 'dateString':
      return { valueFormatterTemplate: { kind: 'preset', preset: 'date' }, alignment: 'left' };
    case 'boolean':
      return { alignment: 'center' };
    default:
      return null;
  }
}

interface Candidate {
  entry: FieldFormatEntry;
  /** 2 = exact alias, 1 = suffix. */
  tier: 1 | 2;
  /** Matched-token length — longer wins within a tier. */
  len: number;
  /** Catalog index — earlier wins on a final tie. */
  order: number;
}

/**
 * Match a column to the catalog. `field` is the column's bound field path or
 * colId; `cellDataType` drives the generic fallback when nothing matches.
 * Returns `null` when neither the catalog nor the type fallback applies
 * (e.g. an untyped string column) — meaning "leave this column alone".
 */
export function matchFieldToCatalog(
  field: string | undefined,
  _headerName?: string,
  cellDataType?: string,
): AutoFormatAssignment | null {
  if (!field) return genericForType(cellDataType);

  const normFull = normalizeToken(field);
  const normLeaf = normalizeToken(leafOf(field));
  if (!normFull && !normLeaf) return genericForType(cellDataType);

  let best: Candidate | null = null;
  const consider = (c: Candidate) => {
    if (
      best === null ||
      c.tier > best.tier ||
      (c.tier === best.tier && c.len > best.len) ||
      (c.tier === best.tier && c.len === best.len && c.order < best.order)
    ) {
      best = c;
    }
  };

  FIELD_FORMAT_CATALOG.forEach((entry, order) => {
    for (const alias of entry.aliases ?? []) {
      const a = normalizeToken(alias);
      if (a && (a === normFull || a === normLeaf)) {
        consider({ entry, tier: 2, len: a.length, order });
      }
    }
    for (const suffix of entry.suffixes ?? []) {
      const s = normalizeToken(suffix);
      if (s.length < MIN_SUFFIX_LEN) continue;
      if (normLeaf.endsWith(s) || normFull.endsWith(s)) {
        consider({ entry, tier: 1, len: s.length, order });
      }
    }
  });

  if (best) return toAssignment((best as Candidate).entry);
  return genericForType(cellDataType);
}
