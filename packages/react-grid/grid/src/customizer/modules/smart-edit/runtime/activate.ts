import type { GridApi } from 'ag-grid-community';
import type { PlatformHandle } from '@starui/engine';
import {
  SMART_EDIT_MODULE_ID,
  type SmartEditState,
} from '@starui/engine';
import { applyEdits, resolveTargetCells } from './applyEdits.js';

function isEditingCell(api: GridApi): boolean {
  try {
    return (api.getEditingCells?.() ?? []).length > 0;
  } catch {
    return false;
  }
}

export function activateSmartEdit(platform: PlatformHandle<SmartEditState>): () => void {
  let detachKey: (() => void) | null = null;

  const readyOff = platform.api.onReady((api) => {
    const onCellKeyDown = async (e: { event?: Event | null }) => {
      const state = platform.getState();
      if (!state.settings.enabled) return;

      const ke = e.event as KeyboardEvent | undefined;
      if (!ke) return;
      if (ke.key !== '+' && ke.key !== '=' && ke.key !== '-') return;
      if (isEditingCell(api)) return;

      ke.preventDefault();

      const cells = resolveTargetCells(api);
      if (cells.length === 0) return;

      const step = state.settings.incrementStep;
      const op = ke.key === '-' ? 'subtract' : 'add';
      await applyEdits(api, cells, op, step);
    };

    api.addEventListener('cellKeyDown', onCellKeyDown);
    detachKey = () => {
      try {
        api.removeEventListener('cellKeyDown', onCellKeyDown);
      } catch { /* api teardown */ }
    };
  });

  return () => {
    readyOff();
    detachKey?.();
  };
}

export { SMART_EDIT_MODULE_ID };
