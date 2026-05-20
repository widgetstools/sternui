import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';
import { primengPreset } from '@starui/design-system/primeng';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChromaDeskPreset = definePreset(Aura, primengPreset as any);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: ChromaDeskPreset,
        options: {
          darkModeSelector: '[data-theme="dark"]',
          cssLayer: { name: 'primeng', order: 'tailwind-base, primeng, tailwind-utilities' },
        },
      },
    }),
  ],
};
