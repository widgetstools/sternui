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
  };
  private listeners = new Set<Listener>();
  private autoSave: AutoSaveHandle | null = null;
  private readonly autoSaveDebounceMs: number;
  private readonly disableAutoSave: boolean;
  private disposed = false;
  private booted = false;

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

      // Apply state + announce.
      this.platform.resetAll();
      this.platform.deserializeAll(snapshot.state);
      this.updateState({ activeId: resolvedId });
      writeActiveId(gridId, resolvedId);
      this.platform.events.emit('profile:loaded', { gridId, profileId: resolvedId });

      // Refresh profile list.
      await this.refresh();
      if (this.disposed) return;
      this.updateState({ isLoading: false });

      // Wire auto-save now that boot completed. Double-check disposed
      // once more so a late teardown can't leak a running auto-save
      // subscription on `platform.store`.
      if (!this.disableAutoSave && !this.disposed) {
        this.autoSave = startAutoSave({
          platform: this.platform,
          store: this.platform.store,
          debounceMs: this.autoSaveDebounceMs,
          persist: (snap) => this.persistActive(snap),
        });
      }
    } catch (err) {
      if (this.disposed) return;
      console.warn('[profiles] boot failed:', err);
      this.updateState({ isLoading: false });
    }
  }

  /** Flush any pending auto-save then explicitly persist the live state. */
  async save(): Promise<void> {
    if (this.autoSave) {
      await this.autoSave.flushNow();
    } else {
      await this.persistActive(this.platform.serializeAll());
    }
  }

  /** Load a profile by id. Replaces the in-memory store + flips the
   *  active pointer. `skipFlush` skips the auto-save drain (used by
   *  `remove()` so we don't resurrect the just-deleted profile).
   *
   *  Ordering contract (critical for state isolation):
   *    1. Flush (or cancel) any pending auto-save targeting the CURRENT
   *       profile — otherwise we'd persist the about-to-be-overwritten
   *       state back to the active id AFTER the pointer flip.
   *    2. Flip the active-id pointer BEFORE mutating the platform store.
   *       resetAll() + deserializeAll() trigger subscriptions, which
   *       schedule a new auto-save tick; if the pointer is still on the
   *       old id the next persist will write the NEW state into the
   *       OLD profile's snapshot — exactly the "style bleed" the user
   *       reported.
   *    3. cancelScheduled() AGAIN after the mutations because the
   *       subscription bumps race the id flip: even with the order above
   *       we want a clean slate on the newly-active profile — the user
   *       explicitly loaded it, they don't expect a spurious save to
   *       overwrite it on the next tick.
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
    this.platform.resetAll();
    this.platform.deserializeAll(snap.state);
    // Kill the debounce scheduled by resetAll + deserializeAll. The state
    // we just loaded is already on disk — no reason to re-write it.
    this.autoSave?.cancelScheduled();
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

    // Flush the old profile's pending debounce before flipping the pointer.
    // Any edits the user made under the OLD profile are persisted there,
    // not leaked into the newly-created one.
    if (this.autoSave) await this.autoSave.flushNow();

    // Flip BEFORE mutating (see load()'s rationale).
    this.updateState({ activeId: id });
    writeActiveId(gridId, id);

    this.platform.resetAll();

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
      this.platform.resetAll();
      this.platform.deserializeAll(snap.state);
      this.autoSave?.cancelScheduled();
      this.platform.events.emit('profile:loaded', { gridId, profileId: id });
    }
    return toMeta(snap);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.autoSave?.dispose();
    this.autoSave = null;
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
