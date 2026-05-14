import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { AppShell } from '@starui/app-shell-react';
import { BrowserRuntime } from '@starui/runtime-browser';
import {
  createConfigClient,
  createConfigManager,
  createConfigServiceStorage,
  migrateLegacyProfilesIfNeeded,
} from '@starui/config-service';
import type { StorageAdapterFactory } from '@starui/markets-grid';
import { App, APP_ID, DEMO_USER_ID } from './App';
import './globals.css';

// Apply persisted theme before first render so there's no FOUC.
applyTheme(getTheme());

// Identity matches the runtime's defaults so the storage factory and
// the AG-Grid container both scope to (APP_ID, DEMO_USER_ID).
const runtime = new BrowserRuntime({
  identity: {
    appId: APP_ID,
    userId: DEMO_USER_ID,
    instanceId: 'demo-blotter-v2',
    componentType: 'MarketsGrid',
  },
});

// One ConfigManager owns the Dexie database; both the AppShell's
// ConfigClient and the MarketsGrid storage factory wrap it. After
// init, run the one-shot legacy → ConfigService migration so any data
// the user had on the previous DexieAdapter build is preserved.
const innerManager = createConfigManager({});

const ready: Promise<{ storage: StorageAdapterFactory }> = innerManager
  .init()
  .then(async () => {
    try {
      const result = await migrateLegacyProfilesIfNeeded(innerManager);
      if (result.ranThisBoot && result.copied > 0) {
        console.info(
          `[profile-migration-v1] copied ${result.copied} legacy profile(s) ` +
            `across ${Object.keys(result.perGrid).length} grid(s) into ConfigService.`,
        );
      }
    } catch (err) {
      console.warn('[profile-migration-v1] unexpected failure:', err);
    }
    return { storage: createConfigServiceStorage({ configManager: innerManager }) };
  });

const configClient = ready.then(() => createConfigClient({ configManager: innerManager }));
const storageReady = ready.then(({ storage }) => storage);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppShell runtime={runtime} configManager={configClient}>
      <App storageReady={storageReady} />
    </AppShell>
  </React.StrictMode>,
);
