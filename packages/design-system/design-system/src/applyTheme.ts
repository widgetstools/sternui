// ─────────────────────────────────────────────────────────────
//  applyTheme — flip <html data-theme>, data-palette, data-cvd
// ─────────────────────────────────────────────────────────────

import { PALETTE_STORAGE_KEY, THEME_STORAGE_KEY } from '@starui/shared-types';
import {
  DEFAULT_STARUI_PALETTE,
  isStarUIPaletteName,
  type StarUIPaletteName,
} from './tokens/starui';

export type Mode = 'dark' | 'light';

export { PALETTE_STORAGE_KEY } from '@starui/shared-types';

export interface ThemeOptions {
  theme: Mode;
  palette?: StarUIPaletteName;
  cvd?: boolean;
}

const CVD_KEY = 'starui:cvd';
const LEGACY_KEY = '@starui/theme';
const LEGACY_THEME_KEY = 'starui:theme';

function applyPaletteAttribute(palette: StarUIPaletteName): void {
  if (typeof document === 'undefined') return;
  if (palette === DEFAULT_STARUI_PALETTE) {
    document.documentElement.removeAttribute('data-palette');
  } else {
    document.documentElement.setAttribute('data-palette', palette);
  }
}

export function applyTheme(opts: ThemeOptions): void {
  if (typeof document === 'undefined') return;
  const palette = opts.palette ?? DEFAULT_STARUI_PALETTE;

  document.documentElement.setAttribute('data-theme', opts.theme);
  applyPaletteAttribute(palette);

  if (opts.cvd) {
    document.documentElement.setAttribute('data-cvd', 'on');
  } else {
    document.documentElement.removeAttribute('data-cvd');
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, opts.theme);
      localStorage.setItem(PALETTE_STORAGE_KEY, palette);
      if (opts.cvd) {
        localStorage.setItem(CVD_KEY, 'on');
      } else {
        localStorage.removeItem(CVD_KEY);
      }
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* private mode / quota */ }
  }
}

export function getTheme(): ThemeOptions {
  if (typeof localStorage === 'undefined') {
    return { theme: 'dark', palette: DEFAULT_STARUI_PALETTE };
  }
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_THEME_KEY);
    const paletteRaw = localStorage.getItem(PALETTE_STORAGE_KEY);
    const palette = paletteRaw && isStarUIPaletteName(paletteRaw)
      ? paletteRaw
      : DEFAULT_STARUI_PALETTE;
    const cvd = localStorage.getItem(CVD_KEY) === 'on';

    if (theme === 'dark' || theme === 'light') {
      const base: ThemeOptions = { theme, palette };
      return cvd ? { ...base, cvd: true } : base;
    }

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<ThemeOptions & { palette?: string }>;
      if (parsed.theme === 'dark' || parsed.theme === 'light') {
        const legacyPalette = parsed.palette && isStarUIPaletteName(parsed.palette)
          ? parsed.palette
          : DEFAULT_STARUI_PALETTE;
        const base: ThemeOptions = { theme: parsed.theme, palette: legacyPalette };
        return parsed.cvd ? { ...base, cvd: true } : base;
      }
    }
    return { theme: 'dark', palette: DEFAULT_STARUI_PALETTE };
  } catch {
    return { theme: 'dark', palette: DEFAULT_STARUI_PALETTE };
  }
}
