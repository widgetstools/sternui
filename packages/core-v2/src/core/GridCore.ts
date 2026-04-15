import type { GetRowIdParams, GridApi, GridOptions } from 'ag-grid-community';
import { EventBus } from './EventBus';
import { topoSortModules } from './topoSort';
import type {
  AnyColDef,
  AnyModule,
  GridContext,
  Module,
  ModuleContext,
  SerializedState,
} from './types';

export interface GridCoreOptions {
  gridId: string;
  modules: AnyModule[];
  /** Read a module's current state. Stable identity is the caller's
   *  responsibility — pass `() => store.getState().getModuleState(id)` rather
   *  than re-binding on every render. */
  getModuleState: <T>(moduleId: string) => T;
  /** Update a module's state via an updater callback. */
  setModuleState: <T>(moduleId: string, updater: (prev: T) => T) => void;
  /** Field on each row that uniquely identifies it. Defaults to `'id'`. */
  rowIdField?: string;
}

/**
 * Per-grid orchestrator. Owns the module registry, the event bus, and the
 * transform pipeline. Persistence + the React store sit *around* this class
 * (see `useProfileManager` and `createGridStore`); the core itself is
 * deliberately framework-agnostic so it can be unit-tested without React.
 */
export class GridCore {
  readonly gridId: string;
  readonly eventBus: EventBus;

  private modules: AnyModule[] = [];
  private moduleById = new Map<string, AnyModule>();
  private gridApi: GridApi | null = null;
  private rowIdField: string;
  private readonly getModuleStateFn: <T>(moduleId: string) => T;
  private readonly setModuleStateFn: <T>(moduleId: string, updater: (prev: T) => T) => void;

  constructor(options: GridCoreOptions) {
    this.gridId = options.gridId;
    this.rowIdField = options.rowIdField ?? 'id';
    this.getModuleStateFn = options.getModuleState;
    this.setModuleStateFn = options.setModuleState;
    this.eventBus = new EventBus();

    this.registerAll(options.modules);
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  private registerAll(modules: AnyModule[]): void {
    // topoSortModules validates: unknown deps, cycles, duplicate ids.
    this.modules = topoSortModules(modules);
    for (const m of this.modules) {
      this.moduleById.set(m.id, m);
    }

    const ctx = this.createModuleContext();
    for (const m of this.modules) {
      m.onRegister?.(ctx);
      this.eventBus.emit('module:registered', { gridId: this.gridId, moduleId: m.id });
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  onGridReady(api: GridApi): void {
    this.gridApi = api;
    const ctx = this.createGridContext();
    if (!ctx) return;
    for (const m of this.modules) m.onGridReady?.(ctx);
    this.eventBus.emit('grid:ready', { gridId: this.gridId });
  }

  onGridDestroy(): void {
    const ctx = this.createGridContext();
    if (ctx) {
      for (const m of this.modules) m.onGridDestroy?.(ctx);
    }
    this.eventBus.emit('grid:destroyed', { gridId: this.gridId });
    this.gridApi = null;
  }

  // ─── Transform pipeline ────────────────────────────────────────────────────

  transformColumnDefs(baseDefs: AnyColDef[]): AnyColDef[] {
    const ctx = this.createGridContext();
    if (!ctx) return baseDefs;
    let defs = baseDefs;
    for (const m of this.modules) {
      if (!m.transformColumnDefs) continue;
      const state = this.getModuleStateFn(m.id);
      defs = m.transformColumnDefs(defs, state, ctx);
    }
    return defs;
  }

  transformGridOptions(baseOptions: Partial<GridOptions>): Partial<GridOptions> {
    const ctx = this.createGridContext();
    let opts: Partial<GridOptions> = { ...baseOptions };

    // Always inject getRowId if the consumer didn't supply one — AG-Grid's
    // memory model degrades badly without it on any sizable dataset.
    if (!opts.getRowId) {
      const field = this.rowIdField;
      opts.getRowId = (params: GetRowIdParams) => String((params.data as Record<string, unknown>)[field]);
    }

    if (!ctx) return opts;
    for (const m of this.modules) {
      if (!m.transformGridOptions) continue;
      const state = this.getModuleStateFn(m.id);
      opts = m.transformGridOptions(opts, state, ctx);
    }
    return opts;
  }

  // ─── Serialization (with per-module schema versioning) ─────────────────────

  /**
   * Snapshot every module's state. The returned object is a plain dict —
   * caller picks where to persist it (Dexie / localStorage / REST / nowhere).
   */
  serializeAll(): Record<string, SerializedState> {
    const out: Record<string, SerializedState> = {};
    for (const m of this.modules) {
      const state = this.getModuleStateFn(m.id);
      out[m.id] = { v: m.schemaVersion, data: m.serialize(state) };
    }
    return out;
  }

  /**
   * Restore module state from a snapshot. Tolerates two formats:
   *  - The v2 envelope `{ v, data }` — schema version checked, migration run
   *    if needed, fallback to initial state if no migration is provided.
   *  - The v1 raw payload (no envelope) — passed straight to `deserialize`.
   *
   * Modules whose snapshot key is missing keep their current in-memory state
   * (caller can call `resetAll()` first to force initial state instead).
   */
  deserializeAll(snapshot: Record<string, unknown> | null | undefined): void {
    if (!snapshot || typeof snapshot !== 'object') return;

    for (const m of this.modules) {
      const raw = (snapshot as Record<string, unknown>)[m.id];
      if (raw === undefined) continue;

      const state = this.loadOneModule(m, raw);
      this.setModuleStateFn(m.id, () => state);
      this.eventBus.emit('module:stateChanged', { gridId: this.gridId, moduleId: m.id });
    }
  }

  /** Reset every module to its `getInitialState()` value. Useful right
   *  before a profile load when you want to clear stale state. */
  resetAll(): void {
    for (const m of this.modules) {
      const fresh = m.getInitialState();
      this.setModuleStateFn(m.id, () => fresh);
    }
  }

  private loadOneModule<S>(m: Module<S>, raw: unknown): S {
    const envelope = isSerializedEnvelope(raw) ? raw : null;
    const dataPayload = envelope ? envelope.data : raw;
    const storedVersion = envelope ? envelope.v : m.schemaVersion; // legacy: trust as current

    try {
      if (storedVersion === m.schemaVersion) {
        return m.deserialize(dataPayload);
      }
      if (m.migrate) {
        return m.migrate(dataPayload, storedVersion);
      }
      // No migration provided + version mismatch → drop with warning, never crash.
      console.warn(
        `[core-v2] Module "${m.id}" has stored schemaVersion ${storedVersion}, ` +
          `current is ${m.schemaVersion}, and no migrate() was provided. Falling back to initial state.`,
      );
      return m.getInitialState();
    } catch (err) {
      console.warn(
        `[core-v2] Module "${m.id}" failed to deserialize/migrate (falling back to initial state):`,
        err,
      );
      return m.getInitialState();
    }
  }

  // ─── Read-only accessors ───────────────────────────────────────────────────

  getModules(): readonly AnyModule[] {
    return this.modules;
  }

  getModule(id: string): AnyModule | undefined {
    return this.moduleById.get(id);
  }

  getGridApi(): GridApi | null {
    return this.gridApi;
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private createModuleContext(): ModuleContext {
    return {
      gridId: this.gridId,
      eventBus: this.eventBus,
      getGridContext: () => this.createGridContext(),
      getModuleState: this.getModuleStateFn,
      setModuleState: this.setModuleStateFn,
    };
  }

  private createGridContext(): GridContext | null {
    if (!this.gridApi) return null;
    const field = this.rowIdField;
    return {
      gridId: this.gridId,
      gridApi: this.gridApi,
      getRowId: (params: GetRowIdParams) =>
        String((params.data as Record<string, unknown>)[field]),
      getModuleState: this.getModuleStateFn,
    };
  }
}

// ─── Local helpers ───────────────────────────────────────────────────────────

function isSerializedEnvelope(value: unknown): value is SerializedState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    'data' in value &&
    typeof (value as { v: unknown }).v === 'number'
  );
}
