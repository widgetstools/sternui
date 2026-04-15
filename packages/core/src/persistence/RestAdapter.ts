import type { GridConfig } from '../types/profile';
import { BaseStorageAdapter } from './BaseStorageAdapter';

export interface RestAdapterOptions {
  /** Base URL of the API root, e.g. `https://api.example.com` */
  baseUrl: string;
  /** Optional auth-aware header builder. Defaults to JSON content type only. */
  getHeaders?: () => Record<string, string>;
}

/**
 * REST adapter expects the server to expose a per-grid resource:
 *   GET    /grids/:gridId           → GridConfig (404 → null)
 *   PUT    /grids/:gridId           → save GridConfig
 *   DELETE /grids/:gridId           → drop GridConfig
 *   GET    /grids                   → string[] gridIds
 *
 * All per-profile operations are derived client-side from these four endpoints
 * via BaseStorageAdapter, keeping the HTTP surface tiny.
 */
export class RestAdapter extends BaseStorageAdapter {
  private baseUrl: string;
  private getHeaders: () => Record<string, string>;

  constructor(options: RestAdapterOptions) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getHeaders = options.getHeaders ?? (() => ({ 'Content-Type': 'application/json' }));
  }

  async loadGridConfig(gridId: string): Promise<GridConfig | null> {
    const res = await fetch(`${this.baseUrl}/grids/${encodeURIComponent(gridId)}`, {
      headers: this.getHeaders(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async saveGridConfig(config: GridConfig): Promise<void> {
    const res = await fetch(`${this.baseUrl}/grids/${encodeURIComponent(config.gridId)}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  async deleteGridConfig(gridId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/grids/${encodeURIComponent(gridId)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  async listGridIds(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/grids`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
  }
}
