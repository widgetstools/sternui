/**
 * Theme helper for hosted blotters — single source of AG-Grid styling.
 *
 * Uses `buildAgGridTheme({ palette, mode, density: 'ultra' })` from the
 * design-system so Stockflux palette + dark/light follow the same
 * `data-theme` / `data-palette` contract as `useGridTheme` in
 * `@starui/grid`. OpenFin dock palette picks publish via IAB →
 * `applyTheme()` on child windows → MutationObserver here rebinds the
 * AG Grid theme.
 *
 * The mode argument has three forms:
 *   - `'light'` / `'dark'` — explicit, no DOM observation.
 *   - `'auto'` (default) — follow `[data-theme]` and `[data-palette]`
 *     on `<html>`.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Theme } from 'ag-grid-community';
import {
  readDocumentThemeMode,
  readStockfluxPalette,
  type StockfluxPaletteName,
} from '@starui/design-system';
import { buildAgGridTheme } from '@starui/design-system/adapters/ag-grid';

export type AgGridThemeMode = 'auto' | 'dark' | 'light';

function readAppearance(): { mode: 'dark' | 'light'; palette: StockfluxPaletteName } {
  return {
    mode: readDocumentThemeMode(),
    palette: readStockfluxPalette(),
  };
}

/**
 * Returns the AG-Grid `Theme` object for a hosted blotter, reactive to
 * the host's theme + palette attributes when `mode` is `'auto'`.
 */
export function useAgGridTheme(mode: AgGridThemeMode = 'auto'): Theme {
  const [appearance, setAppearance] = useState(readAppearance);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const sync = () => {
      const next = readAppearance();
      setAppearance(mode === 'auto' ? next : { palette: next.palette, mode });
    };
    sync();
    const html = document.documentElement;
    const observer = new MutationObserver(sync);
    observer.observe(html, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-palette'],
    });
    return () => observer.disconnect();
  }, [mode]);

  const resolvedMode = mode === 'auto' ? appearance.mode : mode;
  const palette = appearance.palette;

  return useMemo(
    () => buildAgGridTheme({ palette, mode: resolvedMode, density: 'ultra' }),
    [palette, resolvedMode],
  );
}
