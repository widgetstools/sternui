/**
 * Internal types for the WorkspaceSetup editor's three-pane layout.
 *
 * These types describe the SELECTION model the panes share — when a
 * component row is clicked in pane ① it becomes the inspector's
 * subject in pane ③; when a dock node is clicked in pane ② it
 * becomes the inspector's subject instead. The InspectorPane
 * reads `selection` and renders the appropriate form.
 */

import type { RegistryEntry } from '@marketsui/openfin-platform/config';

/** What's currently selected across the editor — drives Inspector pane content. */
export type EditorSelection =
  | { kind: 'none' }
  | { kind: 'component'; entryId: string }
  | { kind: 'dock-item'; itemId: string };

/** Filter chips along the top of the Components pane. */
export type ComponentFilter = 'all' | 'in-dock' | 'not-in-dock' | 'singleton';

/**
 * A blank registry entry suitable for "+ New".
 *
 * The `id` and `configId` start as empty strings — they get
 * computed from `componentType` + `componentSubType` via
 * `deriveTemplateConfigId` as soon as the user types either of
 * those fields in the Inspector pane (see InspectorPane's
 * `handleTypeChange`). The user CANNOT save with empty type/subtype
 * (validation rejects it), so by the time the entry is persisted
 * the id is always the canonical `${componentType}-${componentSubType}`.
 *
 * Why not seed a UUID up front and let it be overwritten on first
 * typeChange? Because if the user never changes type/subtype (rare,
 * but possible in QA workflows), the UUID would silently survive
 * into the persisted entry — which is the bug we kept hitting.
 * Empty strings make the broken state visible.
 */
export function newDraftEntry(env: { appId: string; configServiceUrl: string }): RegistryEntry {
  return {
    id: '',
    hostUrl: '',
    iconId: '',
    componentType: '',
    componentSubType: '',
    configId: '',
    displayName: 'New Component',
    createdAt: new Date().toISOString(),
    type: 'internal',
    usesHostConfig: true,
    appId: env.appId,
    configServiceUrl: env.configServiceUrl,
    singleton: false,
  };
}
