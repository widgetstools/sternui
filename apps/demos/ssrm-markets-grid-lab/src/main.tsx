import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { App } from './App';
import './globals.css';

/**
 * No data-services hub, and no provider bootstrap.
 *
 * The bake-off lab boots `DataHubProvider` and a platform config because its
 * books can be provider-fed. This one's book is GENERATED inside its own
 * SharedWorker (`workers/ssrmBookWorker.ts`), so there is no hub to start and
 * nothing to fail before the first render — which is why this file has no
 * bootstrap-error surface where the other one needs one.
 *
 * That is a deliberate limit rather than an omission: this app demonstrates the
 * ENGINE under the platform, not the provider plumbing. A provider-fed book on
 * this surface is exercised by `providerBookProbe` against the other lab.
 */
applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
