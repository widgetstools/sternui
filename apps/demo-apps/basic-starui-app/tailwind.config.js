/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // Workspace packages resolve as symlinks to source (no dist/), so we
    // scan the .tsx source directly. Mirrors apps/demo-react.
    '../../../packages/react/ui/src/**/*.{ts,tsx}',
    '../../../packages/react/widgets/**/src/**/*.{ts,tsx}',
    '../../../packages/shared/core/src/**/*.{ts,tsx}',
    // Fallback for the case where these are installed from tarballs
    // (e.g. on a consumer outside the monorepo).
    './node_modules/@starui/ui/dist/**/*.{js,mjs}',
    './node_modules/@starui/markets-grid/dist/**/*.{js,mjs}',
    './node_modules/@starui/grid-react/dist/**/*.{js,mjs}',
  ],
};
