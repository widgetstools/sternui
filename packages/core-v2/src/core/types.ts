import type { ColDef, ColGroupDef, GridApi, GridOptions, GetRowIdFunc } from 'ag-grid-community';
import type { ComponentType } from 'react';

// ─── Column / option aliases ──────────────────────────────────────────────────

export type AnyColDef = ColDef | ColGroupDef;

// ─── Serialized envelope ──────────────────────────────────────────────────────

/**
 * Every persisted module state is wrapped in this envelope. The `v` field is
 * the module's `schemaVersion` *at the time of serialization* — when the stored
 * `v` doesn't match the current module's `schemaVersion`, the core calls the
 * module's `migrate(raw, fromVersion)` (or drops the state with a warning if
 * no migration is provided).
 */
export interface SerializedState {
  v: number;
  data: unknown;
}

// ─── Grid + module contexts ───────────────────────────────────────────────────

export interface GridContext {
  readonly gridId: string;
  readonly gridApi: GridApi;
  readonly getRowId: GetRowIdFunc;
  /**
   * Read another module's current state. The same accessor that `ModuleContext`
   * exposes; surfaced here so cross-module reads work from inside
   * `transformColumnDefs` / `transformGridOptions`.
   *
   * Caller must know the target module's state shape — pass the type via the
   * generic, e.g. `ctx.getModuleState<ColumnTemplatesState>('column-templates')`.
   */
  readonly getModuleState: <T>(moduleId: string) => T;
}

export interface ModuleContext {
  readonly gridId: string;
  readonly eventBus: EventBusInstance;
  readonly getGridContext: () => GridContext | null;
  readonly getModuleState: <T>(moduleId: string) => T;
  readonly setModuleState: <T>(moduleId: string, updater: (prev: T) => T) => void;
}

// ─── Event bus ────────────────────────────────────────────────────────────────

export interface EventMap {
  'grid:ready': { gridId: string };
  'grid:destroyed': { gridId: string };
  'module:registered': { gridId: string; moduleId: string };
  'module:stateChanged': { gridId: string; moduleId: string };
  'profile:loaded': { gridId: string; profileId: string };
  'profile:saved': { gridId: string; profileId: string };
  'profile:deleted': { gridId: string; profileId: string };
}

export interface EventBusInstance {
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): () => void;
}

// ─── Module ───────────────────────────────────────────────────────────────────

/**
 * Plug-in unit. A module owns one slice of grid state, knows how to serialize
 * + deserialize it, and may transform column defs / grid options when the grid
 * mounts.
 *
 * Two contracts the v1 core didn't enforce, that v2 does:
 *   1. `dependencies[]` — verified at registration. Missing or cyclic deps
 *      throw immediately rather than producing silent ordering bugs.
 *   2. `schemaVersion` + optional `migrate` — every persisted state carries
 *      the version it was serialized at. Mismatched loads either run the
 *      module's migrator or fall back to `getInitialState()` with a warning.
 */
export interface Module<S = unknown> {
  /** Unique identifier within a grid. */
  readonly id: string;
  /** Human-readable name (used by settings UI). */
  readonly name: string;
  /** Bumped whenever the shape of `S` changes in a way that breaks
   *  deserialize. Stored alongside every serialized snapshot. */
  readonly schemaVersion: number;
  /** Module IDs this module depends on. **Enforced** at registration —
   *  registration throws on missing or cyclic deps. */
  readonly dependencies?: readonly string[];
  /** Within the dependency-derived topological order, modules with a lower
   *  `priority` run first in the transform pipeline. Duplicates inside the
   *  same dep level are flagged at registration. */
  readonly priority: number;

  /** Default state when nothing is persisted yet. Must return a fresh object
   *  each call (no shared references) so callers can mutate freely. */
  getInitialState(): S;

  /** Convert state to a plain JSON-serializable value. The returned value is
   *  wrapped in `{ v: schemaVersion, data: <returned> }` by the core. */
  serialize(state: S): unknown;

  /** Inverse of `serialize`. Called when the stored `v` matches the current
   *  `schemaVersion`. Must tolerate being given any unknown value (e.g.,
   *  null, {}, malformed input) and return a sensible state — never throw. */
  deserialize(raw: unknown): S;

  /** Optional migration. Called when `stored.v < schemaVersion`. Return the
   *  migrated state, or throw to fall back to `getInitialState()`. */
  migrate?(raw: unknown, fromVersion: number): S;

  // ─── Lifecycle hooks (all optional) ──────────────────────────────────────

  onRegister?(ctx: ModuleContext): void;
  onGridReady?(ctx: GridContext): void;
  onGridDestroy?(ctx: GridContext): void;

  // ─── Transform pipeline (all optional) ───────────────────────────────────

  transformColumnDefs?(defs: AnyColDef[], state: S, ctx: GridContext): AnyColDef[];
  transformGridOptions?(opts: Partial<GridOptions>, state: S, ctx: GridContext): Partial<GridOptions>;

  // ─── Optional UI surface ─────────────────────────────────────────────────
  //
  // Two shapes are supported:
  //
  //   1. Legacy flat: `SettingsPanel` — renders a single panel inside the
  //      sheet's content area. The module owns its full UI. Kept for
  //      modules that don't fit the master-detail pattern.
  //
  //   2. Master-detail: `ListPane` + `EditorPane`. When BOTH are provided
  //      (and the sheet supports it), the sheet renders `ListPane` in its
  //      items rail and `EditorPane` in the editor area. Selection state
  //      lives in the sheet; modules receive / report it via props.
  //
  // Modules may provide both for host flexibility. Precedence: if the host
  // is the v2 Cockpit sheet it uses the master-detail shape; otherwise it
  // falls back to `SettingsPanel`.

  SettingsPanel?: ComponentType<SettingsPanelProps>;
  ListPane?: ComponentType<ListPaneProps>;
  EditorPane?: ComponentType<EditorPaneProps>;

  /** Optional: the module's code-point in the top-nav rail (e.g. "01").
   *  Purely cosmetic — Cockpit uses it to label the nav button. */
  readonly code?: string;
}

export interface SettingsPanelProps {
  gridId: string;
}

/** Master-detail list pane. The sheet owns selection; the module reports
 *  changes via `onSelect` and reflects the current `selectedId`. */
export interface ListPaneProps {
  gridId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** Master-detail editor pane. Receives the currently-selected id from
 *  the sheet. Modules render the config for that item; when `selectedId`
 *  is null they should render an empty-state prompting the user to pick
 *  or add an item from the list. */
export interface EditorPaneProps {
  gridId: string;
  selectedId: string | null;
}

export type AnyModule = Module<any>;
