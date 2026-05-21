import {
  DEFAULT_STOCKFLUX_PALETTE,
  isStockfluxPaletteName,
  type StockfluxPaletteName,
} from './tokens/stockflux';

export type HostThemeMode = 'dark' | 'light';

export interface HostAppearance {
  theme: HostThemeMode;
  palette: StockfluxPaletteName;
}

/** Active `data-theme` on `<html>` (defaults to dark). */
export function readDocumentThemeMode(): HostThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Active Stockflux palette (`data-palette` or default slate). */
export function readStockfluxPalette(): StockfluxPaletteName {
  if (typeof document === 'undefined') return DEFAULT_STOCKFLUX_PALETTE;
  const attr = document.documentElement.getAttribute('data-palette');
  if (attr && isStockfluxPaletteName(attr)) return attr;
  return DEFAULT_STOCKFLUX_PALETTE;
}

export function readHostAppearance(): HostAppearance {
  return {
    theme: readDocumentThemeMode(),
    palette: readStockfluxPalette(),
  };
}
