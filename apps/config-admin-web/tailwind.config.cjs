const marketsPreset = require('@starui/tokens-primeng/tailwind-preset');

/** @type {import('tailwindcss').Config}
 *
 * Canonical MarketsUI preset wraps shadcn semantic tokens in
 * `hsl(var(--x))`, matching the HSL-triplet form that
 * `@starui/design-system/themes/fi-*.css` exports. Same setup as
 * every other React app in the monorepo.
 *
 * Content paths include the editor-ui sources so JIT picks up class
 * names declared inside its components (drawers, dialogs, matrices)
 * even though the admin app itself doesn't textually mention them.
 */
module.exports = {
  presets: [marketsPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/react/tools/config-editor-ui/src/**/*.{ts,tsx}',
    '../../packages/react/ui/src/**/*.{ts,tsx}',
  ],
};
