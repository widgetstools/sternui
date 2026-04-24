import type { ConfigClient, AppConfigRow } from '@marketsui/config-service';
import type { LayoutInfo } from '@marketsui/shared-types';

/**
 * Layout helpers — layouts are regular configs with
 * `componentType: 'simple-blotter-layout'` and a
 * `{ parentConfigId, state, isDefault }` payload. The unified schema
 * has no parent/child relationship, so the parent pointer lives inside
 * the payload.
 *
 * These are pure functions over a `ConfigClient`; no state of their own.
 */

const LAYOUT_COMPONENT_TYPE = 'simple-blotter-layout';

function toLayoutInfo(row: AppConfigRow, parentConfigId: string): LayoutInfo {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  return {
    id: row.configId,
    name: row.displayText,
    configId: parentConfigId,
    isDefault: Boolean(p.isDefault),
    state: (p.state ?? {}) as Record<string, unknown>,
    createdAt: row.creationTime,
    updatedAt: row.updatedTime,
  };
}

export async function getLayouts(
  client: ConfigClient,
  parentConfigId: string,
): Promise<LayoutInfo[]> {
  const all = await client.findByComponentType(LAYOUT_COMPONENT_TYPE);
  return all
    .filter((c) => {
      const p = c.payload as Record<string, unknown> | null | undefined;
      return p && p.parentConfigId === parentConfigId;
    })
    .map((c) => toLayoutInfo(c, parentConfigId));
}

export async function saveLayout(
  client: ConfigClient,
  parentConfigId: string,
  name: string,
  state: unknown,
  userId: string,
  appId: string,
): Promise<LayoutInfo> {
  const created = await client.createConfig({
    configId: crypto.randomUUID(),
    appId,
    userId,
    componentType: LAYOUT_COMPONENT_TYPE,
    componentSubType: '',
    isTemplate: false,
    displayText: name,
    payload: { parentConfigId, state, isDefault: false },
    createdBy: userId,
    updatedBy: userId,
  });
  return toLayoutInfo(created, parentConfigId);
}

export async function loadLayout(client: ConfigClient, layoutId: string): Promise<unknown> {
  const row = await client.getConfig(layoutId);
  if (!row) return null;
  const p = row.payload as Record<string, unknown> | null | undefined;
  return p?.state ?? null;
}

export async function deleteLayout(client: ConfigClient, layoutId: string): Promise<void> {
  await client.deleteConfig(layoutId);
}
