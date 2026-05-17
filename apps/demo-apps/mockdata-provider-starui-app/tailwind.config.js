/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../../packages/react/ui/src/**/*.{ts,tsx}',
    '../../../packages/react/widgets/**/src/**/*.{ts,tsx}',
    '../../../packages/shared/core/src/**/*.{ts,tsx}',
    './node_modules/@starui/ui/dist/**/*.{js,mjs}',
    './node_modules/@starui/markets-grid/dist/**/*.{js,mjs}',
    './node_modules/@starui/grid-react/dist/**/*.{js,mjs}',
  ],
};
