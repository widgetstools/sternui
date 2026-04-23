/**
 * @markets/component-host/angular
 *
 * Angular service for the component-host lifecycle.
 *
 * Usage:
 *   @Component({
 *     standalone: true,
 *     changeDetection: ChangeDetectionStrategy.OnPush,
 *     providers: [ComponentHostService],  // one instance per component
 *     template: `
 *       @if (host.isLoading()) { <spinner /> }
 *       @else { <grid [config]="host.config()" /> }
 *     `,
 *   })
 *   export class BlotterComponent implements OnInit {
 *     readonly host = inject(ComponentHostService<BlotterConfig>);
 *     async ngOnInit() { await this.host.init(); }
 *   }
 */

import { Injectable, OnDestroy, signal } from "@angular/core";
import {
  readCustomData,
  resolveInstanceId,
  buildFallbackIdentity,
  subscribeToTheme,
  getCurrentTheme,
  onCloseRequested,
  createDebouncedSaver,
  type ComponentHostOptions,
  type AppConfigRow,
  type DebouncedSaver,
} from "../src";
import { getConfigManager } from "@markets/openfin-workspace";

/**
 * Angular service that resolves component identity, loads config,
 * subscribes to theme changes, and provides debounced config saving.
 *
 * Follows Angular best practices:
 *   - All public state exposed as readonly signals (OnPush-compatible)
 *   - No manual change detection — signals notify the framework
 *   - init() is explicit (called from ngOnInit, not constructor)
 *   - ngOnDestroy handles full cleanup
 *   - Provide at component level for per-instance isolation
 */
@Injectable()
export class ComponentHostService<T = unknown> implements OnDestroy {
  // ── Public reactive state (readonly signals) ────────────────────────
  readonly instanceId = signal<string>("");
  readonly config = signal<T | null>(null);
  readonly theme = signal<"dark" | "light">("dark");
  readonly isLoading = signal(true);
  readonly isSaved = signal(false);
  readonly error = signal<string | null>(null);

  // Guard against double-init (hot reload, route reuse, test harness)
  private _initialized = false;

  // ── Private mutable state (not exposed to template) ─────────────────
  private saver: DebouncedSaver<T> | null = null;
  private row: AppConfigRow | null = null;
  private unsubTheme: (() => void) | null = null;
  private unsubClose: (() => void) | null = null;

  /**
   * Initialize the component host. Resolves identity, loads config,
   * subscribes to theme and lifecycle events.
   *
   * Call this from the component's ngOnInit:
   *   async ngOnInit() { await this.host.init(); }
   */
  async init(options?: ComponentHostOptions): Promise<void> {
    // Prevent double-init (hot reload, route reuse, test harness)
    if (this._initialized) return;
    this._initialized = true;

    // Apply default theme immediately so the template has the right value
    // before the async init completes
    if (options?.defaultTheme) this.theme.set(options.defaultTheme);

    try {
      // Step 1: Read identity from OpenFin (or use fallback in dev mode)
      const customData = await readCustomData();
      const identity = customData ?? buildFallbackIdentity();

      // Step 2: Get ConfigManager singleton and resolve config
      const configManager = await getConfigManager();
      const { config: loadedRow, isNew } = await resolveInstanceId(
        identity,
        configManager,
      );

      this.row = loadedRow;

      // Step 3: Read current theme
      const currentTheme = await getCurrentTheme(options?.defaultTheme);

      // Step 4: Create debounced saver
      this.saver = createDebouncedSaver<T>(
        identity.instanceId,
        configManager,
        () => this.row,
        options?.debounceMs ?? 300,
      );

      // Step 5: Subscribe to theme changes via IAB
      this.unsubTheme = await subscribeToTheme((t) => this.theme.set(t));

      // Step 6: Subscribe to close-requested for flush
      this.unsubClose = await onCloseRequested(async () => {
        await this.saver?.flush();
      });

      // Update all signals
      this.instanceId.set(identity.instanceId);
      this.config.set(loadedRow ? (loadedRow.config as T) : null);
      this.theme.set(currentTheme);
      this.isLoading.set(false);
      this.isSaved.set(!isNew);
    } catch (err) {
      this.isLoading.set(false);
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Save a partial config update. Debounced at 300ms (configurable).
   * Updates the local signal immediately for optimistic UI.
   */
  saveConfig(partial: Partial<T>): void {
    if (!this.saver || !this.row) return;

    // Merge into row so the saver has the latest state
    this.row = {
      ...this.row,
      config: { ...this.row.config, ...partial },
    };

    // Optimistic signal update — template reflects change immediately
    this.config.update((c) => (c ? { ...c, ...partial } : (partial as T)));
    this.isSaved.set(true);

    // Queue the debounced write
    this.saver.save(partial);
  }

  /** Cleanup: unsubscribe all listeners and cancel pending saves. */
  ngOnDestroy(): void {
    this.unsubTheme?.();
    this.unsubClose?.();
    this.saver?.cancel();
  }
}
