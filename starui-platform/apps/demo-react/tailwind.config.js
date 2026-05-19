/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/react-ui/ui/src/**/*.{ts,tsx}',
    '../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  ],
};
