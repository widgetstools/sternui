/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/react/ui/src/**/*.{ts,tsx}',
    '../../packages/react/widgets/**/src/**/*.{ts,tsx}',
    '../../packages/react/config-browser-react/src/**/*.{ts,tsx}',
    '../../packages/shared/services/config-service/src/**/*.{ts,tsx}',
  ],
};
