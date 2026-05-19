import { tailwindPreset } from '@stargrid/design-system/tailwind';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/grid/src/**/*.{ts,tsx}',
  ],
};
