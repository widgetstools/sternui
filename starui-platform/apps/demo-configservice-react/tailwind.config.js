/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/react-ui/ui/src/**/*.{ts,tsx}',
    './node_modules/@starui/ui/dist/**/*.{js,mjs}',
    './node_modules/@starui/grid/**/*.{ts,tsx,js,mjs}',
  ],
};
