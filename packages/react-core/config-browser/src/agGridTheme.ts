/**
 * @deprecated Prefer `useGridTheme()` from `@starui/grid` — palette-aware and
 * reactive to `[data-theme]` / `[data-palette]`. Kept for callers that need a
 * one-shot theme outside React; new code should not import this module.
 */
import type { Theme } from "ag-grid-community";
import { buildAgGridTheme } from "@starui/design-system/adapters/ag-grid";
import {
  readDocumentThemeMode,
  readStarUIPalette,
} from "@starui/design-system";

export function agGridThemeFor(theme: "dark" | "light"): Theme {
  return buildAgGridTheme({
    palette: readStarUIPalette(),
    mode: theme,
    density: "compact",
  });
}

/**
 * Snapshot of the host document appearance (palette + mode). Use inside
 * `useMemo` when you cannot call `useGridTheme()` (non-React bootstrap).
 */
export function agGridThemeForDocument(): Theme {
  return buildAgGridTheme({
    palette: readStarUIPalette(),
    mode: readDocumentThemeMode(),
    density: "compact",
  });
}
