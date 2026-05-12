import type { LayoutSnapshot, StorageAdapter } from './StorageAdapter';

/** In-memory storage. Tests and hosts that don't need durability. */
export class MemoryAdapter implements StorageAdapter {
  private layouts = new Map<string, LayoutSnapshot>();
  private gridLevelData = new Map<string, unknown>();

  private key(gridId: string, id: string): string {
    return `${gridId}::${id}`;
  }

  async loadLayout(gridId: string, id: string): Promise<LayoutSnapshot | null> {
    return this.layouts.get(this.key(gridId, id)) ?? null;
  }

  async saveLayout(snapshot: LayoutSnapshot): Promise<void> {
    this.layouts.set(this.key(snapshot.gridId, snapshot.id), snapshot);
  }

  async deleteLayout(gridId: string, id: string): Promise<void> {
    this.layouts.delete(this.key(gridId, id));
  }

  async listLayouts(gridId: string): Promise<LayoutSnapshot[]> {
    const out: LayoutSnapshot[] = [];
    const prefix = `${gridId}::`;
    for (const [k, v] of this.layouts) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }

  async loadGridLevelData(gridId: string): Promise<unknown | null> {
    return this.gridLevelData.has(gridId) ? this.gridLevelData.get(gridId) : null;
  }

  async saveGridLevelData(gridId: string, data: unknown): Promise<void> {
    this.gridLevelData.set(gridId, data);
  }
}
