import type { SerializedState } from '../platform/types';
import {
  RESERVED_DEFAULT_PROFILE_ID,
  activeProfileKey,
  type ProfileSnapshot,
  type StorageAdapter,
} from './StorageAdapter';

const BUNDLE_KIND = 'markets-grid-bundle' as const;
const BUNDLE_VERSION = 1 as const;

/** localStorage key prefix — scoped by grid id to avoid collisions. */
export function marketsGridLocalStorageBundleKey(gridId: string): string {
  return `markets-grid-bundle:${gridId}`;
}

/**
 * Serializable MarketsGrid bundle: every profile row, the active profile
 * pointer, and optional grid-level data — one JSON document per grid.
 */
export interface MarketsGridLocalStorageConfig {
  gridId: string;
  activeProfileId: string;
  profiles: ProfileSnapshot[];
  gridLevelData?: unknown | null;
}

interface BundleV1 {
  kind: typeof BUNDLE_KIND;
  version: typeof BUNDLE_VERSION;
  gridId: string;
  activeProfileId: string;
  profiles: ProfileSnapshot[];
  gridLevelData: unknown | null;
}

function cloneConfig(bundle: BundleV1, activeProfileId: string): MarketsGridLocalStorageConfig {
  return {
    gridId: bundle.gridId,
    activeProfileId,
    profiles: JSON.parse(JSON.stringify(bundle.profiles)) as ProfileSnapshot[],
    gridLevelData: bundle.gridLevelData ?? null,
  };
}

function readActivePointer(gridId: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(activeProfileKey(gridId));
  } catch {
    return null;
  }
}

/**
 * Persists the full profile set + grid-level data for one grid in a single
 * localStorage JSON value, and keeps `gc-active-profile:${gridId}` in sync
 * with {@link BundleV1.activeProfileId}.
 *
 * Intended for hosts that do not use ConfigService — pass via
 * `<MarketsGrid storage={createMarketsGridLocalStorageStorage()} />`
 * (MarketsGrid wrapper) rather than wiring this adapter directly.
 */
export class LocalStorageBundleAdapter implements StorageAdapter {
  private readonly bundleKey: string;

  constructor(private readonly gridId: string) {
    this.bundleKey = marketsGridLocalStorageBundleKey(gridId);
  }

  readConfig(): MarketsGridLocalStorageConfig {
    const bundle = this.getOrCreateBundle();
    const pointer = readActivePointer(this.gridId);
    const activeProfileId =
      pointer && bundle.profiles.some((p) => p.id === pointer)
        ? pointer
        : bundle.activeProfileId;
    return cloneConfig({ ...bundle, activeProfileId }, activeProfileId);
  }

  /**
   * Replaces the on-disk bundle and active pointer, then callers should
   * re-hydrate the grid (e.g. `profiles.loadProfile(activeProfileId)`).
   */
  async applySerializedConfig(input: MarketsGridLocalStorageConfig): Promise<void> {
    if (input.gridId && input.gridId !== this.gridId) {
      throw new Error(
        `[LocalStorageBundleAdapter] gridId mismatch — adapter is scoped to "${this.gridId}" but config has "${input.gridId}".`,
      );
    }
    if (!Array.isArray(input.profiles) || input.profiles.length === 0) {
      throw new Error('[LocalStorageBundleAdapter] `profiles` must be a non-empty array.');
    }
    let profiles = input.profiles.map((p) => this.normalizeSnapshot(p));
    if (!profiles.some((p) => p.id === RESERVED_DEFAULT_PROFILE_ID)) {
      const now = Date.now();
      profiles = [
        {
          id: RESERVED_DEFAULT_PROFILE_ID,
          gridId: this.gridId,
          name: 'Default',
          state: {},
          createdAt: now,
          updatedAt: now,
        },
        ...profiles,
      ];
    }
    let activeProfileId = input.activeProfileId;
    if (!profiles.some((p) => p.id === activeProfileId)) {
      activeProfileId = RESERVED_DEFAULT_PROFILE_ID;
    }
    const bundle: BundleV1 = {
      kind: BUNDLE_KIND,
      version: BUNDLE_VERSION,
      gridId: this.gridId,
      activeProfileId,
      profiles,
      gridLevelData: input.gridLevelData ?? null,
    };
    this.writeBundle(bundle);
  }

  async loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null> {
    if (gridId !== this.gridId) return null;
    const bundle = this.getOrCreateBundle();
    return bundle.profiles.find((p) => p.id === profileId) ?? null;
  }

  async saveProfile(snapshot: ProfileSnapshot): Promise<void> {
    const bundle = this.getOrCreateBundle();
    const row = this.normalizeSnapshot(snapshot);
    const idx = bundle.profiles.findIndex((p) => p.id === row.id);
    if (idx >= 0) bundle.profiles[idx] = row;
    else bundle.profiles.push(row);
    const pointer = readActivePointer(this.gridId);
    if (pointer && bundle.profiles.some((p) => p.id === pointer)) {
      bundle.activeProfileId = pointer;
    }
    this.writeBundle(bundle);
  }

  async deleteProfile(gridId: string, profileId: string): Promise<void> {
    if (gridId !== this.gridId) return;
    if (profileId === RESERVED_DEFAULT_PROFILE_ID) return;
    const bundle = this.getOrCreateBundle();
    bundle.profiles = bundle.profiles.filter((p) => p.id !== profileId);
    const pointer = readActivePointer(this.gridId);
    if (pointer && bundle.profiles.some((p) => p.id === pointer)) {
      bundle.activeProfileId = pointer;
    } else if (!bundle.profiles.some((p) => p.id === bundle.activeProfileId)) {
      bundle.activeProfileId = RESERVED_DEFAULT_PROFILE_ID;
    }
    this.writeBundle(bundle);
  }

  async listProfiles(gridId: string): Promise<ProfileSnapshot[]> {
    if (gridId !== this.gridId) return [];
    const bundle = this.getOrCreateBundle();
    return [...bundle.profiles];
  }

  async loadGridLevelData(gridId: string): Promise<unknown | null> {
    if (gridId !== this.gridId) return null;
    const bundle = this.getOrCreateBundle();
    return bundle.gridLevelData ?? null;
  }

  async saveGridLevelData(gridId: string, data: unknown): Promise<void> {
    if (gridId !== this.gridId) return;
    const bundle = this.getOrCreateBundle();
    bundle.gridLevelData = data;
    const pointer = readActivePointer(this.gridId);
    if (pointer && bundle.profiles.some((p) => p.id === pointer)) {
      bundle.activeProfileId = pointer;
    }
    this.writeBundle(bundle);
  }

  private normalizeSnapshot(raw: ProfileSnapshot): ProfileSnapshot {
    const state =
      raw.state && typeof raw.state === 'object' && !Array.isArray(raw.state)
        ? (raw.state as Record<string, SerializedState>)
        : {};
    return {
      id: String(raw.id),
      gridId: this.gridId,
      name: String(raw.name ?? raw.id),
      state,
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
    };
  }

  private writeBundle(bundle: BundleV1): void {
    const normalized: BundleV1 = {
      ...bundle,
      gridId: this.gridId,
      profiles: bundle.profiles.map((p) => this.normalizeSnapshot(p)),
      activeProfileId: bundle.activeProfileId,
    };
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.bundleKey, JSON.stringify(normalized));
    } catch {
      /* quota / private mode */
    }
    try {
      localStorage.setItem(activeProfileKey(this.gridId), normalized.activeProfileId);
    } catch {
      /* ignore */
    }
  }

  private getOrCreateBundle(): BundleV1 {
    const parsed = this.readBundleRaw();
    if (parsed) return parsed;
    let activeProfileId = RESERVED_DEFAULT_PROFILE_ID;
    const pointer = readActivePointer(this.gridId);
    if (pointer) activeProfileId = pointer;
    return {
      kind: BUNDLE_KIND,
      version: BUNDLE_VERSION,
      gridId: this.gridId,
      activeProfileId,
      profiles: [],
      gridLevelData: null,
    };
  }

  private readBundleRaw(): BundleV1 | null {
    if (typeof localStorage === 'undefined') return null;
    let raw: string | null;
    try {
      raw = localStorage.getItem(this.bundleKey);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return this.parseBundle(parsed);
    } catch {
      return null;
    }
  }

  private parseBundle(parsed: unknown): BundleV1 | null {
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    if (o.kind !== BUNDLE_KIND) return null;
    if (o.version !== BUNDLE_VERSION) return null;
    if (typeof o.gridId !== 'string' || o.gridId !== this.gridId) return null;
    if (typeof o.activeProfileId !== 'string') return null;
    if (!Array.isArray(o.profiles)) return null;
    const profiles: ProfileSnapshot[] = [];
    for (const row of o.profiles) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (typeof r.id !== 'string') continue;
      profiles.push(
        this.normalizeSnapshot({
          id: r.id,
          gridId: typeof r.gridId === 'string' ? r.gridId : this.gridId,
          name: typeof r.name === 'string' ? r.name : r.id,
          state: (r.state as Record<string, SerializedState>) ?? {},
          createdAt: Number(r.createdAt),
          updatedAt: Number(r.updatedAt),
        }),
      );
    }
    return {
      kind: BUNDLE_KIND,
      version: BUNDLE_VERSION,
      gridId: this.gridId,
      activeProfileId: o.activeProfileId,
      profiles,
      gridLevelData: 'gridLevelData' in o ? o.gridLevelData : null,
    };
  }
}
