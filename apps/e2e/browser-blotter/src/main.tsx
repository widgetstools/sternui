/**
 * Browser-blotter entry — single-page e2e target.
 *
 * URL routing: `?mode=<standalone|provider|config|full>`. Default = full
 * (kitchen-sink). Each mode wires a different subset of the framework
 * stack so Playwright specs can target the right surface.
 *
 *   ?mode=standalone — pure MarketsGrid + in-app generator. No SharedWorker.
 *                       For tests that exercise grid-only behaviour.
 *   ?mode=provider   — adds @starui/host-data mock provider via SharedWorker.
 *                       For tests that exercise the data-services hub.
 *   ?mode=config     — adds ConfigService-backed profile persistence.
 *                       For tests that exercise profile lifecycle round-trips.
 *   ?mode=full       — everything (current target for most specs).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import '@starui/design-system/css';
import { App, type AppMode } from './App';
import './globals.css';

applyTheme(getTheme());

function resolveMode(): AppMode {
  if (typeof window === 'undefined') return 'full';
  const q = new URLSearchParams(window.location.search);
  const m = q.get('mode');
  if (m === 'standalone' || m === 'provider' || m === 'config' || m === 'full') return m;
  return 'full';
}

const root = createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <App mode={resolveMode()} />
  </React.StrictMode>,
);
