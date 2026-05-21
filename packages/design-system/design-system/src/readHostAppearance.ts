import {
  DEFAULT_STARUI_PALETTE,
  isStarUIPaletteName,
  type StarUIPaletteName,
} from './tokens/starui';

export type HostThemeMode = 'dark' | 'light';

export interface HostAppearance {
  theme: HostThemeMode;
  palette: StarUIPaletteName;
}

/** Active `data-theme` on `<html>` (defaults to dark). */
export function readDocumentThemeMode(): HostThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Active StarUI palette (`data-palette` or default slate). */
export function readStarUIPalette(): StarUIPaletteName {
  if (typeof document === 'undefined') return DEFAULT_STARUI_PALETTE;
  const attr = document.documentElement.getAttribute('data-palette');
  if (attr && isStarUIPaletteName(attr)) return attr;
  return DEFAULT_STARUI_PALETTE;
}

export function readHostAppearance(): HostAppearance {
  return {
    theme: readDocumentThemeMode(),
    palette: readStarUIPalette(),
  };
}

/** @deprecated Use `readStarUIPalette` */
export const readStockfluxPalette = readStarUIPalette;
