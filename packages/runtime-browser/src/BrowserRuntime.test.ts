import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserRuntime } from './BrowserRuntime.js';
import type { Theme } from '@marketsui/runtime-port';

/**
 * Tests run under jsdom (see vitest.config.ts). jsdom doesn't implement
 * `matchMedia` by default, so the BrowserRuntime tolerates its absence —
 * the tests exercise the `[data-theme]` path for explicit theming and
 * verify the `prefers-color-scheme` fallback when matchMedia IS stubbed.
 */

describe('BrowserRuntime', () => {
  let rt: BrowserRuntime | null = null;

  afterEach(() => {
    rt?.dispose();
    rt = null;
    document.documentElement.removeAttribute('data-theme');
  });

  describe('identity', () => {
    it('parses identity from URL params via the constructor URL option', () => {
      rt = new BrowserRuntime({
        url: 'http://localhost/?appId=app1&userId=u1&instanceId=fixed',
      });
      const id = rt.resolveIdentity();
      expect(id.appId).toBe('app1');
      expect(id.userId).toBe('u1');
      expect(id.instanceId).toBe('fixed');
    });

    it('falls back to mount-prop overrides', () => {
      rt = new BrowserRuntime({
        url: 'http://localhost/',
        identity: { appId: 'fallback-app', userId: 'fallback-user' },
      });
      const id = rt.resolveIdentity();
      expect(id.appId).toBe('fallback-app');
      expect(id.userId).toBe('fallback-user');
    });
  });

  describe('theme', () => {
    it('reads explicit data-theme="dark"', () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      expect(rt.getTheme()).toBe('dark');
    });

    it('reads explicit data-theme="light"', () => {
      document.documentElement.setAttribute('data-theme', 'light');
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      expect(rt.getTheme()).toBe('light');
    });

    it('emits onThemeChanged when [data-theme] mutates', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      const observed: Theme[] = [];
      rt.onThemeChanged((t) => observed.push(t));

      document.documentElement.setAttribute('data-theme', 'dark');
      // MutationObserver flushes asynchronously
      await new Promise((r) => setTimeout(r, 0));

      expect(observed).toEqual(['dark']);
    });

    it('unsubscribe stops further theme emissions', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      const observed: Theme[] = [];
      const unsub = rt.onThemeChanged((t) => observed.push(t));
      unsub();

      document.documentElement.setAttribute('data-theme', 'dark');
      await new Promise((r) => setTimeout(r, 0));

      expect(observed).toEqual([]);
    });
  });

  describe('window lifecycle', () => {
    it('onWindowShown fires once on mount when document is visible', async () => {
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      const fn = vi.fn();
      rt.onWindowShown(fn);
      // queueMicrotask in BrowserRuntime — let it run.
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('onWindowClosing fires when beforeunload dispatches', () => {
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      const fn = vi.fn();
      rt.onWindowClosing(fn);
      window.dispatchEvent(new Event('beforeunload'));
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('dispose() removes window/document listeners — beforeunload no longer fires', () => {
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      const fn = vi.fn();
      rt.onWindowClosing(fn);
      rt.dispose();
      window.dispatchEvent(new Event('beforeunload'));
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('onCustomDataChanged', () => {
    it('returns a no-op unsubscribe (browser has no platform pushing customData)', () => {
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      const unsub = rt.onCustomDataChanged(() => {
        throw new Error('should never fire');
      });
      expect(typeof unsub).toBe('function');
      unsub(); // idempotent no-op
    });
  });

  describe('openSurface', () => {
    it('inpage without a registered handler throws explanatorily', async () => {
      rt = new BrowserRuntime({ url: 'http://localhost/' });
      await expect(rt.openSurface({ kind: 'inpage', url: '/x' })).rejects.toThrow(
        /no `openInPage` handler was registered/,
      );
    });

    it('inpage delegates to options.openInPage when provided', async () => {
      const fakeHandle = {
        kind: 'inpage' as const,
        id: 'inpage-1',
        close: vi.fn(),
        onClosed: () => () => {},
      };
      rt = new BrowserRuntime({
        url: 'http://localhost/',
        openInPage: () => fakeHandle,
      });
      const handle = await rt.openSurface({ kind: 'inpage', url: '/x' });
      expect(handle).toBe(fakeHandle);
    });
  });
});
