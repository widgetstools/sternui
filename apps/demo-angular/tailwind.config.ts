import type { Config } from 'tailwindcss';
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset as any],
  content: [
    './src/**/*.{html,ts}',
  ],
} satisfies Config;
