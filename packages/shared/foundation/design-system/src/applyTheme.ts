// ─────────────────────────────────────────────────────────────
//  applyTheme — flip <html data-theme> and <html data-cvd> to
//  match the user's preference and persist to localStorage.
//
//  Apps call applyTheme(getTheme()) once at module scope before
//  ReactDOM.createRoot(...).render(...). This sets the right
//  attribute on <html> BEFORE first paint so there's no FOUC.
//
//  Storage keys (post-theme-reducer):
//    `starui:theme` — the canonical theme storage key shared with
//      `@starui/runtime-port`'s THEME_STORAGE_KEY constant. Stored
//      as the bare string `'dark'` | `'light'`. The runtime port
//      reads and writes this key on every cross-window broadcast,
//      so the design-system MUST use the same key — otherwise
//      `applyTheme()` on boot and `runtime.setTheme()` at runtime
//      would write divergent values and the next boot would pick
//      whichever ran last.
//    `starui:cvd` — colour-vision-deficiency toggle. Separate key
//      so the theme reducer can store a plain string in
//      `starui:theme` (rather than parse JSON). Stored as the
//      string `'on'` or absent (default off).
//
//  Backwards compatibility: the legacy `@starui/theme` JSON blob
//  is read on first boot if the canonical keys are absent, then
//  rewritten to the new shape. After the first migration, future
//  reads only hit the new keys.
// ─────────────────────────────────────────────────────────────

export type Mode = 'dark' | 'light';

export interface ThemeOptions {
  theme: Mode;
  cvd?: boolean;
}

/** Canonical theme key — kept in sync with `@starui/runtime-port`'s
 *  `THEME_STORAGE_KEY` (the foundation layer can't import from the
 *  runtime layer; the constant is mirrored here). */
const THEME_KEY = 'starui:theme';
const CVD_KEY = 'starui:cvd';
const LEGACY_KEY = '@starui/theme';

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
      localStorage.setItem(THEME_KEY, opts.theme);
      if (opts.cvd) {
        localStorage.setItem(CVD_KEY, 'on');
      } else {
        localStorage.removeItem(CVD_KEY);
      }
      // Clear the legacy key once the new ones are populated — keeps
      // a future getTheme() from re-reading stale JSON if the new keys
      // are ever cleared.
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* private mode / quota */ }
  }
}

export function getTheme(): ThemeOptions {
  if (typeof localStorage === 'undefined') return { theme: 'dark' };
  try {
    const theme = localStorage.getItem(THEME_KEY);
    const cvd = localStorage.getItem(CVD_KEY) === 'on';
    if (theme === 'dark' || theme === 'light') {
      return cvd ? { theme, cvd: true } : { theme };
    }
    // Legacy migration — old `@starui/theme` JSON blob. Read once,
    // then `applyTheme()` will rewrite to the new keys on next call.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<ThemeOptions>;
      if (parsed.theme === 'dark' || parsed.theme === 'light') {
        return parsed.cvd ? { theme: parsed.theme, cvd: true } : { theme: parsed.theme };
      }
    }
    return { theme: 'dark' };
  } catch {
    return { theme: 'dark' };
  }
}
