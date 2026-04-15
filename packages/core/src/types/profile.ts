export interface ProfileSnapshot {
  version: number;
  gridId: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  agGridState: unknown;
  modules: Record<string, unknown>;
}

export interface ProfileMeta {
  id: string;
  gridId: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  isDefault: boolean;
}

/**
 * A grid's complete configuration — all profiles + which one is default —
 * stored as a single document keyed by `gridId`. This makes per-grid clone /
 * export / import a single read-write rather than fanning out across rows.
 */
export interface GridConfig {
  version: number;
  gridId: string;
  defaultProfileId: string | null;
  profiles: Record<string, ProfileSnapshot>;
  updatedAt: number;
}

export const CURRENT_SCHEMA_VERSION = 1;
