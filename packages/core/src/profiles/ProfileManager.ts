import type { GridPlatform } from '../platform/GridPlatform';
import {
  RESERVED_DEFAULT_PROFILE_ID,
  activeProfileKey,
  type ProfileSnapshot,
  type StorageAdapter,
} from '../persistence/StorageAdapter';
import type { SerializedState } from '../platform/types';
import { startAutoSave, type AutoSaveHandle } from '../store/autosave';
import type { ExportedProfilePayload, ProfileMeta } from './types';

export interface ProfileManagerOptions {
  platform: GridPlatform;
  adapter: StorageAdapter;
  autoSaveDebounceMs?: number;
  /** Pass `true` to skip wiring the auto-save engine. Tests opt in. */
  disableAutoSave?: boolean;
}

export interface ProfileManagerState {
  activeId: string;
  profiles: ProfileMeta[];
  isLoading: boolean;
  /** True when the live platform state has diverged from the last
   *  successful persist on the active profile. Reset to false on boot,
   *  load, save, create, and import. */
  isDirty: boolean;
}

type Listener = (state: ProfileManagerState) => void;

/**
 * Framework-free profile orchestration. Owns:
 *   - the reserved Default profile (auto-created on boot),
 *   - the active-profile pointer (one localStorage key per grid),
 *   - the auto-save engine,
 *   - export/import JSON payloads.
 *
 * React binding: `useProfileManager(…)` wraps this into a hook. An Angular
 * binding wraps the same class with signals.
 */
export class ProfileManager {
  private readonly platform: GridPlatform;
  private readonly adapter: StorageAdapter;
  private state: ProfileManagerState = {
    activeId: RESERVED_DEFAULT_PROFILE_ID,
    profiles: [],
    isLoading: true,
    isDirty: false,
  };
  private listeners = new Set<Listener>();
  private autoSave: AutoSaveHandle | null = null;
  private readonly autoSaveDebounceMs: number;
  private readonly disableAutoSave: boolean;
  private disposed = false;
  private booted = false;
  /** Unsubscribe handle for the store listener that tracks dirty state.
   *  Only installed when auto-save is disabled — when auto-save is on,
   *  every store change is already persisted so there's no reason to
   *  mark anything dirty. */
  private dirtyUnsubscribe: (() => void) | null = null;
  /** Counter that suppresses dirty-marking inside `load()` / `create()` /
   *  `import()` / `boot()` — those flows synchronously mutate the
   *  platform store as they apply a snapshot, which would otherwise
   *  immediately flip isDirty=true. A counter (not a bool) handles
   *  nested or interleaved calls safely. */
  private dirtySuppressDepth = 0;

  constructor(opts: ProfileManagerOptions) {
    this.platform = opts.platform;
    this.adapter = opts.adapter;
    this.autoSaveDebounceMs = opts.autoSaveDebounceMs ?? 300;
    this.disableAutoSave = opts.disableAutoSave ?? false;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getState(): ProfileManagerState {
    return this.state;
  }

  /** Boot: ensure Default exists, resolve active id from localStorage,
   *  load the snapshot, wire auto-save. Call once per mount.
   *
   *  Idempotency + disposed-guards:
   *    - If `boot()` is called twice (e.g. race in a host that doesn't
   *      check before calling), the second run short-circuits.
   *    - After every `await` we re-check `this.disposed` and abort if a
   *      caller has torn us down in the meantime. Without this, a stale
   *      manager can keep mutating the shared platform store after
   *      `dispose()` has been called — the exact bug family that caused
   *      the StrictMode profile-list regression. */
  async boot(): Promise<void> {
    if (this.disposed || this.booted) return;
    this.booted = true;

    try {
      const { gridId } = this.platform;

      // Ensure the Default profile row exists.
      let def = await this.adapter.loadProfile(gridId, RESERVED_DEFAULT_PROFILE_ID);
      if (this.disposed) return;
      if (!def) {
        const now = Date.now();
        def = {
          id: RESERVED_DEFAULT_PROFILE_ID,
          gridId,
          name: 'Default',
          state: {},
          createdAt: now,
          updatedAt: now,
        };
        await this.adapter.saveProfile(def);
        if (this.disposed) return;
      }

      // Resolve the id to load.
      const lsId = readActiveId(gridId);
      let resolvedId = RESERVED_DEFAULT_PROFILE_ID;
      let snapshot: ProfileSnapshot = def;
      if (lsId && lsId !== RESERVED_DEFAULT_PROFILE_ID) {
        const candidate = await this.adapter.loadProfile(gridId, lsId);
        if (this.disposed) return;
        if (candidate) {
          resolvedId = lsId;
          snapshot = candidate;
        } else {
          writeActiveId(gridId, RESERVED_DEFAULT_PROFILE_ID);
        }
      }

      // Apply state + announce. Suppress dirty-marking while the store
      // is hydrated from the snapshot — otherwise the initial deserialize
      // would flip isDirty=true before the user has touched anything.
      this.dirtySuppressDepth++;
      try {
        this.platform.resetAll();
        this.platform.deserializeAll(snapshot.state);
      } finally {
        this.dirtySuppressDepth--;
      }
      this.updateState({ activeId: resolvedId, isDirty: false });
      writeActiveId(gridId, resolvedId);
      this.platform.events.emit('profile:loaded', { gridId, profileId: resolvedId });

      // Refresh profile list.
      await this.refresh();
      if (this.disposed) return;
      this.updateState({ isLoading: false });

      // Wire either the auto-save engine (legacy / tests) or the dirty
      // tracker (production default). Double-check disposed once more so
      // a late teardown can't leak a running subscription on
      // `platform.store`.
      if (!this.disposed) {
        if (this.disableAutoSave) {
          this.dirtyUnsubscribe = this.platform.store.subscribe(() => {
            if (this.dirtySuppressDepth > 0 || this.disposed) return;
            if (!this.state.isDirty) this.updateState({ isDirty: true });
          });
        } else {
          this.autoSave = startAutoSave({
            platform: this.platform,
            store: this.platform.store,
            debounceMs: this.autoSaveDebounceMs,
            persist: (snap) => this.persistActive(snap),
          });
        }
      }
    } catch (err) {
      if (this.disposed) return;
      console.warn('[profiles] boot failed:', err);
      this.updateState({ isLoading: false });
    }
  }

  /** Flush any pending auto-save then explicitly persist the live state.
   *  Clears the dirty flag on success. */
  async save(): Promise<void> {
    if (this.autoSave) {
      await this.autoSave.flushNow();
    } else {
      await this.persistActive(this.platform.serializeAll());
    }
    if (this.disposed) return;
    if (this.state.isDirty) this.updateState({ isDirty: false });
  }

  /** Throw away in-memory changes and reload the active profile from
   *  disk. Used by the "Discard changes" action on profile switch /
   *  beforeunload prompts. */
  async discard(): Promise<void> {
    if (this.disposed) return;
    const { gridId } = this.platform;
    const id = this.state.activeId;
    const snap = await this.adapter.loadProfile(gridId, id);
    if (this.disposed) return;
    this.autoSave?.cancelScheduled();
    this.dirtySuppressDepth++;
    try {
      this.platform.resetAll();
      if (snap) this.platform.deserializeAll(snap.state);
    } finally {
      this.dirtySuppressDepth--;
    }
    this.autoSave?.cancelScheduled();
    this.updateState({ isDirty: false });
    this.platform.events.emit('profile:loaded', { gridId, profileId: id });
  }

  /** Load a profile by id. Replaces the in-memory store + flips the
   *  active pointer.
   *
   *  Behavior with auto-save disabled (the default now): any unsaved
   *  edits on the OUTGOING profile are thrown away — callers that want
   *  to preserve them must call `save()` BEFORE `load()`. The
   *  markets-grid host pops an AlertDialog on switch-while-dirty so
   *  the user makes this choice explicitly.
   *
   *  Behavior with auto-save enabled (legacy / tests): pending writes
   *  are flushed to the OUTGOING profile before the pointer flips, so
   *  in-flight edits land on the right snapshot. `skipFlush` opts out
   *  (used by `remove()` so we don't resurrect the just-deleted
   *  profile).
   *
   *  Ordering contract (critical for state isolation):
   *    1. Settle any pending auto-save first (flush or cancel).
   *    2. Flip the active-id pointer BEFORE mutating the platform
   *       store. resetAll() + deserializeAll() trigger subscriptions;
   *       if the pointer is still on the old id a persist would write
   *       the NEW state into the OLD profile's snapshot.
   *    3. cancelScheduled() AGAIN after the mutations: even with the
   *       order above we want a clean slate on the newly-active
   *       profile.
   */
  async load(id: string, opts?: { skipFlush?: boolean }): Promise<void> {
    if (this.autoSave) {
      if (opts?.skipFlush) this.autoSave.cancelScheduled();
      else await this.autoSave.flushNow();
    }
    const { gridId } = this.platform;
    const snap = await this.adapter.loadProfile(gridId, id);
    if (!snap) throw new Error(`[profiles] No profile "${id}" for grid "${gridId}"`);
    // Flip BEFORE mutating so the persist callback always targets the new id.
    this.updateState({ activeId: id });
    writeActiveId(gridId, id);
    // Suppress dirty-marking through resetAll + deserializeAll — we're
    // hydrating from disk, not editing.
    this.dirtySuppressDepth++;
    try {
      this.platform.resetAll();
      this.platform.deserializeAll(snap.state);
    } finally {
      this.dirtySuppressDepth--;
    }
    // Kill the debounce scheduled by resetAll + deserializeAll. The state
    // we just loaded is already on disk — no reason to re-write it.
    this.autoSave?.cancelScheduled();
    this.updateState({ isDirty: false });
    this.platform.events.emit('profile:loaded', { gridId, profileId: id });
    await this.refresh();
  }

  /** Create a new profile, seeded from the module's `getInitialState()` for
   *  every module (so it's a true blank slate, not a clone of the current).
   *
   *  Same ordering contract as `load()`: flush pending auto-save against
   *  the OLD profile first, then flip the active-id pointer, then mutate.
   *  Without flushing first, a debounced save from the previous profile
   *  would land on the NEW profile's snapshot between the reset and the
   *  adapter write — rare but real state bleed.
   */
  async create(name: string, options?: { id?: string }): Promise<ProfileMeta> {
    const id = options?.id ?? slugId(name);
    if (id === RESERVED_DEFAULT_PROFILE_ID) {
      throw new Error(`[profiles] Cannot reuse reserved id "${RESERVED_DEFAULT_PROFILE_ID}"`);
    }
    const { gridId } = this.platform;

    // Flush the old profile's pending debounce before flipping the pointer
    // (legacy auto-save only). With auto-save disabled, create() always
    // discards the outgoing profile's in-memory edits — the markets-grid
    // host prompts the user before reaching this codepath.
    if (this.autoSave) await this.autoSave.flushNow();

    // Flip BEFORE mutating (see load()'s rationale).
    this.updateState({ activeId: id });
    writeActiveId(gridId, id);

    this.dirtySuppressDepth++;
    try {
      this.platform.resetAll();
    } finally {
      this.dirtySuppressDepth--;
    }

    const now = Date.now();
    const snap: ProfileSnapshot = {
      id,
      gridId,
      name: name.trim() || id,
      state: this.platform.serializeAll(),
      createdAt: now,
      updatedAt: now,
    };
    await this.adapter.saveProfile(snap);
    // Cancel the debounce scheduled by resetAll(); the snapshot is already
    // on disk.
    this.autoSave?.cancelScheduled();
    this.updateState({ isDirty: false });

    this.platform.events.emit('profile:saved', { gridId, profileId: id });
    this.platform.events.emit('profile:loaded', { gridId, profileId: id });
    await this.refresh();
    return toMeta(snap);
  }

  /** Delete a profile. Default is immutable; falls back to Default on delete
   *  of the currently-active profile. */
  async remove(id: string): Promise<void> {
    if (id === RESERVED_DEFAULT_PROFILE_ID) return;
    this.autoSave?.cancelScheduled();
    const { gridId } = this.platform;
    await this.adapter.deleteProfile(gridId, id);
    this.platform.events.emit('profile:deleted', { gridId, profileId: id });
    if (this.state.activeId === id) {
      await this.load(RESERVED_DEFAULT_PROFILE_ID, { skipFlush: true });
    } else {
      await this.refresh();
    }
  }

  async rename(id: string, name: string): Promise<void> {
    if (id === RESERVED_DEFAULT_PROFILE_ID) {
      throw new Error('[profiles] Cannot rename Default');
    }
    const { gridId } = this.platform;
    const existing = await this.adapter.loadProfile(gridId, id);
    if (!existing) return;
    await this.adapter.saveProfile({
      ...existing,
      name: name.trim() || id,
      updatedAt: Date.now(),
    });
    await this.refresh();
  }

  /** Snapshot a profile as a portable JSON payload. Flushes any pending
   *  auto-save first so the payload reflects the latest edits. */
  async export(id?: string): Promise<ExportedProfilePayload> {
    const targetId = id ?? this.state.activeId;
    await this.autoSave?.flushNow();
    const snap = await this.adapter.loadProfile(this.platform.gridId, targetId);
    if (!snap) throw new Error(`[profiles] No profile "${targetId}" to export`);
    return {
      schemaVersion: 1,
      kind: 'gc-profile',
      exportedAt: new Date().toISOString(),
      profile: { name: snap.name, gridId: snap.gridId, state: snap.state },
    };
  }

  /** Import a previously-exported payload. Always additive — unique id +
   *  name on collision so imports never overwrite. Activates the new
   *  profile unless `activate: false`. */
  async import(
    payload: unknown,
    options?: { name?: string; activate?: boolean },
  ): Promise<ProfileMeta> {
    const parsed = validatePayload(payload);
    const { gridId } = this.platform;
    const existing = await this.adapter.listProfiles(gridId);
    const existingIds = new Set(existing.map((p) => p.id));
    const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));

    let name = options?.name?.trim() || parsed.profile.name || 'Imported profile';
    if (existingNames.has(name.toLowerCase())) {
      let n = 2;
      while (existingNames.has(`${name} (imported ${n})`.toLowerCase())) n++;
      name = `${name} (imported ${n})`;
    }

    const baseId =
      slugId(name) || `imported-${Date.now().toString(36)}`;
    let id = baseId;
    let counter = 2;
    while (existingIds.has(id) || id === RESERVED_DEFAULT_PROFILE_ID) {
      id = `${baseId}-${counter++}`;
    }

    const now = Date.now();
    const snap: ProfileSnapshot = {
      id,
      gridId,
      name,
      state: parsed.profile.state,
      createdAt: now,
      updatedAt: now,
    };
    await this.adapter.saveProfile(snap);
    this.platform.events.emit('profile:saved', { gridId, profileId: id });
    await this.refresh();

    if (options?.activate !== false) {
      // Same ordering as load(): flush → flip → mutate → cancel-scheduled.
      if (this.autoSave) await this.autoSave.flushNow();
      this.updateState({ activeId: id });
      writeActiveId(gridId, id);
      this.dirtySuppressDepth++;
      try {
        this.platform.resetAll();
        this.platform.deserializeAll(snap.state);
      } finally {
        this.dirtySuppressDepth--;
      }
      this.autoSave?.cancelScheduled();
      this.updateState({ isDirty: false });
      this.platform.events.emit('profile:loaded', { gridId, profileId: id });
    }
    return toMeta(snap);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.autoSave?.dispose();
    this.autoSave = null;
    this.dirtyUnsubscribe?.();
    this.dirtyUnsubscribe = null;
    this.listeners.clear();
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async refresh(): Promise<void> {
    const list = await this.adapter.listProfiles(this.platform.gridId);
    this.updateState({ profiles: list.map(toMeta).sort(byName) });
  }

  private async persistActive(state: Record<string, SerializedState>): Promise<void> {
    const id = this.state.activeId;
    const { gridId } = this.platform;
    const existing = await this.adapter.loadProfile(gridId, id);
    const now = Date.now();
    const next: ProfileSnapshot = existing
      ? { ...existing, state, updatedAt: now }
      : {
          id,
          gridId,
          name: id === RESERVED_DEFAULT_PROFILE_ID ? 'Default' : id,
          state,
          createdAt: now,
          updatedAt: now,
        };
    await this.adapter.saveProfile(next);
    // In the auto-save codepath, clearing dirty here keeps the flag in
    // sync without depending on save() being called explicitly.
    if (!this.disposed && this.state.isDirty) {
      this.updateState({ isDirty: false });
    }
    this.platform.events.emit('profile:saved', { gridId, profileId: id });
  }

  private updateState(patch: Partial<ProfileManagerState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
}

// ─── Local helpers ──────────────────────────────────────────────────────────

function toMeta(snap: ProfileSnapshot): ProfileMeta {
  return {
    id: snap.id,
    name: snap.name,
    createdAt: snap.createdAt,
    updatedAt: snap.updatedAt,
    isDefault: snap.id === RESERVED_DEFAULT_PROFILE_ID,
  };
}

function byName(a: ProfileMeta, b: ProfileMeta): number {
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function slugId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function readActiveId(gridId: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(activeProfileKey(gridId));
  } catch {
    return null;
  }
}

function writeActiveId(gridId: string, id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(activeProfileKey(gridId), id);
  } catch {
    /* ignore — private mode etc. */
  }
}

function validatePayload(raw: unknown): ExportedProfilePayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[profiles] Import payload is not an object');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== 'gc-profile') {
    throw new Error('[profiles] Not a gc-profile export');
  }
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion < 1) {
    throw new Error('[profiles] Unsupported schemaVersion');
  }
  const profile = obj.profile as Record<string, unknown> | undefined;
  if (!profile || typeof profile !== 'object') {
    throw new Error('[profiles] Missing profile body');
  }
  if (typeof profile.name !== 'string' || !profile.name.trim()) {
    throw new Error('[profiles] Missing profile.name');
  }
  if (typeof profile.gridId !== 'string') {
    throw new Error('[profiles] Missing profile.gridId');
  }
  if (!profile.state || typeof profile.state !== 'object') {
    throw new Error('[profiles] Missing profile.state');
  }
  return {
    schemaVersion: 1,
    kind: 'gc-profile',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    profile: {
      name: profile.name.trim(),
      gridId: profile.gridId,
      state: profile.state as Record<string, SerializedState>,
    },
  };
}
