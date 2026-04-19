export { GridProvider, useGridPlatform } from './GridProvider';
export { useModuleState } from './useModuleState';
export { useGridApi, useGridEvent } from './useGridApi';
export { useGridStore, useGridCore, type GridCoreLike } from './GridContext';
export { useProfileManager } from './useProfileManager';
export type { UseProfileManagerResult } from './useProfileManager';

// ─── v4 clean hooks (panels in Phase 3 migrate to these) ────────────
export { useDirty, type DirtyHandle } from './useDirty';
export { useGridColumns, type GridColumnInfo } from './useGridColumns';
export {
  useModuleDraft,
  type UseModuleDraftOptions,
  type UseModuleDraftResult,
} from './useModuleDraft';
