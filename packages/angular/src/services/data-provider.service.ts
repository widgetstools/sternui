import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import type { DataProviderConfig } from '@marketsui/shared-types';
import { DataProviderConfigService } from '@marketsui/widgets-react';

@Injectable({ providedIn: 'root' })
export class DataProviderService {
  private svc = new DataProviderConfigService();

  configure(options: { apiUrl: string }): void {
    this.svc.configure(options);
  }

  getAll(userId: string): Observable<DataProviderConfig[]> {
    return from(this.svc.getByUser(userId));
  }

  create(provider: DataProviderConfig, userId: string): Observable<DataProviderConfig> {
    return from(this.svc.create(provider, userId));
  }

  update(providerId: string, updates: Partial<DataProviderConfig>, userId: string): Observable<DataProviderConfig> {
    return from(this.svc.update(providerId, updates, userId));
  }

  delete(providerId: string): Observable<void> {
    return from(this.svc.delete(providerId));
  }
}
