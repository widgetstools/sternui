/**
 * jsdom polyfills for Radix UI primitives (DropdownMenu / Tooltip).
 *
 * Radix calls pointer-capture and scroll APIs that jsdom doesn't implement;
 * without these stubs, opening a menu throws. Wired via vitest `setupFiles`.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
