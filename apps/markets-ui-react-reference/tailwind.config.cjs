const marketsPreset = require("@marketsui/tokens-primeng/tailwind-preset");

/** @type {import('tailwindcss').Config}
 *
 * Uses the canonical `@marketsui/tokens-primeng` preset which wraps
 * shadcn semantic tokens (`--background`, `--card`, etc.) in
 * `hsl(var(--x))` — matches the HSL-triplet form those tokens take
 * in `packages/design-system/src/themes/fi-*.css`.
 *
 * Consumer packages (`@marketsui/markets-grid`, `@marketsui/core`)
 * don't read those tokens raw — they use the `--bn-*` / `--fi-*`
 * final-colour tokens from the same design-system files for inline
 * styles. That separation is why no app-local token shim is needed
 * here (or anywhere else in the monorepo).
 */
module.exports = {
  presets: [marketsPreset],
  content: [
    "./src/**/*.{ts,tsx,html}",
    "../../packages/dock-editor-react/src/**/*.{ts,tsx}",
    "../../packages/registry-editor-react/src/**/*.{ts,tsx}",
    "../../packages/markets-grid/src/**/*.{ts,tsx}",
    "../../packages/core/src/**/*.{ts,tsx}",
  ],
};
