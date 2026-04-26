/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { Injectable, signal, computed } from '@angular/core';
import {
  loadRegistryConfig,
  saveRegistryConfig,
  clearRegistryConfig,
  IAB_REGISTRY_CONFIG_UPDATE,
  generateTemplateConfigId,
  migrateRegistryToV2,
  readHostEnv,
  resolveHostUrl,
  REGISTRY_CONFIG_VERSION,
  type ConfigScope,
  type RegistryEditorConfig,
  type RegistryEntry,
  type HostEnv,
} from '@marketsui/openfin-platform';

@Injectable()
export class RegistryEditorService {
  private _entries = signal<RegistryEntry[]>([]);
  private _isDirty = signal(false);
  private _isLoading = signal(true);
  private _hostEnv = signal<HostEnv>({ appId: '', configServiceUrl: '' });

  readonly entries = computed(() => this._entries());
  readonly isDirty = computed(() => this._isDirty());
  readonly isLoading = computed(() => this._isLoading());
  readonly entryCount = computed(() => this._entries().length);
  readonly hostEnv = computed(() => this._hostEnv());

  /**
   * Persistence scope. Undefined = historical global-singleton
   * behaviour (`appId: 'system'`, `userId: 'system'`). Host apps
   * that want per-user/per-app registries call `setScope(...)` before
   * `init()` / `save()`.
   */
  private scope: ConfigScope | undefined;

  setScope(scope: ConfigScope | undefined): void {
    this.scope = scope;
  }

  async init(): Promise<void> {
    try {
      const env = await readHostEnv();
      this._hostEnv.set(env);

      const saved = await loadRegistryConfig(this.scope);
      const migrated = migrateRegistryToV2(saved as RegistryEditorConfig | null, env);
      this._entries.set(migrated.entries);
    } catch (err) {
      console.error('Failed to load registry config:', err);
      this._entries.set([]);
    } finally {
      this._isLoading.set(false);
    }
  }

  addEntry(entry: RegistryEntry): void {
    this._entries.update((entries) => [...entries, entry]);
    this._isDirty.set(true);
  }

  updateEntry(id: string, entry: RegistryEntry): void {
    this._entries.update((entries) => entries.map((e) => (e.id === id ? entry : e)));
    this._isDirty.set(true);
  }

  removeEntry(id: string): void {
    this._entries.update((entries) => entries.filter((e) => e.id !== id));
    this._isDirty.set(true);
  }

  async save(): Promise<void> {
    const config: RegistryEditorConfig = {
      version: REGISTRY_CONFIG_VERSION,
      entries: this._entries(),
    };
    await saveRegistryConfig(config, this.scope);
    await this.publishConfig(config);
    this._isDirty.set(false);
    console.log('Registry config saved.');
  }

  async reset(): Promise<void> {
    await clearRegistryConfig(this.scope);
    this._entries.set([]);
    this._isDirty.set(false);
  }

  async testComponent(entry: RegistryEntry): Promise<void> {
    try {
      // Normalise host-relative paths against the editor's own origin
      // before launching. OpenFin's createView requires an absolute URL.
      const resolvedUrl = resolveHostUrl(entry.hostUrl);

      if (typeof fin === 'undefined') {
        window.open(resolvedUrl, '_blank');
        return;
      }

      const instanceId = crypto.randomUUID();
      const templateId = entry.configId || generateTemplateConfigId(
        entry.componentType,
        entry.componentSubType,
      );

      const platform = fin.Platform.getCurrentSync();
      await platform.createView({
        url: resolvedUrl,
        customData: {
          instanceId,
          templateId,
          componentType: entry.componentType,
          componentSubType: entry.componentSubType,
          // v2: forward the effective appId + configServiceUrl (may be
          // host's values or the entry's own, depending on usesHostConfig).
          appId: entry.appId,
          configServiceUrl: entry.configServiceUrl,
        },
      });
    } catch (err) {
      console.warn('Failed to launch test component:', err);
    }
  }

  private async publishConfig(config: RegistryEditorConfig): Promise<void> {
    try {
      if (typeof fin !== 'undefined') {
        await fin.InterApplicationBus.publish(IAB_REGISTRY_CONFIG_UPDATE, config);
      }
    } catch (err) {
      console.warn('Failed to publish registry config update:', err);
    }
  }
}
