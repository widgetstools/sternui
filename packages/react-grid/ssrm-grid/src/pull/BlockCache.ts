/**
 * BlockCache — the window-side viewport block LRU (design fact #6).
 *
 * Every block read is an async worker hop; during a fling scroll the
 * grid re-requests blocks faster than the round trip. Caching the
 * most recent blocks lets the datasource serve-then-refresh: answer
 * `getRows` from cache instantly (no loading stubs), then patch the
 * grid with the fresh read when it lands.
 *
 * Entries are stamped with the generation and the view-shape key —
 * a restart or a sort/filter change never serves stale rows.
 */

export interface CachedBlock {
  rows: Record<string, unknown>[];
  /** View total row count observed by the read that produced `rows`. */
  total: number;
  generation: number;
  /** Requested block end (exclusive) — refreshes re-read the same span. */
  endRow: number;
}

export class BlockCache {
  private readonly maxBlocks: number;
  /** Insertion order = LRU order. Key: `${viewKey}#${startRow}`. */
  private readonly blocks = new Map<string, CachedBlock>();

  constructor(maxBlocks = 32) {
    this.maxBlocks = maxBlocks;
  }

  get size(): number {
    return this.blocks.size;
  }

  /** Existence check WITHOUT a recency touch (prefetch dedupe). */
  has(viewKey: string, startRow: number, generation: number): boolean {
    const entry = this.blocks.get(blockKey(viewKey, startRow));
    return entry !== undefined && entry.generation === generation;
  }

  get(viewKey: string, startRow: number, generation: number): CachedBlock | undefined {
    const key = blockKey(viewKey, startRow);
    const entry = this.blocks.get(key);
    if (!entry) return undefined;
    if (entry.generation !== generation) {
      this.blocks.delete(key); // stale generation — never serve it
      return undefined;
    }
    this.blocks.delete(key);
    this.blocks.set(key, entry); // refresh recency
    return entry;
  }

  set(
    viewKey: string,
    startRow: number,
    entry: CachedBlock,
  ): void {
    const key = blockKey(viewKey, startRow);
    this.blocks.delete(key);
    this.blocks.set(key, entry);
    while (this.blocks.size > this.maxBlocks) {
      const oldest = this.blocks.keys().next().value as string;
      this.blocks.delete(oldest);
    }
  }

  /** Blocks currently cached for one view shape + generation (LRU→MRU). */
  entriesFor(
    viewKey: string,
    generation: number,
  ): Array<{ startRow: number; block: CachedBlock }> {
    const prefix = `${viewKey}#`;
    const out: Array<{ startRow: number; block: CachedBlock }> = [];
    for (const [key, block] of this.blocks) {
      if (!key.startsWith(prefix) || block.generation !== generation) continue;
      out.push({ startRow: Number(key.slice(prefix.length)), block });
    }
    return out;
  }

  /**
   * The `limit` most-recently-used blocks of `generation` across EVERY
   * view shape, MRU first. Recency order is viewport order (every
   * serve/refresh touch is a viewport touch) — the wide-book gate
   * sweeps exactly this slice (see `sweepGate.ts`).
   */
  recentEntries(
    generation: number,
    limit: number,
  ): Array<{ viewKey: string; startRow: number; block: CachedBlock }> {
    const out: Array<{ viewKey: string; startRow: number; block: CachedBlock }> = [];
    const keys = [...this.blocks.keys()];
    for (let i = keys.length - 1; i >= 0 && out.length < limit; i -= 1) {
      const key = keys[i]!;
      const block = this.blocks.get(key)!;
      if (block.generation !== generation) continue;
      // The startRow rides after the LAST '#' — view keys are JSON and
      // may contain '#' inside filter strings.
      const hash = key.lastIndexOf('#');
      out.push({ viewKey: key.slice(0, hash), startRow: Number(key.slice(hash + 1)), block });
    }
    return out;
  }

  clear(): void {
    this.blocks.clear();
  }
}

function blockKey(viewKey: string, startRow: number): string {
  return `${viewKey}#${startRow}`;
}
