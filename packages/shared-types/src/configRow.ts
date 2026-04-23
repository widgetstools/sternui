/**
 * ConfigService — lean, dual-mode config layer (MarketsUI Lean Spec v1.3).
 *
 * One interface. One table. Four row kinds.
 * IndexedDB in dev (no backend needed). REST + IndexedDB mirror in prod.
 */

// ============================================================================
// Schema
// ============================================================================

export type RowType = 'registration' | 'template' | 'instance' | 'workspace';

export interface ConfigRow {
  // identity
  id: string;           // built by ConfigId factory — never set manually
  appId: string;        // platform instance — every query scoped to this
  configType: string;   // component family — "GRID" | "CHART" | "DOCK" | ...
  configSubType: string;// component variant — "ORDERS" | "FILLS" | ...
  type: RowType;

  // payload — platform never reads inside this
  config: Record<string, unknown>;

  // audit (flat — no wrapper object)
  createdBy: string;    // write-once on first save
  updatedBy: string;    // updated on every write
  updatedAt: number;    // epoch ms — updated on every write
  clonedFrom?: string;  // source id — set on clone, audit only
}

// ============================================================================
// Service inputs / queries
// ============================================================================

/** Callers never set audit fields — the service stamps them. */
export type SaveInput = {
  id?: string;           // omit to auto-derive from configType+configSubType+type
  appId: string;
  configType: string;
  configSubType: string;
  type: RowType;
  config: Record<string, unknown>;
  clonedFrom?: string;   // only passed by clone() internally
};

/** appId always required; all other fields narrow the result set. */
export type ConfigQuery = {
  appId: string;
  type?: RowType;
  configType?: string;
  configSubType?: string;
  idPrefix?: string;     // prefix scan — e.g. "GRID_ORDERS_" for all instances
};

// ============================================================================
// Interface
// ============================================================================

export interface ConfigService {
  get(id: string): Promise<ConfigRow | null>;
  save(input: SaveInput): Promise<ConfigRow>;
  list(query: ConfigQuery): Promise<ConfigRow[]>;
  delete(id: string): Promise<void>;
  clone(sourceId: string, newId: string): Promise<ConfigRow>;
}

// ============================================================================
// ConfigId — deterministic id factory
// ============================================================================

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const ConfigId = {
  registration: (t: string, s: string): string => `REG_${t}_${s}`,
  template:     (t: string, s: string): string => `TMPL_${t}_${s}`,
  instance:     (t: string, s: string): string => `${t}_${s}_${randomUUID()}`,
  workspace:    (): string => `WS_${randomUUID()}`,

  parse(id: string): { kind: RowType; configType: string; configSubType: string } {
    if (id.startsWith('REG_')) {
      const [, t, s] = id.split('_', 3);
      return { kind: 'registration', configType: t, configSubType: s };
    }
    if (id.startsWith('TMPL_')) {
      const [, t, s] = id.split('_', 3);
      return { kind: 'template', configType: t, configSubType: s };
    }
    if (id.startsWith('WS_')) {
      return { kind: 'workspace', configType: 'WORKSPACE', configSubType: 'SNAPSHOT' };
    }
    const [t, s] = id.split('_');
    return { kind: 'instance', configType: t, configSubType: s };
  },
} as const;
