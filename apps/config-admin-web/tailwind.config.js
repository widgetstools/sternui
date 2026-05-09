/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/react/tools/config-editor-ui/src/**/*.{ts,tsx}',
    '../../packages/react/ui/src/**/*.{ts,tsx}',
  ],
};
