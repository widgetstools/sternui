/**
 * useGridTheme — resolves the canonical AG Grid theme by reading
 * `[data-theme]` on `<html>` (dark by default). Reactive to runtime
 * theme switches via MutationObserver. Provider-agnostic: works with
 * next-themes, OpenFin IAB, or the reference app's local ThemeContext
 * — they all converge on the host attribute.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Theme } from 'ag-grid-community';
import { buildAgGridTheme } from '@starui/design-system/adapters/ag-grid';
import {
  readDocumentThemeMode,
  readStarUIPalette,
} from '@starui/design-system';

export function useGridTheme(): Theme {
  const [mode, setMode] = useState(readDocumentThemeMode);
  const [palette, setPalette] = useState(readStarUIPalette);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      setMode(readDocumentThemeMode());
      setPalette(readStarUIPalette());
    };
    sync();
    const html = document.documentElement;
    const observer = new MutationObserver(sync);
    observer.observe(html, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-palette'],
    });
    return () => observer.disconnect();
  }, []);

  return useMemo(
    () => buildAgGridTheme({ palette, mode, density: 'compact' }),
    [palette, mode],
  );
}
