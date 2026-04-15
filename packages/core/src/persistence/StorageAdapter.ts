import type { ProfileSnapshot, ProfileMeta, GridConfig } from '../types/profile';

/**
 * Storage backend for grid configurations. Each implementation persists
 * GridConfig documents keyed by `gridId` — every profile lives inside its
 * grid's config blob, so clone/export/import become atomic per-grid ops.
 */
export interface StorageAdapter {
  // ─── Per-profile operations (now scoped to a grid) ──────────────────────
  saveProfile(gridId: string, profileId: string, snapshot: ProfileSnapshot): Promise<void>;
  loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null>;
  deleteProfile(gridId: string, profileId: string): Promise<void>;
  listProfiles(gridId: string): Promise<ProfileMeta[]>;

  // ─── Per-grid metadata ──────────────────────────────────────────────────
  getDefault(gridId: string): Promise<string | null>;
  setDefault(gridId: string, profileId: string | null): Promise<void>;

  // ─── Per-profile JSON (kept for single-profile share/import) ────────────
  exportProfile(gridId: string, profileId: string): Promise<string>;
  importProfile(gridId: string, json: string): Promise<string>;

  // ─── Whole-grid operations — the win of putting profiles inside grid ────
  loadGridConfig(gridId: string): Promise<GridConfig | null>;
  saveGridConfig(config: GridConfig): Promise<void>;
  deleteGridConfig(gridId: string): Promise<void>;
  exportGridConfig(gridId: string): Promise<string>;
  /** Imports a grid config JSON. Pass `asGridId` to clone it under a new id. */
  importGridConfig(json: string, asGridId?: string): Promise<string>;
  /** Copies srcGridId's entire config to destGridId (overwrites destGridId). */
  cloneGridConfig(srcGridId: string, destGridId: string): Promise<void>;
}
