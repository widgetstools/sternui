/**
 * Give AG Grid's set filters a value list on the Perspective path.
 *
 * A set filter's checkbox list is the values it found in the row data. Under
 * CSRM that is the whole book, so it just works. Under a server row model the
 * client holds only the loaded blocks, and AG's answer is that the application
 * supplies the list — which nothing did here, so `getFilterKeys()` returned
 * `[]` on every column and the column filter menus were unusable. That also
 * blocked the saved-filter pills, since a pill is captured from a live column
 * filter.
 *
 * Perspective answers it from a `group_by` View on the column: one row per
 * distinct value, computed in the worker over the whole book.
 *
 * `CustomSSRMGrid` solves the same problem in `buildColumnOverride`, but only
 * for columns whose `filter` is the literal `'agSetColumnFilter'`. That misses
 * the common case: with AG Grid Enterprise, a plain `filter: true` — which is
 * what `defaultColDef` carries on these grids — also resolves to a set filter.
 * So the list is attached to every column that could take one; a filter type
 * that has no use for `filterParams.values` ignores it.
 */

/** The slice of a column def this walks. */
interface AnyColDef {
  field?: string;
  colId?: string;
  children?: AnyColDef[];
  filter?: unknown;
  filterParams?: Record<string, unknown>;
  [key: string]: unknown;
}

/** AG's async set-filter values callback. */
interface SetFilterValuesParams {
  success(values: unknown[]): void;
}

/**
 * Attach an async `filterParams.values` provider to every leaf column.
 *
 * Never overwrites a `values` a caller already supplied — an explicit list is a
 * deliberate choice (a fixed domain, a curated subset) and outranks the book.
 *
 * `null` from the provider means "no honest list" (past the cardinality ceiling,
 * or the read failed) and resolves EMPTY rather than partial: a set filter has
 * no "there are more" affordance, so a truncated list reads as the whole domain
 * and its Select All silently excludes the rest.
 */
export function withPerspectiveSetFilterValues<T>(
  columnDefs: readonly T[],
  getValues: (colId: string) => Promise<unknown[] | null>,
): T[] {
  const mapDef = (input: T): T => {
    const def = input as AnyColDef;
    if (!def || typeof def !== 'object') return input;

    if (Array.isArray(def.children)) {
      return { ...def, children: def.children.map((c) => mapDef(c as T)) } as T;
    }

    const colId = def.field ?? (typeof def.colId === 'string' ? def.colId : undefined);
    if (!colId) return input;
    if (def.filterParams?.values !== undefined) return input;

    return {
      ...def,
      filterParams: {
        ...def.filterParams,
        // Without this, refreshing the values wipes a selection the user
        // already made — and the list is refreshed as the book changes.
        suppressClearModelOnRefreshValues: true,
        values: (params: SetFilterValuesParams) => {
          void getValues(colId).then(
            (list) => params.success(list ?? []),
            () => params.success([]),
          );
        },
      },
    } as T;
  };

  return columnDefs.map(mapDef);
}
