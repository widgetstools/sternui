/**
 * Back-compat re-export — canonical stern themes live in `@starui/markets-grid`.
 * MarketsGrid now resolves the theme internally via `[data-theme]`; apps
 * should drop the `theme` prop unless they truly need a custom override.
 */
export { sternDarkTheme, sternLightTheme } from '@starui/markets-grid';
