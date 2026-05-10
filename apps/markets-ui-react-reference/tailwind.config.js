/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,html}',
    '../../packages/react/dock-editor-react/src/**/*.{ts,tsx}',
    '../../packages/react/registry-editor-react/src/**/*.{ts,tsx}',
    '../../packages/react/tools/workspace-setup-react/src/**/*.{ts,tsx}',
    // Scan EVERY widgets package — markets-grid, grid-react,
    // widgets-react. Without grid-react in the glob, JIT tree-shakes
    // any class that ONLY appears in grid-react files (RuleMetaStrip's
    // `grid-cols-4 gap-x-5 border-b border-border bg-card`, every
    // module-panel editor, the SettingsPanel atoms). Result: the Grid
    // Customizer dialog meta-strip stacks vertically instead of into
    // a 4-column row, every editor's layout collapses. demo-react's
    // broader `widgets/**/src` glob caught these; this app missed them.
    '../../packages/react/widgets/**/src/**/*.{ts,tsx}',
    '../../packages/shared/core/src/**/*.{ts,tsx}',
    // ui ships shadcn primitives. Most consumers re-use the same class
    // names in their own files (so JIT picks them up indirectly), but
    // adding the package keeps less-common variants reachable too.
    '../../packages/react/ui/src/**/*.{ts,tsx}',
  ],
};
