import type { ConfigRow, ConfigService, ConfigQuery, SaveInput, UnifiedConfig } from '@stern/shared-types';
import { IndexedDBConfigService } from './IndexedDBConfigService.js';

// ============================================================================
// Mapping helpers — ConfigRow ↔ UnifiedConfig (existing server schema)
// ============================================================================

function toServerPayload(row: ConfigRow): Partial<UnifiedConfig> {
  return {
    configId: row.id,
    appId: row.appId,
    componentType: row.configType,
    componentSubType: row.configSubType,
    rowKind: row.type,
    name: row.id,             // use deterministic id as name for uniqueness
    config: row.config,
    settings: [],
    activeSetting: 'default',
    createdBy: row.createdBy,
    lastUpdatedBy: row.updatedBy,
    userId: row.createdBy,
  };
}

function fromServerPayload(data: UnifiedConfig): ConfigRow {
  return {
    id: data.configId,
    appId: data.appId,
    configType: data.componentType,
    configSubType: data.componentSubType ?? '',
    type: (data.rowKind as ConfigRow['type']) ?? 'instance',
    config: data.config,
    createdBy: data.createdBy,
    updatedBy: data.lastUpdatedBy,
    updatedAt: data.lastUpdated instanceof Date
      ? data.lastUpdated.getTime()
      : typeof data.lastUpdated === 'number'
        ? data.lastUpdated
        : Date.now(),
  };
}

// ============================================================================
// RestConfigService — writes local first, REST fire-and-forget
// ============================================================================

export class RestConfigService implements ConfigService {
  private local: IndexedDBConfigService;
  private pending: Map<string, ConfigRow> = new Map();

  constructor(
    private baseUrl: string,
    appId: string,
    userId: string,
  ) {
    this.local = new IndexedDBConfigService(appId, userId, 'marketsui-mirror');
  }

  async get(id: string): Promise<ConfigRow | null> {
    const cached = await this.local.get(id);
    // refresh mirror in background — do not block the caller
    this.fetchRemote(id)
      .then((row) => row && this.local.save({ ...row, id: row.id }))
      .catch(() => {});
    return cached;
  }

  async save(input: SaveInput): Promise<ConfigRow> {
    const full = await this.local.save(input); // local first, never throws
    this.pushRemote(full);                     // fire-and-forget
    return full;
  }

  async list(q: ConfigQuery): Promise<ConfigRow[]> {
    return this.local.list(q);
  }

  async delete(id: string): Promise<void> {
    await this.local.delete(id);
    fetch(`${this.baseUrl}/configurations/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async clone(sourceId: string, newId: string): Promise<ConfigRow> {
    return this.local.clone(sourceId, newId);
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private async pushRemote(row: ConfigRow): Promise<void> {
    // flush any pending rows first (preserve order)
    for (const [, pending] of this.pending) {
      try {
        await this.putRemote(pending);
        this.pending.delete(pending.id);
      } catch {
        break; // stop on first failure
      }
    }
    try {
      await this.putRemote(row);
    } catch {
      this.pending.set(row.id, row);
    }
  }

  private async putRemote(row: ConfigRow): Promise<void> {
    const payload = toServerPayload(row);
    // Try PUT first (upsert); create via POST if not found
    const res = await fetch(`${this.baseUrl}/configurations/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) {
      const createRes = await fetch(`${this.baseUrl}/configurations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) throw new Error(`REST POST failed: ${createRes.status}`);
      return;
    }
    if (!res.ok) throw new Error(`REST PUT failed: ${res.status}`);
  }

  private async fetchRemote(id: string): Promise<ConfigRow | null> {
    try {
      const res = await fetch(`${this.baseUrl}/configurations/${id}`);
      if (!res.ok) return null;
      const data: UnifiedConfig = await res.json();
      return fromServerPayload(data);
    } catch {
      return null;
    }
  }
}
