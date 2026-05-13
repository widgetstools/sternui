/**
 * useAgGridTheme — returns the same AG Grid `Theme` instances as `MarketsGrid`.
 *
 * Delegates to `useGridTheme()` from `@starui/markets-grid`, which reads
 * `[data-theme]` on `<html>` (MutationObserver) so the grid tracks the host
 * shell — not `next-themes`' resolved class on `<body>`, which can disagree
 * with `data-theme` in embedded / docked surfaces.
 *
 * Usage:
 *   const { theme } = useAgGridTheme();
 *   <AgGridReact theme={theme} ... />
 */

import { useGridTheme } from '@starui/markets-grid';

export function useAgGridTheme() {
  const theme = useGridTheme();
  return { theme };
}
