/**
 * Helpers for the theme-keyed `ThemedCellStyleOverrides` shape. Reducers
 * patch the active slot; transforms resolve the active slot. Migration
 * lifts legacy flat `CellStyleOverrides` into the new shape so saved
 * profiles continue to render unchanged.
 */
import type {
  CellStyleOverrides,
  GridThemeMode,
  ThemedCellStyleOverrides,
} from './types';

/**
 * Returns the active theme by reading `[data-theme]` on `<html>`. Used
 * by reducers / transforms / editor components to pick the right slot
 * inside a `ThemedCellStyleOverrides`. Falls back to `'dark'` in non-
 * browser contexts (SSR, vitest jsdom-less suites).
 */
export function getActiveTheme(): GridThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Return the variant for `theme`, or undefined if no styling is set. */
export function resolveActiveStyle(
  themed: ThemedCellStyleOverrides | undefined,
  theme: GridThemeMode,
): CellStyleOverrides | undefined {
  return themed?.[theme];
}

/**
 * Write `next` into the slot for `theme`. Pass `undefined` for `next`
 * to clear just that theme's slot. Returns `undefined` when both slots
 * end up empty so callers can drop the whole field from an assignment.
 */
export function patchActiveStyle(
  themed: ThemedCellStyleOverrides | undefined,
  theme: GridThemeMode,
  next: CellStyleOverrides | undefined,
): ThemedCellStyleOverrides | undefined {
  const base: ThemedCellStyleOverrides = { ...(themed ?? {}) };
  if (next === undefined) {
    delete base[theme];
  } else {
    base[theme] = next;
  }
  return base.dark === undefined && base.light === undefined ? undefined : base;
}

/**
 * Detect legacy flat `CellStyleOverrides` (the pre-theming shape) and
 * lift to `{ dark, light }` with the same value in both slots. Already-
 * themed values pass through. `undefined` stays `undefined`.
 *
 * The legacy shape's known keys (`typography`, `colors`, `alignment`,
 * `borders`) are disjoint from the themed shape's keys (`dark`, `light`),
 * so the discriminator is unambiguous.
 */
export function migrateThemedStyle(
  value: CellStyleOverrides | ThemedCellStyleOverrides | undefined,
): ThemedCellStyleOverrides | undefined {
  if (!value) return undefined;
  if ('dark' in value || 'light' in value) {
    return value as ThemedCellStyleOverrides;
  }
  const flat = value as CellStyleOverrides;
  return { dark: flat, light: flat };
}

/**
 * Merge two themed overrides slot-by-slot using the supplied per-slot
 * merge function. Used by `resolveTemplates` so a base template's dark
 * slot composes with a higher-precedence template's dark slot, and
 * similarly for light, without one ever leaking across.
 */
export function mergeThemedStyle(
  base: ThemedCellStyleOverrides | undefined,
  top: ThemedCellStyleOverrides | undefined,
  mergeOne: (
    a: CellStyleOverrides | undefined,
    b: CellStyleOverrides | undefined,
  ) => CellStyleOverrides | undefined,
): ThemedCellStyleOverrides | undefined {
  if (!base && !top) return undefined;
  const dark = mergeOne(base?.dark, top?.dark);
  const light = mergeOne(base?.light, top?.light);
  if (dark === undefined && light === undefined) return undefined;
  const out: ThemedCellStyleOverrides = {};
  if (dark !== undefined) out.dark = dark;
  if (light !== undefined) out.light = light;
  return out;
}
