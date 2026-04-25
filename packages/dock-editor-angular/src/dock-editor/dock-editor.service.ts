/**
 * DockEditorService
 *
 * Angular equivalent of the React `useDockEditor` hook.
 * Manages the dock button configuration state and handles
 * saving, loading, and publishing changes to the dock.
 *
 * Use Angular's inject() or constructor injection to get this service.
 * It is provided at the component level (not root) so each dock editor
 * window gets its own instance.
 */

import { Injectable, signal, computed, OnDestroy } from '@angular/core';
import {
  loadDockConfig,
  saveDockConfig,
  clearDockConfig,
  loadRegistryConfig,
  IAB_DOCK_CONFIG_UPDATE,
  IAB_REGISTRY_CONFIG_UPDATE,
  type ConfigScope,
  type DockEditorConfig,
  type DockButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
  type RegistryEditorConfig,
  type RegistryEntry,
} from '@marketsui/openfin-platform';

// Version number embedded in every saved config.
// If the config format ever changes in a breaking way, bump this number.
const CONFIG_VERSION = 1;

// ─── State ─────────────────────────────────────────────────────────

interface EditorState {
  buttons: DockButtonConfig[];
  isDirty: boolean;
  isLoading: boolean;
}

// ─── Helper functions ───────────────────────────────────────────────

/**
 * Move an item in an array from one index to another.
 * Returns a new array — the original is not modified.
 */
function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...list];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Recursively update menu items nested inside a dropdown.
 * Used when an action targets a nested sub-menu item.
 */
function updateMenuItemsRecursive(
  items: DockMenuItemConfig[],
  updater: (items: DockMenuItemConfig[]) => DockMenuItemConfig[],
  parentItemId?: string,
): DockMenuItemConfig[] {
  if (!parentItemId) {
    return updater(items);
  }
  return items.map((item) => {
    if (item.id === parentItemId) {
      return { ...item, options: updater(item.options ?? []) };
    }
    if (item.options?.length) {
      return {
        ...item,
        options: updateMenuItemsRecursive(item.options, updater, parentItemId),
      };
    }
    return item;
  });
}

// ─── Service ────────────────────────────────────────────────────────

@Injectable()
export class DockEditorService implements OnDestroy {
  // ── Reactive state using Angular signals ──────────────────────────
  // Signals automatically notify Angular's change detection when updated.
  private readonly _buttons = signal<DockButtonConfig[]>([]);
  private readonly _isDirty = signal(false);
  private readonly _isLoading = signal(true);
  /**
   * Live Component-Registry entries. Populated on mount and refreshed
   * on `IAB_REGISTRY_CONFIG_UPDATE`. Bound by the menu-item form's
   * "Launch registered component" dropdown.
   */
  private readonly _registryEntries = signal<RegistryEntry[]>([]);

  // Public read-only computed signals for template binding
  readonly buttons = computed(() => this._buttons());
  readonly isDirty = computed(() => this._isDirty());
  readonly isLoading = computed(() => this._isLoading());
  readonly registryEntries = computed(() => this._registryEntries());

  /** Unsubscribe fn for the registry-update IAB subscription; null outside OpenFin. */
  private unsubscribeRegistry: (() => void) | null = null;

  /**
   * Scope under which this service persists config. Null = default
   * (`appId: 'system'`, `userId: 'system'`) — historical global-
   * singleton behaviour. Host apps can call `setScope(...)` before
   * any save/load to persist per-user/per-app.
   */
  private scope: ConfigScope | undefined;

  /** Set the persistence scope. Must be called before any save/load. */
  setScope(scope: ConfigScope | undefined): void {
    this.scope = scope;
  }

  constructor() {
    this.loadInitialConfig();
    this.loadRegistryAndSubscribe();
  }

  ngOnDestroy(): void {
    // Release the registry IAB subscription. Signals are garbage
    // collected automatically.
    this.unsubscribeRegistry?.();
    this.unsubscribeRegistry = null;
  }

  // ── Initialisation ──────────────────────────────────────────────

  /** Load the saved dock config from IndexedDB on first use. */
  private async loadInitialConfig(): Promise<void> {
    try {
      const saved = await loadDockConfig(this.scope);
      if (saved) {
        this._buttons.set(saved.buttons);
      } else {
        this._buttons.set([]);
      }
    } catch (err) {
      console.error('DockEditorService: Failed to load dock config:', err);
      this._buttons.set([]);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load the current Component-Registry entries and subscribe to
   * updates. The dock editor's menu-item form consumes
   * `registryEntries()` when rendering the "Launch registered
   * component" dropdown. Updates from a separate registry-editor
   * window arrive via OpenFin IAB so the dropdown stays fresh
   * without a reload.
   */
  private async loadRegistryAndSubscribe(): Promise<void> {
    try {
      const reg = await loadRegistryConfig(this.scope);
      this._registryEntries.set(reg?.entries ?? []);
    } catch (err) {
      console.warn('DockEditorService: Failed to load registry', err);
    }
    try {
      const finRef = (globalThis as unknown as { fin?: { InterApplicationBus?: {
        subscribe: (ident: { uuid: string }, topic: string, handler: (msg: RegistryEditorConfig) => void) => void;
        unsubscribe: (ident: { uuid: string }, topic: string, handler: (msg: RegistryEditorConfig) => void) => void;
      }}}).fin;
      if (finRef?.InterApplicationBus?.subscribe) {
        const handler = (msg: RegistryEditorConfig): void => {
          this._registryEntries.set(msg?.entries ?? []);
        };
        finRef.InterApplicationBus.subscribe({ uuid: '*' }, IAB_REGISTRY_CONFIG_UPDATE, handler);
        this.unsubscribeRegistry = () => {
          try {
            finRef.InterApplicationBus!.unsubscribe({ uuid: '*' }, IAB_REGISTRY_CONFIG_UPDATE, handler);
          } catch { /* best-effort */ }
        };
      }
    } catch (err) {
      console.warn('DockEditorService: registry IAB subscribe failed', err);
    }
  }

  // ── Button mutations ────────────────────────────────────────────

  /** Add a new top-level dock button. */
  addButton(button: DockButtonConfig): void {
    this._buttons.update((btns) => [...btns, button]);
    this._isDirty.set(true);
  }

  /** Replace an existing button by its id. */
  updateButton(id: string, button: DockButtonConfig): void {
    this._buttons.update((btns) =>
      btns.map((b) => (b.id === id ? button : b)),
    );
    this._isDirty.set(true);
  }

  /** Remove a button by its id. */
  removeButton(id: string): void {
    this._buttons.update((btns) => btns.filter((b) => b.id !== id));
    this._isDirty.set(true);
  }

  /** Swap two buttons in the list (for reordering). */
  reorderButtons(fromIndex: number, toIndex: number): void {
    this._buttons.update((btns) => reorder(btns, fromIndex, toIndex));
    this._isDirty.set(true);
  }

  /** Replace the full button list (e.g. after an import). */
  setButtons(buttons: DockButtonConfig[]): void {
    this._buttons.set(buttons);
    this._isDirty.set(false);
  }

  // ── Menu item mutations ─────────────────────────────────────────

  /** Add a menu item to a dropdown button's options list. */
  addMenuItem(
    buttonId: string,
    item: DockMenuItemConfig,
    parentItemId?: string,
  ): void {
    this._buttons.update((btns) =>
      btns.map((b) => {
        if (b.id !== buttonId || b.type !== 'DropdownButton') return b;
        const dropdown = b as DockDropdownButtonConfig;
        const newOptions = updateMenuItemsRecursive(
          dropdown.options,
          (items) => [...items, item],
          parentItemId,
        );
        return { ...dropdown, options: newOptions };
      }),
    );
    this._isDirty.set(true);
  }

  /** Update an existing menu item inside a dropdown. */
  updateMenuItem(
    buttonId: string,
    itemId: string,
    item: DockMenuItemConfig,
    parentItemId?: string,
  ): void {
    this._buttons.update((btns) =>
      btns.map((b) => {
        if (b.id !== buttonId || b.type !== 'DropdownButton') return b;
        const dropdown = b as DockDropdownButtonConfig;
        const updater = (items: DockMenuItemConfig[]) =>
          items.map((i) => (i.id === itemId ? item : i));
        const newOptions = updateMenuItemsRecursive(
          dropdown.options,
          updater,
          parentItemId,
        );
        return { ...dropdown, options: newOptions };
      }),
    );
    this._isDirty.set(true);
  }

  /** Remove a menu item from a dropdown. */
  removeMenuItem(
    buttonId: string,
    itemId: string,
    parentItemId?: string,
  ): void {
    this._buttons.update((btns) =>
      btns.map((b) => {
        if (b.id !== buttonId || b.type !== 'DropdownButton') return b;
        const dropdown = b as DockDropdownButtonConfig;
        const updater = (items: DockMenuItemConfig[]) =>
          items.filter((i) => i.id !== itemId);
        const newOptions = updateMenuItemsRecursive(
          dropdown.options,
          updater,
          parentItemId,
        );
        return { ...dropdown, options: newOptions };
      }),
    );
    this._isDirty.set(true);
  }

  // ── Persistence ─────────────────────────────────────────────────

  /** Save to IndexedDB and push to the live dock via IAB. */
  async save(): Promise<void> {
    const config = this.buildConfig();
    await saveDockConfig(config, this.scope);
    await this.publishConfig(config);
    this._isDirty.set(false);
    console.log('DockEditorService: Config saved.');
  }

  /** Clear saved config and reset to empty state. */
  async reset(): Promise<void> {
    await clearDockConfig(this.scope);
    this._buttons.set([]);
    this._isDirty.set(false);
  }

  /** Push the current config to the dock without saving to IndexedDB. */
  async preview(): Promise<void> {
    await this.publishConfig(this.buildConfig());
  }

  // ── Internal ────────────────────────────────────────────────────

  /** Build a serialisable config snapshot from current state. */
  private buildConfig(): DockEditorConfig {
    return {
      version: CONFIG_VERSION,
      buttons: this._buttons(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Publish the config to the dock via OpenFin InterApplicationBus.
   * The dock provider subscribes to this topic and updates its buttons.
   */
  private async publishConfig(config: DockEditorConfig): Promise<void> {
    try {
      const fin = (window as any).fin;
      if (typeof fin !== 'undefined') {
        await fin.InterApplicationBus.publish(IAB_DOCK_CONFIG_UPDATE, config);
      }
    } catch (err) {
      console.warn('DockEditorService: Failed to publish config via IAB.', err);
    }
  }
}
