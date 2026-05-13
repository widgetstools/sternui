/**
 * `@starui/app-shell-react` — declarative root for React apps consuming
 * the platform's seams.
 *
 * Pairs with `@starui/host-wrapper-react`. Use `<AppShell>` at the
 * createRoot tree's top level; use `useHost()` from `host-wrapper-react`
 * inside components that need runtime / configManager / theme.
 */

export { AppShell, type AppShellProps } from './AppShell.js';
