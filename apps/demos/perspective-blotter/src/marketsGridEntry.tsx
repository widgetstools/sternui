/**
 * Entry for the MarketsGrid page — the integration the demo exists to show.
 * The raw-AG-Grid page (`blotter.html`) stays alongside it as the minimal
 * reference: same Table, same engine, no MarketsGrid chrome.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@starui/design-system/css';
import { MarketsGridBlotter } from './MarketsGridBlotter';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MarketsGridBlotter />
  </StrictMode>,
);
