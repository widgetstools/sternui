/**
 * Back-compat re-export — canonical star themes live in `@starui/markets-grid`.
 * MarketsGrid now resolves the theme internally via `[data-theme]`; apps
 * should drop the `theme` prop unless they truly need a custom override.
 */
export { starDarkTheme, starLightTheme } from '@starui/markets-grid';
