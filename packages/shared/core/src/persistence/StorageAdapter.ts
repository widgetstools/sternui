import type { SerializedState } from '../platform/types';

/**
 * Persisted layout shape. `state` is the map of module id → versioned
 * envelope that `GridPlatform.serializeAll()` produces. Adapters treat it as
 * an opaque blob — only the platform knows how to interpret it.
 */
export interface LayoutSnapshot {
  readonly id: string;
  readonly gridId: string;
  name: string;
  state: Record<string, SerializedState>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Minimal K/V contract for per-grid layout storage.
 *
 * Implementations:
 *  - `MemoryAdapter` — in-memory, used for tests + hosts that don't want
 *    IndexedDB.
 *  - `DexieAdapter`  — IndexedDB-backed, same storage format as v2 so
 *    existing users' layouts keep loading (decision locked in the plan).
 */
export interface StorageAdapter {
  loadLayout(gridId: string, layoutId: string): Promise<LayoutSnapshot | null>;
  saveLayout(snapshot: LayoutSnapshot): Promise<void>;
  deleteLayout(gridId: string, layoutId: string): Promise<void>;
  /** Unordered list of all layouts for a grid. The LayoutManager sorts. */
  listLayouts(gridId: string): Promise<LayoutSnapshot[]>;

  /**
   * Read the grid-level data blob — opaque payload persisted alongside
   * layouts in the same backing row. Used for state that should survive
   * layout switches (e.g. the v2 data-provider selection: live + historical
   * provider ids and the live/historical mode).
   *
   * Returns `null` when no value has been persisted yet, or when the
   * adapter doesn't implement grid-level data (older adapters from
   * before this method was added).
   *
   * Optional so existing third-party StorageAdapter implementations
   * keep compiling. MarketsGrid checks for the method at runtime and
   * silently no-ops grid-level-data reads/writes when missing.
   */
  loadGridLevelData?(gridId: string): Promise<unknown | null>;

  /**
   * Persist the grid-level data blob. The shape is opaque to the
   * adapter — callers (typically `<MarketsGridContainer>`) own the
   * type. The adapter just stores and returns it.
   *
   * Should round-trip through `loadGridLevelData` byte-equivalently
   * (JSON serialization is acceptable). Called whenever the consumer
   * mutates `gridLevelData` via the `<MarketsGrid>` prop.
   */
  saveGridLevelData?(gridId: string, data: unknown): Promise<void>;
}

/** Sentinel id for the auto-managed Default layout. Reserved — `createLayout`
 *  rejects this id; `deleteLayout` on this id is a no-op. */
export const RESERVED_DEFAULT_LAYOUT_ID = '__default__';

/** localStorage key holding the active layout id for a grid.
 *
 *  Writes after the Profile → Layout rename land here (`gc-active-layout:`).
 *  Pre-rename installs persisted to {@link legacyActiveLayoutKey}; the
 *  read path in `LayoutManager` checks this key first, then falls back
 *  to the legacy key, and clears the legacy entry on next write so the
 *  migration completes gradually with zero user-visible touch. */
export const activeLayoutKey = (gridId: string): string =>
  `gc-active-layout:${gridId}`;

/** Pre-rename localStorage key — read-only back-compat fallback.
 *  Never written to by new code. */
export const legacyActiveLayoutKey = (gridId: string): string =>
  `gc-active-profile:${gridId}`;
