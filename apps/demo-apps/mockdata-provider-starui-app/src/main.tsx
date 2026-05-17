import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { DataServicesProvider } from '@starui/data-services-react/runtime';
import { App } from './App';
import { dataServices } from './dataServices';
import { MockConfigProvider } from './state/MockConfigContext';
import './globals.css';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MockConfigProvider>
      {dataServices
        ? <DataServicesProvider services={dataServices}><App /></DataServicesProvider>
        : <App />}
    </MockConfigProvider>
  </React.StrictMode>,
);
