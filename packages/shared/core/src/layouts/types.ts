import type { SerializedState } from '../platform/types';

/** Condensed layout record used in UI lists. */
export interface LayoutMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isDefault: boolean;
}

/** Inner body of an exported / importable layout payload. Shape is
 *  identical across the legacy and current wire variants. */
export interface ExportedLayoutBody {
  name: string;
  gridId: string;
  state: Record<string, SerializedState>;
}

/**
 * Current portable JSON payload produced by `LayoutManager.export()`.
 *
 * `kind: 'gc-layout'` and `layout: {...}` are the post-rename canonical
 * wire values. `.import()` also accepts the pre-rename
 * {@link LegacyExportedLayoutPayload} shape (`kind: 'gc-profile'` +
 * `profile: {...}`) so previously-exported files keep working.
 */
export interface ExportedLayoutPayload {
  schemaVersion: 1;
  kind: 'gc-layout';
  exportedAt: string;
  layout: ExportedLayoutBody;
}

/** Pre-rename wire shape — accepted by `.import()` for back-compat
 *  with payloads exported before the Profile → Layout rename. New
 *  code never produces this shape. */
export interface LegacyExportedLayoutPayload {
  schemaVersion: 1;
  kind: 'gc-profile';
  exportedAt: string;
  profile: ExportedLayoutBody;
}

/** Either-or — accepted by `LayoutManager.import()`. */
export type ImportableLayoutPayload =
  | ExportedLayoutPayload
  | LegacyExportedLayoutPayload;
