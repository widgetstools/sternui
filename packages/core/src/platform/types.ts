/**
 * Platform-level types. Everything a module or host consumer touches is
 * defined here — there are no framework imports anywhere in this file.
 */

import type {
  ColDef,
  ColGroupDef,
  GetRowIdFunc,
  GetRowIdParams,
  GridApi,
  GridOptions,
} from 'ag-grid-community';
import type { ComponentType } from 'react';

// ─── Column / grid aliases ──────────────────────────────────────────────────

export type AnyColDef = ColDef | ColGroupDef;

export type { GridApi, GridOptions, GetRowIdFunc, GetRowIdParams };

// ─── Persistence envelope ──────────────────────────────────────────────────

/**
 * Every persisted module state is wrapped in `{ v, data }`. `v` is the
 * module's `schemaVersion` at the time of serialisation; when the stored
 * value doesn't match the current module's schemaVersion, the platform
 * invokes `migrate` (or drops the state with a warning if no migration is
 * supplied).
 */
export interface SerializedState {
  v: number;
  data: unknown;
}

// ─── Typed event bus ──────────────────────────────────────────────────────

export interface PlatformEventMap {
  'grid:ready': { gridId: string };
  'grid:destroyed': { gridId: string };
  'module:registered': { gridId: string; moduleId: string };
  'module:stateChanged': { gridId: string; moduleId: string };
  'profile:loaded': { gridId: string; profileId: string };
  'profile:saved': { gridId: string; profileId: string };
  'profile:deleted': { gridId: string; profileId: string };
}

export interface EventBus<M> {
  emit<K extends keyof M>(event: K, payload: M[K]): void;
  on<K extends keyof M>(event: K, handler: (payload: M[K]) => void): () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export interface Store {
  readonly gridId: string;
  getModuleState<T>(moduleId: string): T;
  setModuleState<T>(moduleId: string, updater: (prev: T) => T): void;
  replaceModuleState<T>(moduleId: string, value: T): void;
  getAllModuleStates(): Record<string, unknown>;
  subscribe(listener: () => void): () => void;
  subscribeToModule<T>(moduleId: string, listener: (state: T, prev: T) => void): () => void;
}

// ─── Grid API hub ─────────────────────────────────────────────────────────

export type ApiEventName =
  | 'cellFocused'
  | 'cellClicked'
  | 'cellSelectionChanged'
  | 'cellValueChanged'
  | 'columnEverythingChanged'
  | 'columnGroupOpened'
  | 'columnPinned'
  | 'columnResized'
  | 'columnVisible'
  | 'displayedColumnsChanged'
  | 'filterChanged'
  | 'firstDataRendered'
  | 'modelUpdated'
  | 'rowDataUpdated'
  | 'rowValueChanged';

export interface ApiHub {
  /** The live GridApi, or null if the grid hasn't mounted yet. */
  readonly api: GridApi | null;
  /** Resolves when the grid fires `onGridReady`. Safe to await from anywhere. */
  whenReady(): Promise<GridApi>;
  /** Fire `fn` every time a grid mounts (or immediately if already ready).
   *  Returns a disposer. */
  onReady(fn: (api: GridApi) => void): () => void;
  /** Subscribe to an AG-Grid event. Returns a disposer. */
  on(evt: ApiEventName, fn: () => void): () => void;
  /** Run `fn` with the live api (null-safe). Returns `fallback` when api
   *  hasn't mounted. Pure — never subscribes. */
  use<T>(fn: (api: GridApi) => T, fallback: T): T;
}

// ─── Resource scope ───────────────────────────────────────────────────────

export interface CssHandle {
  addRule(ruleId: string, cssText: string): void;
  removeRule(ruleId: string): void;
  clear(): void;
}

export interface ExpressionEngineLike {
  parse(source: string): unknown;
  evaluate(node: unknown, ctx: unknown): unknown;
  parseAndEvaluate(source: string, ctx: unknown): unknown;
  validate(source: string): { valid: boolean; errors: Array<{ message: string; position: number; length: number }> };
}

export interface ResourceScope {
  /** Get (or create) a scoped CssInjector for a module. Idempotent per module id. */
  css(moduleId: string): CssHandle;
  /** The shared ExpressionEngine. Singleton per platform instance. */
  expression(): ExpressionEngineLike;
  /** A typed per-key WeakMap cache. Useful for api-keyed row snapshots etc. */
  cache<K extends object, V>(name: string): WeakMap<K, V>;
  /** Per-platform dirty registry. Panels mark items as dirty/clean via the
   *  `set` method; the `subscribe` method is consumed by `useDirty` / the
   *  `useSyncExternalStore` binding in React. Scoped by arbitrary string key
   *  (typically the item id or `${moduleId}:${itemId}`). Replaces v2's
   *  file-level `dirtyRegistry = new Set()` + `window.dispatchEvent` pattern
   *  so dirty state NEVER bleeds between grids on the same page. */
  dirty(): DirtyBus;
}

/**
 * A minimal event-notifier for dirty state. Intentionally not typed on the
 * key so callers can pick their own scoping (module id, item id, composite).
 */
export interface DirtyBus {
  /** Mark a key dirty or clean. Coalesces — setting the same state twice
   *  is a no-op and does NOT notify subscribers. */
  set(key: string, dirty: boolean): void;
  /** Is the key currently dirty? */
  isDirty(key: string): boolean;
  /** How many keys are currently dirty. Cheap — maintained incrementally. */
  count(): number;
  /** Every key currently dirty. Snapshot; safe to iterate. */
  keys(): string[];
  /** Subscribe to any change. `fn()` is invoked on every set that actually
   *  flips a key's dirty state. Returns a disposer. */
  subscribe(fn: () => void): () => void;
  /** Clear every key + notify once. Called on platform teardown. */
  reset(): void;
}

// ─── Platform handle passed to modules ────────────────────────────────────

export interface PlatformHandle<S> {
  readonly gridId: string;
  readonly api: ApiHub;
  readonly resources: ResourceScope;
  readonly events: EventBus<PlatformEventMap>;
  /** Read + write THIS module's state. */
  getState(): S;
  setState(updater: (prev: S) => S): void;
  /** Read another module's state (TYPED at the call site). */
  getModuleState<T>(moduleId: string): T;
  /** Subscribe to THIS module's state changes. */
  subscribe(fn: (state: S, prev: S) => void): () => void;
}

// ─── Module contract ──────────────────────────────────────────────────────

export interface Module<S = unknown> {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly dependencies?: readonly string[];
  readonly priority: number;

  getInitialState(): S;
  serialize(state: S): unknown;
  deserialize(raw: unknown): S;
  migrate?(raw: unknown, fromVersion: number): S;

  /**
   * Single-shot lifecycle. Called after the grid is ready, with the
   * platform handle. Returns a disposer that is invoked on teardown.
   *
   * This replaces v2's split (`onRegister` + `onGridReady` + `onGridDestroy`)
   * with one function whose closure scope holds all the module's runtime
   * state. Means no file-level mutable maps, no race between first
   * `transformColumnDefs` and resource allocation, and one clear cleanup.
   */
  activate?(platform: PlatformHandle<S>): () => void;

  // Pure transforms — run synchronously inside the pipeline runner. Receive
  // current state; do NOT fetch it themselves.
  transformColumnDefs?(defs: AnyColDef[], state: S, ctx: TransformContext): AnyColDef[];
  transformGridOptions?(opts: Partial<GridOptions>, state: S, ctx: TransformContext): Partial<GridOptions>;

  // Optional UI surface (React types — these are slots filled by React
  // bindings that live next to the module. Vanilla consumers can ignore.)
  readonly code?: string;
  SettingsPanel?: ComponentType<SettingsPanelProps>;
  ListPane?: ComponentType<ListPaneProps>;
  EditorPane?: ComponentType<EditorPaneProps>;
}

export type AnyModule = Module<any>;

/** Context available inside a `transformX` call. */
export interface TransformContext {
  readonly gridId: string;
  readonly getRowId: GetRowIdFunc;
  readonly getModuleState: <T>(moduleId: string) => T;
  readonly resources: ResourceScope;
  readonly api: GridApi | null;
}

// ─── UI slot props ─────────────────────────────────────────────────────────

export interface SettingsPanelProps { gridId: string }
export interface ListPaneProps {
  gridId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}
export interface EditorPaneProps {
  gridId: string;
  selectedId: string | null;
}
