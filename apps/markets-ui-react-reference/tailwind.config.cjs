const marketsPreset = require("@starui/tokens-primeng/tailwind-preset");

/** @type {import('tailwindcss').Config}
 *
 * Uses the canonical `@starui/tokens-primeng` preset which wraps
 * shadcn semantic tokens (`--background`, `--card`, etc.) in
 * `hsl(var(--x))` — matches the HSL-triplet form those tokens take
 * in `packages/shared/design-system/src/themes/fi-*.css`.
 *
 * Consumer packages (`@starui/markets-grid`, `@starui/core`)
 * don't read those tokens raw — they use the `--bn-*` / `--fi-*`
 * final-colour tokens from the same design-system files for inline
 * styles. That separation is why no app-local token shim is needed
 * here (or anywhere else in the monorepo).
 */
module.exports = {
  presets: [marketsPreset],
  content: [
    "./src/**/*.{ts,tsx,html}",
    "../../packages/react/dock-editor-react/src/**/*.{ts,tsx}",
    "../../packages/react/registry-editor-react/src/**/*.{ts,tsx}",
    "../../packages/react/tools/workspace-setup-react/src/**/*.{ts,tsx}",
    "../../packages/react/markets-grid/src/**/*.{ts,tsx}",
    "../../packages/shared/core/src/**/*.{ts,tsx}",
    // widgets-react ships the DataProvider editor, configurator, and
    // DataProviderSelector. Without scanning it, JIT purges every
    // class name unique to those components — dialogs render with no
    // background, gradient utilities disappear, etc. Symptom: clicking
    // "Create New Dataprovider" dims the page but no dialog card shows.
    "../../packages/react/widgets-react/src/**/*.{ts,tsx}",
    // ui ships shadcn primitives. Most consumers re-use the same class
    // names in their own files (so JIT picks them up indirectly), but
    // adding the package keeps less-common variants reachable too.
    "../../packages/react/ui/src/**/*.{ts,tsx}",
  ],
};
