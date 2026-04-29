import { DestroyRef, Injectable, inject, signal, type Signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import type {
  IdentitySnapshot,
  RuntimePort,
  Theme,
  Unsubscribe,
} from '@marketsui/runtime-port';
import type { ConfigClient } from '@marketsui/config-service';
import { HOST_RUNTIME, HOST_CONFIG_MANAGER, HOST_CONFIG_URL } from './HostTokens';

/**
 * `HostService` — the Angular mirror of React's `useHost()` (see
 * `@marketsui/host-wrapper-react`).
 *
 * Hosted Angular components inject `HostService` to read identity,
 * configManager, theme, and runtime lifecycle events without
 * importing `@openfin/core`, reaching for `localStorage`, or
 * touching routing directly.
 *
 * Lifecycle:
 *   - Provided at the app root via `provideHostWrapper(...)` (see
 *     `provider.ts`). Singleton per Angular injector.
 *   - Subscribes to runtime events on construction. Subscribers are
 *     auto-cleaned via `DestroyRef` when the injector tears down.
 *
 * Theme is exposed as both an RxJS Observable and an Angular Signal
 * so consumers can pick whichever fits their template flavor.
 */
@Injectable({ providedIn: 'root' })
export class HostService {
  /** The underlying RuntimePort (OpenFinRuntime or BrowserRuntime). */
  readonly runtime: RuntimePort = inject(HOST_RUNTIME);

  /** ConfigManager — any backend (REST / IndexedDB / localStorage / Memory). */
  readonly configManager: ConfigClient = inject(HOST_CONFIG_MANAGER);

  /** Optional URL of the config service backend (for client-driven REST). */
  readonly configUrl: string | undefined = inject(HOST_CONFIG_URL, { optional: true }) ?? undefined;

  /** Resolved-once identity snapshot (instanceId, appId, userId, etc.). */
  readonly identity: IdentitySnapshot;

  /** Current theme as an Angular Signal — `host.themeSignal()`. */
  readonly themeSignal: Signal<Theme>;

  /** Current theme as an RxJS Observable — emits on every change. */
  readonly theme$: Observable<Theme>;

  /** Window-shown notifications. */
  readonly windowShown$: Observable<void>;

  /** Window-closing notifications (fires once per lifetime). */
  readonly windowClosing$: Observable<void>;

  /** customData updates from the platform. */
  readonly customData$: Observable<Readonly<Record<string, unknown>>>;

  /**
   * Workspace-save notifications. Hosted components use this as a
   * flush-to-disk hook. In the browser this never emits (no
   * workspace concept).
   */
  readonly workspaceSave$: Observable<void>;

  // Subjects backing the public observables. Kept private so consumers
  // can't push synthetic events from outside.
  private readonly themeSubject = new Subject<Theme>();
  private readonly windowShownSubject = new Subject<void>();
  private readonly windowClosingSubject = new Subject<void>();
  private readonly customDataSubject = new Subject<Readonly<Record<string, unknown>>>();
  private readonly workspaceSaveSubject = new Subject<void>();

  // Unsubscribe handles for the runtime listeners — cleared on destroy.
  private readonly unsubscribers: Array<Unsubscribe> = [];

  constructor() {
    this.identity = this.runtime.resolveIdentity();

    // Theme: seed with the runtime's current value, then bridge updates.
    const initialTheme = this.runtime.getTheme();
    this.themeSignal = signal(initialTheme);
    this.theme$ = this.themeSubject.asObservable();
    this.windowShown$ = this.windowShownSubject.asObservable();
    this.windowClosing$ = this.windowClosingSubject.asObservable();
    this.customData$ = this.customDataSubject.asObservable();
    this.workspaceSave$ = this.workspaceSaveSubject.asObservable();

    this.unsubscribers.push(
      this.runtime.onThemeChanged((t) => {
        (this.themeSignal as { set?: (v: Theme) => void }).set?.(t);
        this.themeSubject.next(t);
      }),
      this.runtime.onWindowShown(() => this.windowShownSubject.next()),
      this.runtime.onWindowClosing(() => this.windowClosingSubject.next()),
      this.runtime.onCustomDataChanged((cd) => this.customDataSubject.next(cd)),
      this.runtime.onWorkspaceSave(() => this.workspaceSaveSubject.next()),
    );

    // Auto-cleanup when the root injector is torn down.
    inject(DestroyRef).onDestroy(() => this.dispose());
  }

  /** Identity convenience getters — same shape as `useHost()` in React. */
  get instanceId(): string { return this.identity.instanceId; }
  get appId(): string { return this.identity.appId; }
  get userId(): string { return this.identity.userId; }
  get componentType(): string { return this.identity.componentType; }
  get componentSubType(): string { return this.identity.componentSubType; }
  get isTemplate(): boolean { return this.identity.isTemplate; }
  get singleton(): boolean { return this.identity.singleton; }
  get roles(): readonly string[] { return this.identity.roles; }
  get permissions(): readonly string[] { return this.identity.permissions; }
  get customData(): Readonly<Record<string, unknown>> { return this.identity.customData; }

  /**
   * Tear down all runtime listeners and complete every Subject.
   * Idempotent. Called automatically via DestroyRef; exposed for
   * tests that need explicit teardown.
   */
  dispose(): void {
    while (this.unsubscribers.length > 0) {
      const unsub = this.unsubscribers.pop();
      if (unsub) {
        try { unsub(); } catch { /* swallow */ }
      }
    }
    this.themeSubject.complete();
    this.windowShownSubject.complete();
    this.windowClosingSubject.complete();
    this.customDataSubject.complete();
    this.workspaceSaveSubject.complete();
  }
}
