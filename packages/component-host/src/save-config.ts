/**
 * Debounced config saver — pure TypeScript, no framework dependency.
 *
 * Creates a saver that merges partial config updates and writes them
 * to the config service after a debounce delay (default 300ms).
 * This matches the design doc requirement: "every change is persisted
 * immediately" with debouncing to avoid excessive writes.
 */

import type { ConfigManager, AppConfigRow } from "@marketsui/config-service";

/** The saver interface returned by createDebouncedSaver. */
export interface DebouncedSaver<T> {
  /** Queue a partial config update. Debounced — only the last call within the window fires. */
  save: (partial: Partial<T>) => void;
  /** Flush any pending save immediately. Call this on close-requested. */
  flush: () => Promise<void>;
  /** Cancel any pending save without writing. Call this on unmount if no save needed. */
  cancel: () => void;
}

/**
 * Options for `createDebouncedSaver()`. All optional.
 */
export interface DebouncedSaverOptions {
  /** Debounce window in ms. Default 300. */
  debounceMs?: number;
  /**
   * Set `isRegisteredComponent: true` on every persisted row. Pass when
   * the saver is wired to a singleton's row (instanceId ===
   * templateId === registry entry's configId) so workspace GC keeps
   * the row alive across launches even when no workspace references it.
   *
   * Default false — per-instance clones don't get the flag and are
   * reaped if orphaned.
   */
  isRegisteredComponent?: boolean;
}

/**
 * Create a debounced saver for a component's config.
 *
 * @param instanceId - The config ID to save under
 * @param configManager - The ConfigManager instance
 * @param getRow - A function returning the current AppConfigRow (kept as a getter
 *                 so the saver always has the latest row reference)
 * @param debounceMsOrOptions - Either a debounce-ms number (legacy
 *                              two-arg-plus-number form) or an options
 *                              object. Object form is preferred going forward.
 */
export function createDebouncedSaver<T>(
  instanceId: string,
  configManager: ConfigManager,
  getRow: () => AppConfigRow | null,
  debounceMsOrOptions: number | DebouncedSaverOptions = 300,
): DebouncedSaver<T> {
  // Back-compat: accept a bare number (legacy callers) or an options object.
  const opts: DebouncedSaverOptions = typeof debounceMsOrOptions === "number"
    ? { debounceMs: debounceMsOrOptions }
    : debounceMsOrOptions;
  const debounceMs = opts.debounceMs ?? 300;
  const flagAsRegistered = opts.isRegisteredComponent === true;

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let pendingConfig: Partial<T> | null = null;

  async function doSave(): Promise<void> {
    // Capture and clear pendingConfig before the async write.
    // This prevents a concurrent save() call from losing data —
    // new partials accumulate into a fresh pendingConfig while
    // the write is in flight.
    const snapshot = pendingConfig;
    pendingConfig = null;

    const row = getRow();
    if (!row || !snapshot) return;

    const updated: AppConfigRow = {
      ...row,
      configId: instanceId,
      payload: { ...(row.payload as Record<string, unknown>), ...snapshot },
      updatedTime: new Date().toISOString(),
      // Preserve any pre-existing flag from the row, but force it on
      // when the caller declared this is a registered-component saver.
      // Never silently flip it off — if the row already has it, keep it.
      isRegisteredComponent: flagAsRegistered ? true : row.isRegisteredComponent,
    };

    try {
      await configManager.saveConfig(updated);
    } catch (err) {
      console.error("Failed to save component config:", err);
    }
  }

  return {
    save(partial: Partial<T>): void {
      // Accumulate partial updates
      pendingConfig = pendingConfig ? { ...pendingConfig, ...partial } : { ...partial };

      // Reset the debounce timer
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = null;
        doSave();
      }, debounceMs);
    },

    async flush(): Promise<void> {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (pendingConfig) {
        await doSave();
      }
    },

    cancel(): void {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      pendingConfig = null;
    },
  };
}
