/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { Injectable, signal, computed } from '@angular/core';
import {
  loadRegistryConfig,
  saveRegistryConfig,
  clearRegistryConfig,
  IAB_REGISTRY_CONFIG_UPDATE,
  generateTemplateConfigId,
  type RegistryEditorConfig,
  type RegistryEntry,
} from '@markets/openfin-workspace';

const CONFIG_VERSION = 1;

@Injectable()
export class RegistryEditorService {
  private _entries = signal<RegistryEntry[]>([]);
  private _isDirty = signal(false);
  private _isLoading = signal(true);

  readonly entries = computed(() => this._entries());
  readonly isDirty = computed(() => this._isDirty());
  readonly isLoading = computed(() => this._isLoading());
  readonly entryCount = computed(() => this._entries().length);

  async init(): Promise<void> {
    try {
      const saved = await loadRegistryConfig();
      this._entries.set(saved ? saved.entries : []);
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
      version: CONFIG_VERSION,
      entries: this._entries(),
    };
    await saveRegistryConfig(config);
    await this.publishConfig(config);
    this._isDirty.set(false);
    console.log('Registry config saved.');
  }

  async reset(): Promise<void> {
    await clearRegistryConfig();
    this._entries.set([]);
    this._isDirty.set(false);
  }

  async testComponent(entry: RegistryEntry): Promise<void> {
    try {
      if (typeof fin === 'undefined') {
        window.open(entry.hostUrl, '_blank');
        return;
      }

      // Pass customData so the component-host can resolve identity.
      // The launched view reads this via readCustomData() to load its config.
      const instanceId = crypto.randomUUID();
      const templateId = entry.configId || generateTemplateConfigId(
        entry.componentType,
        entry.componentSubType,
      );

      const platform = fin.Platform.getCurrentSync();
      await platform.createView({
        url: entry.hostUrl,
        customData: {
          instanceId,
          templateId,
          componentType: entry.componentType,
          componentSubType: entry.componentSubType,
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
