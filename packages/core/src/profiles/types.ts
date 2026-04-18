import type { SerializedState } from '../platform/types';

/** Condensed profile record used in UI lists. */
export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isDefault: boolean;
}

/**
 * Portable JSON payload produced by `ProfileManager.export()` and accepted
 * by `.import()`. Shape-locked by `schemaVersion` — bump on breaking
 * changes + keep the old version loadable for one release.
 */
export interface ExportedProfilePayload {
  schemaVersion: 1;
  kind: 'gc-profile';
  exportedAt: string;
  profile: {
    name: string;
    gridId: string;
    state: Record<string, SerializedState>;
  };
}
