/**
 * Entry point — boot the platform, then mount React.
 *
 * Boot runs before render so ConfigManager + the SharedWorker hub are ready
 * before any hook or grid attach. See README.md for the full sequence.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import '@starui/design-system/css';
import { DataHubProvider } from '@starui/host-data-react/runtime';
import { App } from './App.js';
import { bootstrap } from './bootstrap.js';
import './globals.css';

applyTheme(getTheme());

void bootstrap().then(({ config, platform }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DataHubProvider platform={platform} userId={config.userId}>
        <App />
      </DataHubProvider>
    </StrictMode>,
  );
});
