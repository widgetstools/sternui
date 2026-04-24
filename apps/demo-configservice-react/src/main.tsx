import React from 'react';
import { createRoot } from 'react-dom/client';
// FI Trading Terminal design-system themes. Imported BEFORE globals.css
// so the demo's hex-encoded shadcn vars (in globals.css) take precedence
// over the design system's HSL-triplet shadcn vars — we keep the demo's
// teal brand while still inheriting the design system's order-book /
// trade-ticket overlay tokens and legacy --fi-* aliases.
import '@marketsui/design-system/themes/fi-dark.css';
import '@marketsui/design-system/themes/fi-light.css';
import './globals.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
