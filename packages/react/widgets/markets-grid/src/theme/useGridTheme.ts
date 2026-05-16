/**
 * useGridTheme — resolves the canonical AG Grid theme by reading
 * `[data-theme]` on `<html>` (dark by default). Reactive to runtime
 * theme switches via MutationObserver. Provider-agnostic: works with
 * next-themes, OpenFin IAB, or the reference app's local ThemeContext
 * — they all converge on the host attribute.
 */

import { useEffect, useState } from 'react';
import type { Theme } from 'ag-grid-community';
import {
  agGridDarkTheme,
  agGridLightTheme,
} from '@starui/design-system/adapters/ag-grid';

function readDocumentTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function useGridTheme(): Theme {
  const [mode, setMode] = useState<'dark' | 'light'>(readDocumentTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setMode(readDocumentTheme());
    const html = document.documentElement;
    const observer = new MutationObserver(() => setMode(readDocumentTheme()));
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return mode === 'light' ? agGridLightTheme : agGridDarkTheme;
}
