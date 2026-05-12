export { GridProvider, useGridPlatform } from './GridProvider';
export { useModuleState } from './useModuleState';
export { useGridApi, useGridEvent } from './useGridApi';
export { type GridCoreLike } from './GridContext';
export { useLayoutManager } from './useLayoutManager';
export type { UseLayoutManagerResult } from './useLayoutManager';

// ─── v4 clean hooks (panels in Phase 3 migrate to these) ────────────
export { useDirty, useDirtyCount, type DirtyHandle } from './useDirty';
export { useGridColumns, type GridColumnInfo } from './useGridColumns';
export {
  useModuleDraft,
  type UseModuleDraftOptions,
  type UseModuleDraftResult,
} from './useModuleDraft';
export { useUndoRedo, type UseUndoRedoResult } from './useUndoRedo';
