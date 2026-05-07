import React from 'react';
import { createRoot } from 'react-dom/client';
// Design-system themes loaded BEFORE app globals so the demo's
// app-level palette overrides take precedence — same import order
// pattern as apps/demo-react.
import '@starui/design-system/themes/fi-dark.css';
import '@starui/design-system/themes/fi-light.css';
import './globals.css';
import { HostWrapper } from '@starui/host-wrapper-react';
import { BrowserRuntime } from '@starui/runtime-browser';
import { createConfigClient } from '@starui/config-service';
import { App } from './App';

// Force dark — this app's chrome is purpose-built dark/financial.
// Both selectors needed: design-system tokens key off `[data-theme]`,
// while @starui/core's conditional-styling module emits CSS scoped
// to a `.dark` class for its rule outputs.
document.documentElement.setAttribute('data-theme', 'dark');
document.documentElement.classList.add('dark');

const runtime = new BrowserRuntime({
  identity: {
    appId: 'axe-blotter-demo',
    userId: 'a-mehta',
    instanceId: 'axe-blotter-default',
    componentType: 'MarketsGrid',
  },
});
const configManager = createConfigClient({});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HostWrapper runtime={runtime} configManager={configManager}>
      <App />
    </HostWrapper>
  </React.StrictMode>,
);
