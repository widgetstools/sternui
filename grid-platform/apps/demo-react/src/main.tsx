import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@stargrid/design-system';
import '@stargrid/design-system/css';
import { StarGridApp } from '@stargrid/app';
import { App } from './App';
import './globals.css';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StarGridApp appId="stargrid-demo" userId="demo-user" persistence="localStorage">
      <App />
    </StarGridApp>
  </StrictMode>,
);
