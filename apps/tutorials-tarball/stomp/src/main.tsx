import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { DataServicesProvider } from '@starui/host-data-react/runtime';
import { LOGGED_IN_USER_ID } from '@starui/types';
import { App } from './App';
import { dataServices } from './dataServices';
import './globals.css';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataServicesProvider services={dataServices} userId={LOGGED_IN_USER_ID}>
      <App />
    </DataServicesProvider>
  </StrictMode>,
);
