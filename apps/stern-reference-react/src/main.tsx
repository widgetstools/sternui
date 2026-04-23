import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@marketsui/ui';
import { App } from './App.js';
import { OpenFinThemeBridge } from './providers/OpenFinThemeBridge.js';
import './index.css';

const OpenfinProvider = lazy(() => import('./openfin/OpenfinProvider.js'));
const DockEditorWindow = lazy(() => import('./openfin/DockEditorWindow.js'));

const isOpenFin = typeof window !== 'undefined' && !!(window as any).fin;

const LoadingFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
    <p>Loading platform...</p>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider
      defaultTheme="dark"
      storageKey={isOpenFin ? 'stern-openfin-theme' : 'stern-theme'}
      enableSystem={false}
      disableTransitionOnChange
    >
      <OpenFinThemeBridge />
      <BrowserRouter>
        <Routes>
          <Route
            path="/platform/provider"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <OpenfinProvider />
              </Suspense>
            }
          />
          <Route
            path="/dock-editor"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <DockEditorWindow />
              </Suspense>
            }
          />
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
