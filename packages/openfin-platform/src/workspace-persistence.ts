/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Workspace persistence — promotes ConfigService to the source of truth
 * for OpenFin saved workspaces.
 *
 * The OpenFin workspace platform allows overriding its built-in workspace
 * CRUD via WorkspacePlatformOverrideCallback. This module returns one such
 * callback whose five overridden methods read/write ConfigService rows of
 * componentType='workspace', scoped (appId, userId). OpenFin's local
 * IndexedDB is intentionally NOT used as a fallback — that would create
 * a divergent shadow store and break the "share workspaces between users"
 * use case.
 *
 * Every saved workspace is one AppConfigRow:
 *   configId        = `WS_${workspaceId}`
 *   componentType   = 'workspace'
 *   componentSubType = 'SNAPSHOT'
 *   payload         = { name, openfinSnapshot, instanceIds, metadata?, version }
 *
 * `instanceIds` is collected from the snapshot's view URLs at save time so
 * downstream GC can decide which per-instance config rows are still
 * referenced by some saved workspace.
 */

import type {
  OpenViewTabContextMenuPayload,
  WorkspacePlatformOverrideCallback,
} from '@openfin/workspace-platform';
import type { ConfigManager, AppConfigRow } from '@marketsui/config-service';
import { COMPONENT_TYPES } from '@marketsui/shared-types';
import { injectRenameMenuItem } from './internal/viewTabRename';

const WS_PREFIX = 'WS_';
const SNAPSHOT_SUBTYPE = 'SNAPSHOT';

export interface WorkspacePayload {
  name: string;
  openfinSnapshot: any;
  instanceIds: string[];
  metadata?: Record<string, unknown>;
  version: 1;
}

export interface WorkspacePersistenceContext {
  cm: ConfigManager;
  appId: string;
  userId: string;
  /**
   * Called after any workspace mutation (create/update/delete). Use this
   * hook to trigger orphan-config GC, refresh dock dropdown, etc. Errors
   * thrown here are logged but do not fail the workspace operation.
   */
  onWorkspaceChange?: () => Promise<void> | void;
}

function workspaceConfigId(workspaceId: string): string {
  return workspaceId.startsWith(WS_PREFIX) ? workspaceId : `${WS_PREFIX}${workspaceId}`;
}

function workspaceIdFromConfigId(configId: string): string {
  return configId.startsWith(WS_PREFIX) ? configId.slice(WS_PREFIX.length) : configId;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Walk a snapshot tree and pull `?id=<instanceId>` from every view URL.
 *
 * The platform launches each view via a URL whose query string carries the
 * instanceId (component-host then reads it from `customData`/URL params).
 * Collecting these at save-time gives us a workspace-membership set that
 * the GC pass can compare against the per-instance config table.
 */
function collectInstanceIds(node: any, acc: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (typeof node.url === 'string') {
    try {
      const u = new URL(node.url, 'http://placeholder');
      const id = u.searchParams.get('id');
      if (id) acc.push(id);
    } catch {
      /* malformed url — skip */
    }
  }
  for (const v of (node.views ?? [])) collectInstanceIds(v, acc);
  for (const w of (node.windows ?? [])) collectInstanceIds(w, acc);
  for (const c of (node.children ?? [])) collectInstanceIds(c, acc);
}

export function instanceIdsFromSnapshot(snapshot: any): string[] {
  const ids: string[] = [];
  if (!snapshot) return ids;
  for (const w of (snapshot.windows ?? [])) collectInstanceIds(w, ids);
  // De-dupe while preserving order
  return Array.from(new Set(ids));
}

/**
 * Walk the snapshot tree and collect every node that looks like a view
 * (has both a `name` and a `url`). The OpenFin snapshot shape is a
 * windows → (layout|views|children) tree, so we recurse on any container
 * key that might hold descendants.
 */
function collectViewNodes(node: any, acc: any[]): void {
  if (!node || typeof node !== 'object') return;
  // A node is a view if it has both a stable name and a url. View names
  // are stable across platform restarts (they're persisted in the
  // snapshot and reused on applySnapshot).
  if (typeof node.name === 'string' && typeof node.url === 'string') {
    acc.push(node);
  }
  for (const v of (node.views ?? [])) collectViewNodes(v, acc);
  for (const w of (node.windows ?? [])) collectViewNodes(w, acc);
  for (const c of (node.children ?? [])) collectViewNodes(c, acc);
  // OpenFin's golden-layout snapshots also nest under `layout.content`
  // (recursive content arrays).
  if (node.layout && typeof node.layout === 'object') {
    collectViewNodes(node.layout, acc);
  }
  for (const c of (node.content ?? [])) collectViewNodes(c, acc);
}

/**
 * Re-read live `customData` from every view in the snapshot and merge
 * it into the snapshot view definitions. Defensive: even if
 * `Platform.getSnapshot()` somehow lags behind a recent
 * `View.updateOptions({ customData })` (timing race, missed update,
 * future OpenFin behaviour change), this guarantees the saved snapshot
 * carries the latest per-view customData. Critical for features that
 * persist per-view state on `customData` (`activeProfileId`,
 * `savedTitle`, etc.).
 *
 * Mutates the snapshot in place. Best-effort per view — a view that
 * can't be wrapped or whose options can't be read is left as-is.
 */
async function augmentSnapshotWithLiveCustomData(snapshot: any): Promise<void> {
  if (!snapshot) return;
  const views: any[] = [];
  for (const w of (snapshot.windows ?? [])) collectViewNodes(w, views);
  if (views.length === 0) return;

  // Provider's own uuid is the platform uuid — view identities share it.
  let platformUuid: string | undefined;
  try {
    platformUuid = fin?.me?.identity?.uuid;
  } catch {
    /* ignore */
  }
  if (!platformUuid) return;

  await Promise.all(views.map(async (view) => {
    try {
      const handle = fin.View.wrapSync({ uuid: platformUuid, name: view.name });
      const liveOpts = await handle.getOptions();
      const liveCd = (liveOpts?.customData ?? {}) as Record<string, unknown>;
      const snapCd = (view.customData ?? {}) as Record<string, unknown>;
      // Merge live wins so newly-set keys (activeProfileId, savedTitle)
      // overwrite anything the snapshot may have captured stale.
      view.customData = { ...snapCd, ...liveCd };
    } catch {
      /* best-effort — leave view unchanged */
    }
  }));
}

function buildWorkspaceRow(opts: {
  configId: string;
  appId: string;
  userId: string;
  displayText: string;
  payload: WorkspacePayload;
  existing?: AppConfigRow | undefined;
}): AppConfigRow {
  const now = nowIso();
  return {
    configId: opts.configId,
    appId: opts.appId,
    userId: opts.userId,
    componentType: COMPONENT_TYPES.WORKSPACE,
    componentSubType: SNAPSHOT_SUBTYPE,
    isTemplate: false,
    displayText: opts.displayText,
    payload: opts.payload,
    createdBy: opts.existing?.createdBy ?? opts.userId,
    updatedBy: opts.userId,
    creationTime: opts.existing?.creationTime ?? now,
    updatedTime: now,
  };
}

function rowToWorkspace(row: AppConfigRow): any {
  const p = (row.payload ?? {}) as WorkspacePayload;
  return {
    workspaceId: workspaceIdFromConfigId(row.configId),
    title: p.name ?? row.displayText,
    snapshot: p.openfinSnapshot,
    metadata: p.metadata,
  };
}

/**
 * Create a WorkspacePlatformOverrideCallback that persists workspaces to
 * ConfigService as the single source of truth. Pass the returned callback
 * as `overrideCallback` to `init()` from `@openfin/workspace-platform`.
 */
export function createWorkspacePersistenceOverride(
  ctx: WorkspacePersistenceContext,
): WorkspacePlatformOverrideCallback {
  const { cm, appId, userId, onWorkspaceChange } = ctx;

  // Best-effort change hook — errors here must not fail the workspace op
  const fireChange = async (): Promise<void> => {
    if (!onWorkspaceChange) return;
    try {
      await onWorkspaceChange();
    } catch (err) {
      console.warn('[workspace-persistence] onWorkspaceChange handler threw:', err);
    }
  };

  return async function overrideCallback(WorkspacePlatformProvider) {
    class MarketsUIWorkspaceProvider extends WorkspacePlatformProvider {
      async createSavedWorkspace(req: any): Promise<void> {
        const ws = req?.workspace ?? req;
        if (!ws?.workspaceId) {
          throw new Error('[workspace-persistence] createSavedWorkspace: missing workspaceId');
        }

        // The platform's `req.workspace.snapshot` is what was captured at
        // dialog-time. Fall back to a live snapshot if the caller didn't
        // pre-capture one (rare — the OpenFin Save dialog always provides it).
        const liveSnapshot = ws.snapshot
          ? null
          : await fin.Platform.getCurrentSync().getSnapshot();
        const snapshot = ws.snapshot ?? liveSnapshot;
        // Re-read live customData for every view in the snapshot. Defends
        // against any case where `Platform.getSnapshot()` lags behind
        // recent `View.updateOptions({customData})` writes — critical for
        // per-view state (activeProfileId, savedTitle) to round-trip
        // through workspace save/restore.
        await augmentSnapshotWithLiveCustomData(snapshot);
        const instanceIds = instanceIdsFromSnapshot(snapshot);

        const configId = workspaceConfigId(ws.workspaceId);
        const payload: WorkspacePayload = {
          name: ws.title ?? 'Workspace',
          openfinSnapshot: snapshot,
          instanceIds,
          metadata: ws.metadata,
          version: 1,
        };

        await cm.saveConfig(buildWorkspaceRow({
          configId, appId, userId,
          displayText: ws.title ?? 'Workspace',
          payload,
        }));

        await fireChange();
      }

      async updateSavedWorkspace(req: any): Promise<void> {
        const ws = req?.workspace ?? req;
        if (!ws?.workspaceId) {
          throw new Error('[workspace-persistence] updateSavedWorkspace: missing workspaceId');
        }

        const configId = workspaceConfigId(ws.workspaceId);
        const existing = await cm.getConfig(configId);

        const liveSnapshot = ws.snapshot
          ? null
          : await fin.Platform.getCurrentSync().getSnapshot();
        const snapshot = ws.snapshot ?? liveSnapshot;
        // See createSavedWorkspace — defensive re-read of live customData.
        await augmentSnapshotWithLiveCustomData(snapshot);
        const instanceIds = instanceIdsFromSnapshot(snapshot);

        const payload: WorkspacePayload = {
          name: ws.title ?? existing?.displayText ?? 'Workspace',
          openfinSnapshot: snapshot,
          instanceIds,
          metadata: ws.metadata ?? (existing?.payload as WorkspacePayload | undefined)?.metadata,
          version: 1,
        };

        await cm.saveConfig(buildWorkspaceRow({
          configId, appId, userId,
          displayText: ws.title ?? existing?.displayText ?? 'Workspace',
          payload,
          existing,
        }));

        await fireChange();
      }

      async getSavedWorkspace(id: string): Promise<any> {
        // Contract per WorkspacePlatformProvider.getSavedWorkspace: return
        // `Workspace | undefined` — DO NOT throw on missing. Storage.
        // saveWorkspace() calls this first to detect create-vs-update;
        // throwing here would break the upsert path.
        const row = await cm.getConfig(workspaceConfigId(id));
        if (!row || row.componentType !== COMPONENT_TYPES.WORKSPACE) {
          return undefined;
        }
        return rowToWorkspace(row);
      }

      async getSavedWorkspaces(query?: string): Promise<any[]> {
        const all = await cm.getConfigsByUser(userId);
        const mine = all.filter(
          (r) =>
            r.appId === appId &&
            r.componentType === COMPONENT_TYPES.WORKSPACE,
        );
        const term = query?.trim().toLowerCase();
        const filtered = term
          ? mine.filter((r) => (r.displayText ?? '').toLowerCase().includes(term))
          : mine;
        return filtered.map(rowToWorkspace);
      }

      async deleteSavedWorkspace(id: string): Promise<void> {
        await cm.deleteConfig(workspaceConfigId(id));
        await fireChange();
      }

      // Inject "Save Tab As…" at the top of the view-tab right-click menu.
      // The custom action id is dispatched to the rename handler registered
      // in `customActions` (see internal/viewTabRename.ts).
      async openViewTabContextMenu(
        req: OpenViewTabContextMenuPayload,
        callerIdentity: any,
      ): Promise<void> {
        return super.openViewTabContextMenu(injectRenameMenuItem(req), callerIdentity);
      }
    }

    return new MarketsUIWorkspaceProvider();
  };
}
