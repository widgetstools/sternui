import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { DataServicesProvider } from '@starui/data-services-react/runtime';
import { LOGGED_IN_USER_ID } from '@starui/runtime-port';
import { App } from './App';
import { dataServices } from './dataServices';
import './globals.css';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {dataServices ? (
      <DataServicesProvider services={dataServices} userId={LOGGED_IN_USER_ID}>
        <App />
      </DataServicesProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
