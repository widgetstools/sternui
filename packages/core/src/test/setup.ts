/**
 * Vitest global setup — runs before every test file.
 * Wires up @testing-library/jest-dom matchers and provides a clean jsdom
 * environment between tests.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 29 doesn't ship ResizeObserver. cmdk (the cockpit list rail
// primitive used by every settings panel) reads it on mount, so the
// integration tests need a no-op shim. Real browsers always have one.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
}

// jsdom 29 doesn't implement Element.scrollIntoView either; cmdk calls
// it when a list item gains keyboard focus. No-op is fine for tests.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

afterEach(() => {
  cleanup();
  // localStorage is per-window in jsdom; clear between tests so adapters
  // start with a blank slate.
  try { localStorage.clear(); } catch { /* noop */ }
});
