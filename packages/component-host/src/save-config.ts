/**
 * Debounced config saver — pure TypeScript, no framework dependency.
 *
 * Creates a saver that merges partial config updates and writes them
 * to the config service after a debounce delay (default 300ms).
 * This matches the design doc requirement: "every change is persisted
 * immediately" with debouncing to avoid excessive writes.
 */

import type { ConfigManager, AppConfigRow } from "@marketsui/config-service";
import type { ComponentIdentity } from "./types";

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
   * @deprecated The saver now reads identity directly and writes
   * `isTemplate` from `identity.isTemplate`; the back-compat
   * `isRegisteredComponent` flag is set to the same value
   * automatically. Setting this option no longer has any effect on
   * its own; identity is the source of truth.
   */
  isRegisteredComponent?: boolean;
}

/**
 * Create a debounced saver for a component's config.
 *
 * The saver enforces three identity-bound attributes on EVERY write:
 *   • `componentType`   — exactly the registered component's value
 *   • `componentSubType` — exactly the registered component's value
 *   • `isTemplate`       — `true` for test-launches, `false` otherwise
 *
 * This guarantees that the row keyed by
 * `${componentType}-${componentSubType}` (the test-launch case)
 * always lands as the canonical template row, and per-instance rows
 * inherit the registered type/subtype regardless of which payload the
 * user happened to send first.
 *
 * @param identity      - Resolved ComponentIdentity (instanceId,
 *                        componentType, etc.) — read at construction
 *                        time, applied to every persisted row.
 * @param configManager - The ConfigManager instance.
 * @param getRow        - Getter returning the current AppConfigRow, or
 *                        null when no row exists yet (first-save
 *                        of a never-before-persisted config — e.g. the
 *                        very first test launch with no prior template).
 * @param options       - Debounce + back-compat flag options.
 */
export function createDebouncedSaver<T>(
  identity: ComponentIdentity,
  configManager: ConfigManager,
  getRow: () => AppConfigRow | null,
  options: DebouncedSaverOptions = {},
): DebouncedSaver<T> {
  const debounceMs = options.debounceMs ?? 300;

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let pendingConfig: Partial<T> | null = null;

  async function doSave(): Promise<void> {
    // Capture and clear pendingConfig before the async write.
    // This prevents a concurrent save() call from losing data —
    // new partials accumulate into a fresh pendingConfig while
    // the write is in flight.
    const snapshot = pendingConfig;
    pendingConfig = null;
    if (!snapshot) return;

    const row = getRow();
    const now = new Date().toISOString();
    const isTemplate = identity.isTemplate === true;

    // Common fields enforced from identity — these MUST match the
    // registered component on every save. Per the contract: if the
    // launch was a test-launch, isTemplate is true and configId is
    // `${type}-${subtype}`; otherwise it's a per-instance row with a
    // UUID configId, but componentType + componentSubType still
    // mirror the registered component's values.
    const enforced = {
      configId: identity.instanceId,
      componentType: identity.componentType,
      componentSubType: identity.componentSubType,
      isTemplate,
      singleton: identity.singleton ?? false,
      // Back-compat flag — kept aligned with isTemplate while the
      // field is still on the schema. Will be removed in a future
      // schema bump (see config-service/src/types.ts).
      isRegisteredComponent: isTemplate,
      updatedTime: now,
    };

    let updated: AppConfigRow;
    let mode: "merge-existing" | "build-fresh";
    if (row) {
      mode = "merge-existing";
      // Existing row — merge the partial into its payload.
      updated = {
        ...row,
        ...enforced,
        payload: { ...(row.payload as Record<string, unknown>), ...snapshot },
      };
    } else {
      mode = "build-fresh";
      // No prior row — materialise a fresh AppConfigRow from
      // identity. This is the first-save-of-a-never-before-persisted
      // config path, hit by the test-launch scenario when no
      // template existed yet for this (componentType, componentSubType).
      const appId = identity.appId ?? "";
      const userId = identity.userId ?? "";
      updated = {
        ...enforced,
        appId,
        userId,
        displayText: identity.componentType
          + (identity.componentSubType ? ` · ${identity.componentSubType}` : ""),
        payload: snapshot as unknown as Record<string, unknown>,
        createdBy: userId,
        updatedBy: userId,
        creationTime: now,
      };
    }

    // Single-line trace of every persisted row so you can confirm in
    // the page console (no IndexedDB poke required) that the enforced
    // identity fields landed correctly. Particularly useful when
    // chasing the test-launch contract:
    //   configId === ${componentType}-${componentSubType}
    //   isTemplate === true
    //   componentType / componentSubType match the registered entry.
    /* eslint-disable no-console */
    console.log(
      `[component-host/save] %c${mode}%c configId=%s componentType=%s componentSubType=%s isTemplate=%s singleton=%s payloadKeys=%d`,
      mode === "build-fresh" ? "color:#10b981;font-weight:bold" : "color:#3b82f6", "",
      enforced.configId,
      enforced.componentType,
      enforced.componentSubType,
      enforced.isTemplate,
      enforced.singleton,
      Object.keys(updated.payload as Record<string, unknown>).length,
    );
    /* eslint-enable no-console */

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
