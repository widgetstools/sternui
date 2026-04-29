/// <reference path="./fin.d.ts" />

import type {
  IdentitySnapshot,
  RuntimePort,
  SurfaceHandle,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from '@marketsui/runtime-port';
import type { IdentityOverrides } from '@marketsui/runtime-browser';
import { resolveOpenFinIdentity, getCurrentView, isOpenFin } from './identity.js';

export interface OpenFinRuntimeOptions {
  /** Mount-prop fallbacks for identity resolution. View customData wins when present. */
  readonly identity?: IdentityOverrides;
  /**
   * Optional handler for `kind: 'inpage'` surfaces. The runtime cannot
   * mount an in-page panel itself — register a handler on construct
   * that knows where panels live.
   */
  readonly openInPage?: (spec: SurfaceSpec) => Promise<SurfaceHandle> | SurfaceHandle;
  /**
   * For tests / non-fin environments — let `create()` succeed even
   * when `fin` is missing. The resulting runtime falls back to
   * URL-and-overrides identity and emits no fin lifecycle events.
   */
  readonly allowMissingFin?: boolean;
}

/**
 * `OpenFinRuntime` — `RuntimePort` implementation that wraps `fin.*`.
 *
 * Construction is async because OpenFin's view options are read via a
 * promise. Use:
 *
 *   const runtime = await OpenFinRuntime.create();
 *
 * Identity is resolved from the current view's `customData`, then URL
 * search params, then mount-prop overrides (`OpenFinRuntimeOptions.identity`).
 *
 * Lifecycle bridging:
 *   - `onWindowShown`   → view `'shown'` event
 *   - `onWindowClosing` → view `'destroyed'` event
 *   - `onCustomDataChanged` → polls `view.getOptions()` and emits when
 *     `customData` changes (OpenFin doesn't broadcast a fine-grained
 *     event for it; the rate is configurable but defaults to 250ms).
 *
 * Theme bridging reads `[data-theme]` on `document.documentElement`
 * first (apps wire that during workspace init), and falls back to
 * the platform's `getCurrentTheme()` if available. A MutationObserver
 * tracks subsequent `[data-theme]` flips.
 *
 * Surface support:
 *   - `popout` → `platform.createView(...)` with `customData`
 *   - `modal`  → currently aliased to `popout` (TODO: real OpenFin
 *     dialog window via `createWindow({ frame: false, modalParent })`).
 *   - `inpage` → delegates to `options.openInPage`; throws otherwise.
 */
export class OpenFinRuntime implements RuntimePort {
  readonly name = 'openfin';

  static async create(options: OpenFinRuntimeOptions = {}): Promise<OpenFinRuntime> {
    if (!isOpenFin() && !options.allowMissingFin) {
      throw new Error(
        '[OpenFinRuntime] `fin` is not available. Construct OpenFinRuntime ' +
          'only inside an OpenFin runtime, or pass `allowMissingFin: true` ' +
          'for a degraded mode usable in tests.',
      );
    }
    const identity = await resolveOpenFinIdentity({ overrides: options.identity });
    return new OpenFinRuntime(identity, options);
  }

  private readonly themeListeners = new Set<(theme: Theme) => void>();
  private readonly shownListeners = new Set<() => void>();
  private readonly closingListeners = new Set<() => void>();
  private readonly customDataListeners = new Set<(cd: Readonly<Record<string, unknown>>) => void>();
  private readonly disposers: Array<() => void> = [];
  private currentTheme: Theme;
  private lastCustomData: Readonly<Record<string, unknown>>;
  private disposed = false;

  private constructor(
    private readonly identityCache: IdentitySnapshot,
    private readonly options: OpenFinRuntimeOptions,
  ) {
    this.currentTheme = this.detectTheme();
    this.lastCustomData = identityCache.customData;
    if (typeof document !== 'undefined') {
      this.attachThemeWatcher();
    }
    if (isOpenFin()) {
      this.attachViewWatchers();
    }
  }

  resolveIdentity(): IdentitySnapshot {
    return this.identityCache;
  }

  async openSurface(spec: SurfaceSpec): Promise<SurfaceHandle> {
    if (spec.kind === 'inpage') {
      if (!this.options.openInPage) {
        throw new Error(
          '[OpenFinRuntime] in-page surface requested but no `openInPage` ' +
            'handler was registered.',
        );
      }
      return this.options.openInPage(spec);
    }

    if (!isOpenFin()) {
      throw new Error('[OpenFinRuntime] cannot open a fin surface — `fin` is not available.');
    }

    // Defer the actual createView/createWindow API surface to a future
    // commit — for now, surface a helpful error. Apps still using the
    // existing PlatformAdapter.openWidget() path are unaffected by this.
    throw new Error(
      `[OpenFinRuntime] openSurface(kind=${spec.kind}) is not yet implemented. ` +
        `Use the existing platform adapter (@marketsui/openfin-platform-stern) ` +
        `or register an in-page handler.`,
    );
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

  onCustomDataChanged(fn: (customData: Readonly<Record<string, unknown>>) => void): Unsubscribe {
    this.customDataListeners.add(fn);
    return () => {
      this.customDataListeners.delete(fn);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.disposers.length > 0) {
      const fn = this.disposers.pop();
      if (fn) {
        try { fn(); } catch { /* swallow */ }
      }
    }
    this.themeListeners.clear();
    this.shownListeners.clear();
    this.closingListeners.clear();
    this.customDataListeners.clear();
  }

  // ─── internals ───────────────────────────────────────────────────────

  private detectTheme(): Theme {
    if (typeof document !== 'undefined') {
      const explicit = document.documentElement.getAttribute('data-theme');
      if (explicit === 'dark' || explicit === 'light') return explicit;
    }
    return 'light';
  }

  private setTheme(theme: Theme): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    for (const fn of this.themeListeners) {
      try { fn(theme); } catch { /* swallow */ }
    }
  }

  private attachThemeWatcher(): void {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const observer = new MutationObserver(() => this.setTheme(this.detectTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.disposers.push(() => observer.disconnect());
  }

  private attachViewWatchers(): void {
    const view = getCurrentView() as unknown as {
      on?: (event: string, fn: () => void) => void;
      removeListener?: (event: string, fn: () => void) => void;
      getOptions?: () => Promise<{ customData?: unknown }>;
    } | null;
    if (!view) return;

    const onShown = () => {
      for (const fn of this.shownListeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };
    const onDestroyed = () => {
      for (const fn of this.closingListeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };

    if (typeof view.on === 'function') {
      try {
        view.on('shown', onShown);
        view.on('destroyed', onDestroyed);
        if (typeof view.removeListener === 'function') {
          this.disposers.push(() => {
            try { view.removeListener!('shown', onShown); } catch { /* swallow */ }
            try { view.removeListener!('destroyed', onDestroyed); } catch { /* swallow */ }
          });
        }
      } catch {
        // Some view stubs lack the event API — degrade silently.
      }
    }

    // CustomData polling. OpenFin doesn't broadcast options-updated, so
    // we sample on a slow interval. Stops as soon as listeners drop or
    // the runtime is disposed.
    const intervalMs = 500;
    const timer = setInterval(() => {
      if (this.disposed || this.customDataListeners.size === 0) return;
      void (async () => {
        try {
          const options = await view.getOptions?.();
          const cd = options?.customData;
          if (!cd || typeof cd !== 'object' || Array.isArray(cd)) return;
          if (sameShallow(cd as Record<string, unknown>, this.lastCustomData)) return;
          this.lastCustomData = cd as Readonly<Record<string, unknown>>;
          for (const fn of this.customDataListeners) {
            try { fn(this.lastCustomData); } catch { /* swallow */ }
          }
        } catch {
          // View not reachable any more — keep polling so the runtime
          // recovers if the view becomes available again.
        }
      })();
    }, intervalMs);
    this.disposers.push(() => clearInterval(timer));
  }
}

/** Shallow-equal helper — sufficient for customData payloads which are
 *  generally flat key/value records. */
function sameShallow(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
