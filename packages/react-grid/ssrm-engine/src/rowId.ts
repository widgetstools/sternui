/**
 * ONE definition of a row id, for every consumer of one.
 *
 * There were two. `datasource.ts` had `makeSsrmGetRowId`, which read the group
 * path the engine stamps on and answered a BARE key for a leaf; the MarketsGrid
 * surface had its own `makeGetRowId`, built from AG's `level` / `parentKeys` and
 * answering a PATH for a leaf as well. The shipped surface used the second and
 * every test used the first — so `deltaPath.fuzz.test.ts` ran 260 adversarial
 * frames through the push path against an id definition the product does not
 * have, and missed a defect that dropped 100% of pushed rows under grouping.
 *
 * The definition below is the surface's, because it is AG Grid's own documented
 * one: `parentKeys.join(...)` prefixes the leaf id as well as the group id (see
 * AG's "Server-Side Row Model / Row IDs" example). It is also the one measured
 * at 50,000 rows with 0 failed blocks. It is now the only one — `datasource.ts`
 * re-exports it, the surface calls it, the pump path is bound by it, and the
 * fuzz models AG with it.
 *
 * ## What follows from it, and is the whole of session 9's grouped-tick work
 *
 * Under grouping a leaf id is `Alpha/Energy/POS-123`. A pushed patch is SPARSE —
 * the cells that moved and the key — so it does not carry `assetClass` or
 * `issuerSector` and the path cannot be reconstructed from it, even in
 * principle. The pump therefore cannot address a leaf while grouping is on, and
 * the answer is not to teach it to guess: it is to stop pushing and refresh the
 * expanded routes instead, which is the only thing that moves a GROUP row's
 * aggregate anyway. See `rowEngine.ts`.
 */
import {
  SSRM_GRAND_TOTAL_FLAG,
  SSRM_GRAND_TOTAL_ROW_ID,
  SSRM_TREE_GROUP,
  SSRM_TREE_KEY,
  type SsrmRow,
} from './types.js';

/**
 * The slice of AG's `GetRowIdParams` this needs, restated structurally so the
 * package still holds no AG Grid import.
 *
 * `api` is optional so a caller that already knows the grouping columns (the
 * fuzz's grid model, a test) can supply them directly.
 */
export interface SsrmGetRowIdParams {
  data: SsrmRow;
  /** Depth of the row. 0 is the root level, grouped or not. */
  level?: number;
  /** Ancestor group keys, outermost first. */
  parentKeys?: readonly unknown[];
  api?: {
    getRowGroupColumns?(): readonly {
      getColDef(): { field?: string | null };
      getColId(): string;
    }[];
  };
  /** Row-group column FIELDS, outermost first — AG's columns, already resolved. */
  groupFields?: readonly string[];
}

function groupFieldsOf(params: SsrmGetRowIdParams): readonly string[] {
  if (params.groupFields !== undefined) return params.groupFields;
  const columns = params.api?.getRowGroupColumns?.() ?? [];
  return columns.map((column) => column.getColDef().field ?? column.getColId());
}

/**
 * Row identity for AG Grid, on every surface this package feeds.
 *
 * **RULE 3 — a group row is identified by its PATH.** Group rows carry no key
 * column of their own, so an id derived from one collides across every group at
 * a level, and duplicate ids make AG DISCARD the block (warn 205) rather than
 * warn visibly.
 *
 * Tree rows need the same treatment and cannot get it the same way: in tree mode
 * there are no row-group columns at all, so the `level < groupFields.length`
 * test is false at every depth and every parent would be keyed off the leaf
 * column it does not have. They are recognised by the marker the engine stamps.
 *
 * The grand total is named explicitly, because the transaction that keeps it
 * live can only reach that row by AG's own id for it.
 */
export function makeSsrmGetRowId(keyField: string) {
  return (params: SsrmGetRowIdParams): string => {
    const row = params.data;
    const parentKeys = params.parentKeys ?? [];
    if (row?.[SSRM_GRAND_TOTAL_FLAG]) return SSRM_GRAND_TOTAL_ROW_ID;
    if (row?.[SSRM_TREE_GROUP]) return [...parentKeys, row?.[SSRM_TREE_KEY]].join('/');
    const groupFields = groupFieldsOf(params);
    const level = params.level ?? 0;
    if (level < groupFields.length) {
      return [...parentKeys, row?.[groupFields[level]]].join('/');
    }
    return [...parentKeys, row?.[keyField]].join('/');
  };
}

/** No ancestors and no group columns — reused so the ungrouped id allocates none. */
const NO_GROUPS: readonly string[] = [];

/**
 * The id of a row that is NOT under any group — the only id a sparse patch can
 * name, and the reason the push path is off while grouping.
 *
 * Deliberately expressed through {@link makeSsrmGetRowId} rather than as
 * `String(key)`: it is the same definition at level 0 with no ancestors, and
 * writing that shortcut out by hand is how the two definitions diverged the
 * first time.
 */
export function makeSsrmUngroupedRowId(keyField: string): (row: SsrmRow) => string {
  const rowId = makeSsrmGetRowId(keyField);
  return (row) => rowId({ data: row, level: 0, groupFields: NO_GROUPS });
}
