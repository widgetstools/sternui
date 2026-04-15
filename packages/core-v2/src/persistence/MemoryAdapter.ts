import type { ProfileSnapshot, StorageAdapter } from './StorageAdapter';

/**
 * In-memory storage adapter. Used by unit tests and SSR. Holds profiles in a
 * `Map<"${gridId}::${profileId}", ProfileSnapshot>` so multiple grids can
 * share one adapter instance without colliding.
 *
 * Stores deep-cloned copies on save and returns deep-cloned copies on load —
 * callers can mutate the returned snapshot without poisoning the store, and
 * subsequent saves don't accidentally rewrite history through aliased refs.
 */
export class MemoryAdapter implements StorageAdapter {
  private readonly profiles = new Map<string, ProfileSnapshot>();

  async loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null> {
    const hit = this.profiles.get(key(gridId, profileId));
    return hit ? clone(hit) : null;
  }

  async saveProfile(snapshot: ProfileSnapshot): Promise<void> {
    this.profiles.set(key(snapshot.gridId, snapshot.id), clone(snapshot));
  }

  async deleteProfile(gridId: string, profileId: string): Promise<void> {
    this.profiles.delete(key(gridId, profileId));
  }

  async listProfiles(gridId: string): Promise<ProfileSnapshot[]> {
    const out: ProfileSnapshot[] = [];
    for (const p of this.profiles.values()) {
      if (p.gridId === gridId) out.push(clone(p));
    }
    return out;
  }

  /** Test helper: drop everything. */
  reset(): void {
    this.profiles.clear();
  }
}

const key = (gridId: string, profileId: string): string => `${gridId}::${profileId}`;

const clone = <T,>(v: T): T => {
  // structuredClone covers everything we'd reasonably store (plain objects,
  // arrays, strings, numbers, dates). If a module ever stores a function or
  // class instance in its serialized state, that's a module bug — caught loud
  // here rather than silently aliased.
  return globalThis.structuredClone
    ? globalThis.structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T);
};
