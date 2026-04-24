import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { generatePrimeNGPreset } from '@marketsui/design-system/adapters/primeng';

// PrimeNG preset layered on Aura, driven by the design-system tokens
// so PrimeNG components re-theme with the app's `[data-theme]` attribute
// (no `.dark` class involved — see packages/design-system/README.md).
// `as any` accommodates PrimeNG v21's stricter `ButtonDesignTokens` etc.
// until the design-system adapter is updated to match v21 schema —
// at runtime PrimeNG deep-merges and ignores unrecognized keys.
const FiTheme = definePreset(Aura, generatePrimeNGPreset() as any);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: FiTheme,
        options: { darkModeSelector: '[data-theme="dark"]' },
      },
    }),
  ],
};
