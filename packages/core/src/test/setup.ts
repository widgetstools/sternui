/**
 * Vitest global setup — runs before every test file.
 * Wires up @testing-library/jest-dom matchers and provides a clean jsdom
 * environment between tests.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // localStorage is per-window in jsdom; clear between tests so adapters
  // start with a blank slate.
  try { localStorage.clear(); } catch { /* noop */ }
});
