/**
 * Vitest global setup for @starui/grid-react.
 *
 * Mirrors the core-package setup (cmdk needs ResizeObserver +
 * Element.scrollIntoView shims under jsdom 29) and wires
 * @testing-library/jest-dom + cleanup between tests.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

afterEach(() => {
  cleanup();
  try { localStorage.clear(); } catch { /* noop */ }
});
