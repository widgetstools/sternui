import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { DataServicesProvider } from '@starui/host-data-react/runtime';
import { App } from './App';
import { dataServices } from './dataServices';
import './globals.css';

applyTheme(getTheme());

const rootElement = document.getElementById('root')!;

createRoot(rootElement).render(
  <React.StrictMode>
    {dataServices
      ? <DataServicesProvider services={dataServices}><App /></DataServicesProvider>
      : <App />}
  </React.StrictMode>,
);
