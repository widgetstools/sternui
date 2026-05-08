import { Injectable, inject } from '@angular/core';
import { from, type Observable } from 'rxjs';
import type { DataProviderConfig } from '@starui/shared-types';
import { DataServicesService } from '@starui/data-services-angular';

/**
 * DataProviderService — Angular surface over the
 * `DataProviderConfigStore` exposed by `DataServicesService`.
 *
 * Consumers must register `provideDataServices({ services })` (from
 * `@starui/data-services-angular`) at the app root. The
 * `DataServicesService` singleton is then injected here automatically.
 *
 * Replaces the v1 `DataProviderConfigService` wrapper that talked to a
 * separate REST/local backend duo. After the data-services redesign,
 * persistence is uniformly `ConfigManager`-backed; mode-switching
 * (Dexie vs REST) is the ConfigManager's concern via the consumer's
 * `bootstrapDataServices({ configManager })` call.
 */
@Injectable({ providedIn: 'root' })
export class DataProviderService {
  private readonly ds = inject(DataServicesService);

  getAll(userId: string): Observable<DataProviderConfig[]> {
    // The editor lists every saved provider for editing — including
    // AppData rows, which the live-stream picker filters out by default.
    return from(this.ds.configStore.list(userId, { includeAppData: true }));
  }

  create(provider: DataProviderConfig, userId: string): Observable<DataProviderConfig> {
    // `save()` generates a providerId when missing, otherwise reuses
    // the existing one — the legacy `create` shape never carried a
    // providerId, so the new path is a clean drop-in.
    return from(this.ds.configStore.save(provider, userId));
  }

  update(
    providerId: string,
    updates: Partial<DataProviderConfig>,
    userId: string,
  ): Observable<DataProviderConfig> {
    return from((async () => {
      const existing = await this.ds.configStore.get(providerId);
      if (!existing) {
        throw new Error(`DataProvider ${providerId} not found`);
      }
      // Merge then save. providerId is stamped from the existing row —
      // updates can't move a row to a different id.
      const merged: DataProviderConfig = { ...existing, ...updates, providerId };
      return this.ds.configStore.save(merged, userId);
    })());
  }

  delete(providerId: string): Observable<void> {
    return from(this.ds.configStore.remove(providerId));
  }
}
