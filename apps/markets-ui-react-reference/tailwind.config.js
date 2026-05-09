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
    '../../packages/react/widgets/markets-grid/src/**/*.{ts,tsx}',
    '../../packages/shared/core/src/**/*.{ts,tsx}',
    // widgets-react ships the DataProvider editor, configurator, and
    // DataProviderSelector. Without scanning it, JIT purges every
    // class name unique to those components — dialogs render with no
    // background, gradient utilities disappear, etc.
    '../../packages/react/widgets/widgets-react/src/**/*.{ts,tsx}',
    // ui ships shadcn primitives. Most consumers re-use the same class
    // names in their own files (so JIT picks them up indirectly), but
    // adding the package keeps less-common variants reachable too.
    '../../packages/react/ui/src/**/*.{ts,tsx}',
  ],
};
