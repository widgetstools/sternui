/**
 * RowOrderIndex — the hub-side ordering layer for Server-Side Row Model
 * (SSRM) views. It holds the *order* of a provider's rows (an array of row
 * keys + a key→position map) separately from the row data itself (which stays
 * in `ProviderSlot.cache`). The grid pulls blocks by `[startRow, endRow)` and
 * the hub pushes live updates only for rows inside a subscriber's loaded
 * range — both need O(1) "what position is this key at?" lookups on the live
 * hot path, which is what this provides.
 *
 * Phase 1 is FLAT: the order is the cache's natural insertion order (updates
 * keep a row's position; new keys append). Phase 2 swaps this for a
 * sort/filter-derived order behind the same interface — the block/index
 * contract the hub and client depend on does not change.
 */

export class RowOrderIndex {
  private keys: string[] = [];
  private readonly index = new Map<string, number>();

  /** Replace the whole order (snapshot / replace=true). */
  reset(keys: Iterable<string>): void {
    this.keys = [...keys];
    this.index.clear();
    for (let i = 0; i < this.keys.length; i++) this.index.set(this.keys[i]!, i);
  }

  /** Append a previously-unseen key (a new row). No-op for known keys —
   *  an UPDATE keeps the row's position, so order is untouched. */
  add(key: string): void {
    if (this.index.has(key)) return;
    this.index.set(key, this.keys.length);
    this.keys.push(key);
  }

  /** Remove a key and re-index the tail. O(n) — rows are rarely removed
   *  mid-session on a blotter; bulk churn should `reset()` instead. */
  remove(key: string): void {
    const at = this.index.get(key);
    if (at === undefined) return;
    this.keys.splice(at, 1);
    this.index.delete(key);
    for (let i = at; i < this.keys.length; i++) this.index.set(this.keys[i]!, i);
  }

  has(key: string): boolean {
    return this.index.has(key);
  }

  /** Position of a key, or -1 if absent. */
  indexOf(key: string): number {
    const at = this.index.get(key);
    return at === undefined ? -1 : at;
  }

  /** Total row count — AG Grid's `rowCount` for the datasource. */
  count(): number {
    return this.keys.length;
  }

  /** Keys for the half-open block `[start, end)`, clamped to bounds. */
  rangeKeys(start: number, end: number): string[] {
    const lo = Math.max(0, Math.min(start, this.keys.length));
    const hi = Math.max(lo, Math.min(end, this.keys.length));
    return this.keys.slice(lo, hi);
  }

  /**
   * Given keys that changed this tick and a subscriber's loaded range, return
   * `{ key, rowIndex }` only for changes that land inside `[start, end)`. This
   * is the core of "push updates only for visible rows" — off-range changes
   * are dropped, so a paused/scrolled-away block costs nothing.
   */
  changesInRange(
    changedKeys: Iterable<string>,
    start: number,
    end: number,
  ): Array<{ key: string; rowIndex: number }> {
    const out: Array<{ key: string; rowIndex: number }> = [];
    for (const key of changedKeys) {
      const at = this.index.get(key);
      if (at === undefined || at < start || at >= end) continue;
      out.push({ key, rowIndex: at });
    }
    return out;
  }
}
