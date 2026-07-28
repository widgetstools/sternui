/**
 * Entry for the MarketsGrid page — the integration the demo exists to show.
 * The raw-AG-Grid page (`blotter.html`) stays alongside it as the minimal
 * reference: same Table, same engine, no MarketsGrid chrome.
 *
 * `applyTheme(getTheme())` is NOT optional. It is what puts `data-theme` on
 * `<html>`, and every `--bn-*` token resolves from there — without it the
 * design-system stylesheet loads but every token resolves EMPTY, so
 * MarketsGrid renders unthemed. Importing the CSS alone is not enough.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import './globals.css';
import { MarketsGridBlotter } from './MarketsGridBlotter';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MarketsGridBlotter />
  </StrictMode>,
);
