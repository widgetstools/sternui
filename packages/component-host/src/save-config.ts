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
 * Create a debounced saver for a component's config.
 *
 * @param instanceId - The config ID to save under
 * @param configManager - The ConfigManager instance
 * @param getRow - A function returning the current AppConfigRow (kept as a getter
 *                 so the saver always has the latest row reference)
 * @param debounceMs - Debounce delay in milliseconds (default 300)
 */
export function createDebouncedSaver<T>(
  instanceId: string,
  configManager: ConfigManager,
  getRow: () => AppConfigRow | null,
  debounceMs = 300,
): DebouncedSaver<T> {
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
      config: { ...row.config, ...snapshot },
      updatedAt: new Date().toISOString(),
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
