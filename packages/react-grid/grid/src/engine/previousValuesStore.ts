export type FieldDiff = { oldValue: unknown; newValue: unknown };

export class PreviousValuesStore {
  #byRow = new Map<string, Map<string, unknown>>();
  readonly #maxRows: number;

  /** `maxRows` bounds the store — oldest-inserted rows evict first. */
  constructor(maxRows = Number.POSITIVE_INFINITY) {
    this.#maxRows = maxRows;
  }

  #evictOverflow(): void {
    while (this.#byRow.size > this.#maxRows) {
      const oldest = this.#byRow.keys().next().value;
      if (oldest === undefined) break;
      this.#byRow.delete(oldest);
    }
  }

  remember(rowId: string, fields: Record<string, unknown>): void {
    const m = new Map<string, unknown>();
    for (const [k, v] of Object.entries(fields)) m.set(k, v);
    this.#byRow.set(rowId, m);
    this.#evictOverflow();
  }

  diffAndUpdate(rowId: string, next: Record<string, unknown>): Map<string, FieldDiff> {
    const prev = this.#byRow.get(rowId) ?? new Map<string, unknown>();
    const diffs = new Map<string, FieldDiff>();
    const updated = new Map(prev);
    for (const [k, newValue] of Object.entries(next)) {
      const oldValue = prev.get(k);
      if (!Object.is(oldValue, newValue)) {
        diffs.set(k, { oldValue, newValue });
      }
      updated.set(k, newValue);
    }
    this.#byRow.set(rowId, updated);
    this.#evictOverflow();
    return diffs;
  }

  forget(rowId: string): void {
    this.#byRow.delete(rowId);
  }

  clear(): void {
    this.#byRow.clear();
  }
}
