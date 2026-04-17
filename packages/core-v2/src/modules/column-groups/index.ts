import type { GridApi } from 'ag-grid-community';
import type { Module } from '../../core/types';
import { CssInjector } from '../../core/CssInjector';
import {
  INITIAL_COLUMN_GROUPS,
  isColumnGroupsState,
  type ColumnGroupNode,
  type ColumnGroupsState,
} from './state';
import {
  collectGroupIds,
  composeGroups,
  groupHeaderBorderOverlayCSS,
  groupHeaderStyleToCSS,
  hasHeaderBorders,
  hasHeaderStyle,
} from './composeGroups';
import {
  ColumnGroupsEditor,
  ColumnGroupsList,
  ColumnGroupsPanel,
} from './ColumnGroupsPanel';

// ─── Per-grid listener bookkeeping ────────────────────────────────────────
//
// We need to:
//   - Subscribe to AG-Grid's `columnGroupOpened` in `onGridReady` (that's
//     where the `gridApi` becomes available).
//   - Write back into module state from the listener. `GridContext` only
//     exposes `getModuleState`; only `ModuleContext` has `setModuleState`.
//     So we stash the setter in `onRegister` and close it into the listener
//     attached in `onGridReady`.
//   - Detach cleanly on `onGridDestroy`.

interface GridResources {
  setModuleState: <T>(id: string, updater: (prev: T) => T) => void;
  api: GridApi | null;
  handler: ((e: unknown) => void) | null;
  headerCss: CssInjector;
}

const _resources = new Map<string, GridResources>();

/** Walk the authored tree and inject a rule per styled group. Unstyled
 *  groups are skipped so unmodified groups render at theme default. */
function reinjectHeaderCSS(injector: CssInjector, groups: ColumnGroupNode[]): void {
  injector.clear();
  const visit = (node: ColumnGroupNode) => {
    if (hasHeaderStyle(node.headerStyle)) {
      const body = groupHeaderStyleToCSS(node.headerStyle);
      if (body) {
        // Target both the header cell itself AND the inner label container so
        // background + color reach the right element (AG-Grid renders the
        // label inside an inner span; color applies there).
        const css = `.gc-hdr-grp-${node.groupId}, .gc-hdr-grp-${node.groupId} .ag-header-group-cell-label { ${body} }`;
        injector.addRule(`grp-${node.groupId}`, css);
      }
      // Border overlay — emitted as its own rule so the pseudo-element
      // can carry its own `position: absolute` without fighting the body
      // declarations.
      if (hasHeaderBorders(node.headerStyle)) {
        const border = groupHeaderBorderOverlayCSS(`.gc-hdr-grp-${node.groupId}`, node.headerStyle);
        if (border) injector.addRule(`grp-border-${node.groupId}`, border);
      }
    }
    for (const c of node.children) {
      if (c.kind === 'group') visit(c.group);
    }
  };
  for (const g of groups) visit(g);
}

// ─── Listener: AG-Grid 'columnGroupOpened' → store write ──────────────────
//
// The event payload shape (v35) carries a `columnGroup` object whose
// `getGroupId()` and `isExpanded()` methods identify the group and its new
// state. We type-check defensively so a future AG-Grid shape change degrades
// to a no-op rather than a crash.

function handleGroupToggle(
  e: unknown,
  setModuleState: GridResources['setModuleState'],
): void {
  const evt = e as {
    columnGroup?: {
      getGroupId?: () => string | undefined;
      getProvidedColumnGroup?: () => { isExpanded?: () => boolean } | null;
      isExpanded?: () => boolean;
    };
  } | null;

  const cg = evt?.columnGroup;
  if (!cg) return;

  const id = cg.getGroupId?.();
  // `isExpanded` lives on the ProvidedColumnGroup in some AG-Grid builds and
  // directly on the column group in others — try both.
  const isOpen =
    cg.isExpanded?.() ??
    cg.getProvidedColumnGroup?.()?.isExpanded?.();

  if (!id || typeof isOpen !== 'boolean') return;

  setModuleState<ColumnGroupsState>('column-groups', (prev) => {
    // No-op if the stored value already matches — prevents infinite-loop
    // risks from any upstream re-render chain.
    if (prev.openGroupIds[id] === isOpen) return prev;
    return {
      ...prev,
      openGroupIds: { ...prev.openGroupIds, [id]: isOpen },
    };
  });
}

// ─── Module ────────────────────────────────────────────────────────────────

export const columnGroupsModule: Module<ColumnGroupsState> = {
  id: 'column-groups',
  name: 'Column Groups',
  code: '02',
  schemaVersion: 1,
  // After column-customization (10) and calculated-columns (15) — groups
  // should see finalized per-col customizations AND include virtual columns
  // in their children. Before conditional-styling (20) so its rules can
  // target grouped columns.
  priority: 18,

  getInitialState: () => ({
    groups: [],
    openGroupIds: {},
  }),

  onRegister(ctx) {
    // Stash the `setModuleState` closure for later use by the `onGridReady`
    // listener — `GridContext` doesn't expose it directly. Also allocate
    // the per-grid CssInjector for group-header styling.
    _resources.set(ctx.gridId, {
      setModuleState: ctx.setModuleState,
      api: null,
      handler: null,
      headerCss: new CssInjector(ctx.gridId, 'column-groups-headers'),
    });
    // Seed CSS for any groups already in state (e.g. from profile load).
    const state = ctx.getModuleState<ColumnGroupsState>('column-groups');
    const res = _resources.get(ctx.gridId)!;
    reinjectHeaderCSS(res.headerCss, state.groups);
  },

  onGridReady(ctx) {
    const res = _resources.get(ctx.gridId);
    if (!res) return;

    const api = ctx.gridApi;
    const handler = (e: unknown) => handleGroupToggle(e, res.setModuleState);
    try {
      // AG-Grid's addEventListener type is tight; cast at the boundary.
      (api as unknown as { addEventListener: (name: string, fn: (e: unknown) => void) => void })
        .addEventListener('columnGroupOpened', handler);
    } catch {
      return;
    }
    res.api = api;
    res.handler = handler;
  },

  onGridDestroy(ctx) {
    const res = _resources.get(ctx.gridId);
    if (!res) return;
    if (res.api && res.handler) {
      try {
        (res.api as unknown as { removeEventListener: (name: string, fn: (e: unknown) => void) => void })
          .removeEventListener('columnGroupOpened', res.handler);
      } catch {
        /* teardown race — ignore */
      }
    }
    res.headerCss.destroy();
    _resources.delete(ctx.gridId);
  },

  transformColumnDefs(defs, state, ctx) {
    // Keep the <style> tag in lockstep with the current group tree — cheap
    // and matches the conditional-styling / column-customization pattern.
    // Runs before shape-composition so the class selectors exist by the time
    // AG-Grid attaches headerClass.
    const res = _resources.get(ctx.gridId);
    if (res) reinjectHeaderCSS(res.headerCss, state.groups);
    if (state.groups.length === 0) return defs;
    return composeGroups(defs, state.groups, state.openGroupIds);
  },

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!isColumnGroupsState(raw)) {
      return { groups: [], openGroupIds: {} };
    }
    // Prune stale openGroupIds entries whose groupId no longer exists in
    // the tree — stops IndexedDB from growing orphaned entries across
    // rename / delete cycles.
    const valid = collectGroupIds(raw.groups);
    const openGroupIds: Record<string, boolean> = {};
    for (const [id, open] of Object.entries(raw.openGroupIds)) {
      if (valid.has(id) && typeof open === 'boolean') openGroupIds[id] = open;
    }
    return { groups: raw.groups, openGroupIds };
  },

  SettingsPanel: ColumnGroupsPanel,
  ListPane: ColumnGroupsList,
  EditorPane: ColumnGroupsEditor,
};

export { INITIAL_COLUMN_GROUPS } from './state';
export type {
  ColumnGroupsState,
  ColumnGroupNode,
  ColumnGroupChild,
} from './state';
export { composeGroups, collectGroupIds, collectAssignedColIds } from './composeGroups';

/** @internal — test helper to reset per-grid resources between cases. */
export function _resetColumnGroupsResourcesForTests(): void {
  _resources.clear();
}
