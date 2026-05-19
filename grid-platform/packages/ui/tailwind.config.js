/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@stargrid/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './src/**/*.{ts,tsx}',
  ],
};
