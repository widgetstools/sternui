import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { generatePrimeNGPreset } from '@marketsui/design-system/adapters/primeng';
import { provideHostWrapper } from '@marketsui/host-wrapper-angular';
import { BrowserRuntime } from '@marketsui/runtime-browser';
import { OpenFinRuntime, isOpenFin } from '@marketsui/runtime-openfin';
import { createConfigClient } from '@marketsui/config-service';
import type { RuntimePort } from '@marketsui/runtime-port';

import { routes } from './app.routes';

// PrimeNG preset layered on Aura, driven by the design-system tokens
// so PrimeNG components (including those rendered by the dock-editor and
// registry-editor sub-packages) re-theme with the `[data-theme]`
// attribute. See packages/design-system/README.md.
// `as any` accommodates PrimeNG v21's stricter `ButtonDesignTokens` etc.
// until the design-system adapter is updated to match v21 schema —
// at runtime PrimeNG deep-merges and ignores unrecognized keys.
const FiTheme = definePreset(Aura, generatePrimeNGPreset() as any);

// ─── Path C Phase X-2 — wire HostService at app root ─────────────────
//
// Angular mirror of the React HostWrapper wiring done in
// apps/markets-ui-react-reference/src/main.tsx. Hosted Angular
// components inject HostService to read identity, configManager,
// theme, and lifecycle events without importing @openfin/core.
//
// Runtime selection:
//   - inside OpenFin (fin.View reachable) → OpenFinRuntime.create()
//   - plain browser (dev / preview)        → BrowserRuntime
//
// `OpenFinRuntime.create()` is async (it awaits `view.getOptions()`
// to read customData), so the app config is built via
// `buildAppConfig()` and main.ts awaits it before
// `bootstrapApplication`.
export async function buildAppConfig(): Promise<ApplicationConfig> {
  const runtime: RuntimePort = isOpenFin()
    ? await OpenFinRuntime.create()
    : new BrowserRuntime({
        identity: {
          appId: 'markets-ui-angular-reference',
          userId: 'dev1',
          componentType: 'MarketsUIAngularReference',
        },
      });
  const configManager = createConfigClient({});

  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideRouter(routes),
      provideAnimationsAsync(),
      providePrimeNG({
        theme: {
          preset: FiTheme,
          options: { darkModeSelector: '[data-theme="dark"]' },
        },
      }),
      ...provideHostWrapper({ runtime, configManager }),
    ],
  };
}
