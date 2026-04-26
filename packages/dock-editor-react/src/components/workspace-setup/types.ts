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
 * A blank registry entry suitable for "+ New" — every required field is
 * present with an empty/sensible default so the entry validates as a
 * draft state.
 */
export function newDraftEntry(env: { appId: string; configServiceUrl: string }): RegistryEntry {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `entry-${Date.now()}`,
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
