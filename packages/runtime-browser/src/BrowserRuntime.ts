import type {
  IdentitySnapshot,
  RuntimePort,
  SurfaceHandle,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from '@marketsui/runtime-port';
import { resolveBrowserIdentity, type IdentityOverrides } from './identity.js';

export interface BrowserRuntimeOptions {
  /**
   * Mount-prop fallbacks for identity resolution. URL search params win
   * when present; these fill in the gaps.
   */
  readonly identity?: IdentityOverrides;
  /**
   * Override the source URL (defaults to `window.location.href`). Useful
   * for tests and for hosts that synthesise a non-canonical URL.
   */
  readonly url?: string;
  /**
   * Optional handler for `kind: 'inpage'` surfaces. The runtime cannot
   * mount an in-page panel itself — the app must register a handler
   * (typically via the HostWrapper) that knows where panels live.
   */
  readonly openInPage?: (spec: SurfaceSpec) => Promise<SurfaceHandle> | SurfaceHandle;
}

/**
 * `BrowserRuntime` — `RuntimePort` implementation for plain-browser hosts.
 *
 * Identity:
 *   - URL search params + mount-prop overrides (`crypto.randomUUID()` for
 *     missing `instanceId`).
 * Theme:
 *   - Reads `[data-theme]` on `document.documentElement` first; falls
 *     back to `(prefers-color-scheme: dark)`. Listens for both.
 * Window lifecycle:
 *   - `onWindowShown` bridges to `document.visibilitychange` (visible).
 *     Fires once on construct if the document is already visible.
 *   - `onWindowClosing` bridges to `beforeunload`.
 * Surfaces:
 *   - `popout` → `window.open()`. Returned handle exposes `close()` and
 *     `onClosed(...)` (the latter polls because cross-window
 *     `unload` events aren't reliable across browsers).
 *   - `modal` → currently aliased to `popout`. Real DOM modal support
 *     needs a host portal which the app registers; until then the popup
 *     covers the use case.
 *   - `inpage` → delegates to `options.openInPage` if provided; otherwise
 *     throws an explanatory error so callers can fall back.
 *
 * `customData` updates aren't a concept in plain browsers, so
 * `onCustomDataChanged` returns a no-op unsubscribe.
 */
export class BrowserRuntime implements RuntimePort {
  readonly name = 'browser';

  private readonly identityCache: IdentitySnapshot;
  private readonly themeListeners = new Set<(theme: Theme) => void>();
  private readonly shownListeners = new Set<() => void>();
  private readonly closingListeners = new Set<() => void>();
  private readonly disposers: Array<() => void> = [];
  private currentTheme: Theme;
  private disposed = false;

  constructor(private readonly options: BrowserRuntimeOptions = {}) {
    const url = options.url ?? (typeof window !== 'undefined' ? window.location.href : '');
    const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    this.identityCache = resolveBrowserIdentity(search, options.identity);
    this.currentTheme = this.detectTheme();

    if (typeof window !== 'undefined') {
      this.attachThemeWatchers();
      this.attachVisibilityWatcher();
      this.attachUnloadWatcher();
    }
  }

  resolveIdentity(): IdentitySnapshot {
    return this.identityCache;
  }

  async openSurface(spec: SurfaceSpec): Promise<SurfaceHandle> {
    if (spec.kind === 'inpage') {
      if (!this.options.openInPage) {
        throw new Error(
          '[BrowserRuntime] in-page surface requested but no `openInPage` ' +
            'handler was registered. The app must wire one through ' +
            'BrowserRuntimeOptions.openInPage so the runtime knows where ' +
            'panels mount.',
        );
      }
      return this.options.openInPage(spec);
    }

    if (typeof window === 'undefined') {
      throw new Error('[BrowserRuntime] cannot open a surface outside a browser.');
    }

    const url = this.appendCustomDataToUrl(spec.url, spec.customData);
    const features: string[] = [];
    if (spec.width !== undefined) features.push(`width=${spec.width}`);
    if (spec.height !== undefined) features.push(`height=${spec.height}`);
    const win = window.open(url, spec.title ?? '_blank', features.join(','));

    if (!win) {
      throw new Error('[BrowserRuntime] window.open returned null (popup blocked?).');
    }

    return this.makeSurfaceHandle(spec.kind, win, spec.title ?? 'browser-surface');
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  onThemeChanged(fn: (theme: Theme) => void): Unsubscribe {
    this.themeListeners.add(fn);
    return () => {
      this.themeListeners.delete(fn);
    };
  }

  onWindowShown(fn: () => void): Unsubscribe {
    this.shownListeners.add(fn);
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      // Initial show — fire once asynchronously so subscribers aren't
      // surprised by a synchronous emit during their own setup.
      queueMicrotask(() => {
        if (this.shownListeners.has(fn)) fn();
      });
    }
    return () => {
      this.shownListeners.delete(fn);
    };
  }

  onWindowClosing(fn: () => void): Unsubscribe {
    this.closingListeners.add(fn);
    return () => {
      this.closingListeners.delete(fn);
    };
  }

  onCustomDataChanged(_fn: (customData: Readonly<Record<string, unknown>>) => void): Unsubscribe {
    // No-op in plain browser — there's no "platform" pushing customData.
    void _fn;
    return () => {};
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.disposers.length > 0) {
      const fn = this.disposers.pop();
      if (fn) {
        try { fn(); } catch {
          // Best-effort dispose — never let one listener's failure block the rest.
        }
      }
    }
    this.themeListeners.clear();
    this.shownListeners.clear();
    this.closingListeners.clear();
  }

  // ─── internals ───────────────────────────────────────────────────────

  private detectTheme(): Theme {
    if (typeof document !== 'undefined') {
      const explicit = document.documentElement.getAttribute('data-theme');
      if (explicit === 'dark' || explicit === 'light') return explicit;
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  private setTheme(theme: Theme): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    for (const fn of this.themeListeners) {
      try { fn(theme); } catch {
        // Listener errors are swallowed so one buggy subscriber can't
        // break others.
      }
    }
  }

  private attachThemeWatchers(): void {
    // (1) prefers-color-scheme — only consulted when `[data-theme]` is
    //     absent. We listen anyway so a later `[data-theme]` removal
    //     resyncs to OS preference.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => this.setTheme(this.detectTheme());
      // Some browsers (older Safari) need addListener; modern uses addEventListener.
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler);
        this.disposers.push(() => mq.removeEventListener('change', handler));
      } else if (typeof (mq as MediaQueryList & { addListener?: (h: () => void) => void }).addListener === 'function') {
        (mq as MediaQueryList & { addListener: (h: () => void) => void }).addListener(handler);
        this.disposers.push(() => {
          (mq as MediaQueryList & { removeListener: (h: () => void) => void }).removeListener(handler);
        });
      }
    }

    // (2) [data-theme] mutations on <html>.
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      const observer = new MutationObserver(() => this.setTheme(this.detectTheme()));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      this.disposers.push(() => observer.disconnect());
    }
  }

  private attachVisibilityWatcher(): void {
    if (typeof document === 'undefined') return;
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      for (const fn of this.shownListeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };
    document.addEventListener('visibilitychange', handler);
    this.disposers.push(() => document.removeEventListener('visibilitychange', handler));
  }

  private attachUnloadWatcher(): void {
    if (typeof window === 'undefined') return;
    const handler = () => {
      for (const fn of this.closingListeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };
    window.addEventListener('beforeunload', handler);
    this.disposers.push(() => window.removeEventListener('beforeunload', handler));
  }

  private appendCustomDataToUrl(
    url: string,
    customData: Readonly<Record<string, unknown>> | undefined,
  ): string {
    if (!customData || Object.keys(customData).length === 0) return url;
    try {
      const encoded = btoa(JSON.stringify(customData));
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}data=${encodeURIComponent(encoded)}`;
    } catch {
      // If serialization fails (circular ref etc.), open the URL bare —
      // better than throwing the open call entirely.
      return url;
    }
  }

  private makeSurfaceHandle(kind: SurfaceSpec['kind'], win: Window, id: string): SurfaceHandle {
    const closedListeners = new Set<() => void>();
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const fireClosed = () => {
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      const listeners = [...closedListeners];
      closedListeners.clear();
      for (const fn of listeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };

    // Cross-window `unload` is unreliable; poll `closed` instead.
    pollTimer = setInterval(() => {
      if (win.closed) fireClosed();
    }, 250);

    return {
      kind,
      id,
      close: () => {
        try { win.close(); } catch { /* swallow */ }
        fireClosed();
      },
      focus: () => {
        try { win.focus(); } catch { /* swallow */ }
      },
      onClosed: (fn) => {
        closedListeners.add(fn);
        return () => {
          closedListeners.delete(fn);
        };
      },
    };
  }
}
