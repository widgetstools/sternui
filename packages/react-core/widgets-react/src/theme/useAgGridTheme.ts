/**
 * useAgGridTheme — returns the same AG Grid `Theme` instances as `MarketsGrid`.
 *
 * Delegates to `useGridTheme()` from `@starui/grid`, which returns the
 * canonical `staruiGridTheme`. Light/dark chrome follows `data-ag-theme-mode`
 * on `<html>` (kept in sync with `data-theme` by `applyTheme` / runtime).
 *
 * Usage:
 *   const { theme } = useAgGridTheme();
 *   <AgGridReact theme={theme} ... />
 */

import { useGridTheme } from '@starui/grid';

export function useAgGridTheme() {
  const theme = useGridTheme();
  return { theme };
}
