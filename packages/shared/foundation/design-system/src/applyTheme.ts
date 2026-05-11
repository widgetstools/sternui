// ─────────────────────────────────────────────────────────────
//  applyTheme — flip <html data-theme> and <html data-cvd> to
//  match the user's preference and persist to localStorage.
//
//  Apps call applyTheme() once at boot (and whenever the user
//  toggles). The CSS in @starui/design-system/css does the rest.
// ─────────────────────────────────────────────────────────────

export type Mode = 'dark' | 'light';

export interface ThemeOptions {
  theme: Mode;
  cvd?: boolean;
}

const STORAGE_KEY = '@starui/theme';

export function applyTheme(opts: ThemeOptions): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', opts.theme);
  if (opts.cvd) {
    document.documentElement.setAttribute('data-cvd', 'on');
  } else {
    document.documentElement.removeAttribute('data-cvd');
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
    } catch { /* private mode / quota */ }
  }
}

export function getTheme(): ThemeOptions {
  if (typeof localStorage === 'undefined') return { theme: 'dark' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { theme: 'dark' };
    const parsed = JSON.parse(raw) as Partial<ThemeOptions>;
    if (parsed.theme !== 'dark' && parsed.theme !== 'light') return { theme: 'dark' };
    return { theme: parsed.theme, ...('cvd' in parsed ? { cvd: parsed.cvd } : {}) };
  } catch {
    return { theme: 'dark' };
  }
}
