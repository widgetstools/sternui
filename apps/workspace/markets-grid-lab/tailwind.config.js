/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';
import { demoAppTailwindContent } from '../../../scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    ...demoAppTailwindContent,
  ],
};
