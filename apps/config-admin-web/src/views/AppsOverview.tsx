import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@starui/ui';
import { Database, Pencil, Plus, Trash2, Users } from 'lucide-react';
import {
  guardOptimisticUpdate,
  isOptimisticLockError,
  OptimisticLockDialog,
  useConfigClient,
} from '@starui/config-editor-ui';
import type { AppRegistryRow } from '@starui/config-service';

import { useAppScope } from '../AppScopeContext';

/**
 * "Apps" view — replaces the bare `<AppRegistryEditor>` from the
 * editor library with a richer, admin-only surface that knows about
 * the relationships an operator actually cares about:
 *
 *   - How many `appConfig` rows each app has (configs the app has
 *     persisted via MarketsGrid profiles, dock layouts, etc.).
 *   - How many `userProfile` rows are scoped to each app.
 *   - One-click drill-downs to those scoped views (sets the active
 *     `appId` in `<AppScopeProvider>` and routes to /configs or /users).
 *
 * The bare editor in `@starui/config-editor-ui` stays useful in the
 * in-app `config-browser-react` context, where there's only ever one
 * app in scope. The admin SPA needs the cross-app overview.
 *
 * Counts are computed by N parallel `client.findByAppId` /
 * `client.userProfiles.listByApp` calls — fine for the dozen-app
 * deployments this admin tool is sized for. If the apps list grows
 * past a few hundred, the right move is a dedicated
 * `/api/v1/app-registry?include=stats` endpoint, not client-side
 * fan-out optimization.
 */

interface DraftApp {
  appId: string;
  displayName: string;
  manifestUrl: string;
  environment: string;
  configServiceEnabled: boolean;
  expectedUpdatedTime?: string;
}

const EMPTY_DRAFT: DraftApp = {
  appId: '',
  displayName: '',
  manifestUrl: '',
  environment: 'dev',
  configServiceEnabled: true,
};

function rowToDraft(row: AppRegistryRow): DraftApp {
  return {
    appId: row.appId,
    displayName: row.displayName,
    manifestUrl: row.manifestUrl,
    environment: row.environment,
    configServiceEnabled: row.configServiceEnabled,
    expectedUpdatedTime: row.updatedTime,
  };
}

interface Counts {
  configs: number;
  users: number;
}

export function AppsOverview() {
  const client = useConfigClient();
  const navigate = useNavigate();
  const { setAppId } = useAppScope();

  const [apps, setApps] = useState<AppRegistryRow[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<DraftApp>(EMPTY_DRAFT);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await client.apps.list();
      setApps(list);
      // Fan-out per-app counts in parallel. Each app contributes 2
      // requests (configs, users); for typical N≤20 that's well under
      // a second on a local network. Failures degrade gracefully — a
      // missing count renders as "—" rather than blocking the page.
      const entries = await Promise.all(
        list.map(async (app) => {
          const [configs, users] = await Promise.all([
            client.findByAppId(app.appId).then(
              (rs) => rs.length,
              () => -1,
            ),
            client.userProfiles.listByApp(app.appId).then(
              (rs) => rs.length,
              () => -1,
            ),
          ]);
          return [app.appId, { configs, users }] as const;
        }),
      );
      setCounts(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apps');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle.length === 0) return apps;
    return apps.filter(
      (app) =>
        app.appId.toLowerCase().includes(needle) ||
        app.displayName.toLowerCase().includes(needle) ||
        app.environment.toLowerCase().includes(needle),
    );
  }, [apps, filter]);

  const totals = useMemo(() => {
    let configs = 0;
    let users = 0;
    for (const c of Object.values(counts)) {
      if (c.configs >= 0) configs += c.configs;
      if (c.users >= 0) users += c.users;
    }
    return { apps: apps.length, configs, users };
  }, [apps, counts]);

  function startCreate() {
    setDraft(EMPTY_DRAFT);
    setDrawerMode('create');
    setEditingId(null);
    setDrawerError(null);
    setDrawerOpen(true);
  }

  function startEdit(row: AppRegistryRow) {
    setDraft(rowToDraft(row));
    setDrawerMode('edit');
    setEditingId(row.appId);
    setDrawerError(null);
    setDrawerOpen(true);
  }

  function openConfigs(appId: string) {
    setAppId(appId);
    navigate('/configs');
  }

  function openUsers(appId: string) {
    setAppId(appId);
    navigate('/users');
  }

  async function handleDelete(row: AppRegistryRow) {
    const c = counts[row.appId];
    const tail =
      c && (c.configs > 0 || c.users > 0)
        ? `\n\nThis app still has ${c.configs} configuration${c.configs === 1 ? '' : 's'} and ${c.users} user profile${c.users === 1 ? '' : 's'} attached. Deleting the app does NOT cascade — the orphan rows will remain in the database.`
        : '';
    const ok = window.confirm(
      `Delete "${row.displayName}" (${row.appId})?${tail}`,
    );
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await client.apps.delete(row.appId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (
      draft.appId.trim().length === 0 ||
      draft.displayName.trim().length === 0
    ) {
      setDrawerError('App id and display name are required.');
      return;
    }
    setSaving(true);
    setDrawerError(null);
    try {
      const next: AppRegistryRow = {
        appId: draft.appId.trim(),
        displayName: draft.displayName.trim(),
        manifestUrl: draft.manifestUrl.trim(),
        environment: draft.environment.trim(),
        configServiceEnabled: draft.configServiceEnabled,
      };
      if (drawerMode === 'create') {
        await client.apps.create(next);
      } else if (editingId) {
        await guardOptimisticUpdate<AppRegistryRow>({
          expectedUpdatedTime: draft.expectedUpdatedTime,
          fetchCurrent: () => client.apps.get(editingId),
        });
        await client.apps.update(editingId, next);
      }
      await refresh();
      setDrawerOpen(false);
    } catch (err) {
      if (isOptimisticLockError(err)) {
        setLockDialogOpen(true);
      } else {
        setDrawerError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReload() {
    setLockDialogOpen(false);
    if (!editingId) return;
    const fresh = await client.apps.get(editingId);
    if (fresh) setDraft(rowToDraft(fresh));
    await refresh();
  }

  function handleDiscard() {
    setLockDialogOpen(false);
    setDrawerOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">Apps</h2>
          <p className="text-xs text-muted-foreground">
            {totals.apps} app{totals.apps === 1 ? '' : 's'} registered ·{' '}
            {totals.configs} configuration{totals.configs === 1 ? '' : 's'}{' '}
            across them · {totals.users} user profile
            {totals.users === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by id, name, env…"
            className="max-w-sm"
            data-testid="apps-overview-filter"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            data-testid="apps-overview-refresh"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button
            size="sm"
            onClick={startCreate}
            data-testid="apps-overview-create"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New app
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>REST</TableHead>
              <TableHead className="text-right">Configurations</TableHead>
              <TableHead className="text-right">User profiles</TableHead>
              <TableHead className="w-[18rem] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                  data-testid="apps-overview-empty"
                >
                  {apps.length === 0
                    ? 'No apps registered yet. Click "New app" to add one.'
                    : 'No apps match the current filter.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const c = counts[row.appId];
                return (
                  <TableRow
                    key={row.appId}
                    data-testid={`apps-overview-row-${row.appId}`}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.displayName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.appId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.environment}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.configServiceEnabled ? 'secondary' : 'outline'}
                      >
                        {row.configServiceEnabled ? 'enabled' : 'disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <CountCell value={c?.configs} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CountCell value={c?.users} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openConfigs(row.appId)}
                          data-testid={`apps-overview-open-configs-${row.appId}`}
                          title="Open this app's configurations"
                        >
                          <Database className="mr-1.5 h-3.5 w-3.5" />
                          Configs
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openUsers(row.appId)}
                          data-testid={`apps-overview-open-users-${row.appId}`}
                          title="Open this app's user profiles"
                        >
                          <Users className="mr-1.5 h-3.5 w-3.5" />
                          Users
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(row)}
                          aria-label="Edit app"
                          data-testid={`apps-overview-edit-${row.appId}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(row)}
                          disabled={saving}
                          aria-label="Delete app"
                          data-testid={`apps-overview-delete-${row.appId}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="flex flex-col gap-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {drawerMode === 'create' ? 'New app' : 'Edit app'}
            </SheetTitle>
            <SheetDescription>
              {drawerMode === 'create'
                ? 'Register a new app in the platform.'
                : 'Update this app registry entry.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app-id">App ID</Label>
              <Input
                id="app-id"
                value={draft.appId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, appId: e.target.value }))
                }
                disabled={drawerMode === 'edit'}
                placeholder="e.g. markets-ui-react-reference"
                data-testid="apps-overview-field-id"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app-display-name">Display name</Label>
              <Input
                id="app-display-name"
                value={draft.displayName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, displayName: e.target.value }))
                }
                placeholder="e.g. MarketsUI Reference"
                data-testid="apps-overview-field-display-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app-manifest-url">Manifest URL</Label>
              <Input
                id="app-manifest-url"
                value={draft.manifestUrl}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, manifestUrl: e.target.value }))
                }
                placeholder="https://…/platform/manifest.fin.json"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app-environment">Environment</Label>
              <Input
                id="app-environment"
                value={draft.environment}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, environment: e.target.value }))
                }
                placeholder="dev / uat / prod"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div className="flex flex-col">
                <Label
                  htmlFor="app-config-enabled"
                  className="font-medium"
                >
                  Config service enabled
                </Label>
                <span className="text-xs text-muted-foreground">
                  When off, this app uses local-Dexie config storage only.
                </span>
              </div>
              <Switch
                id="app-config-enabled"
                checked={draft.configServiceEnabled}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, configServiceEnabled: v }))
                }
              />
            </div>
          </div>
          {drawerError ? (
            <p className="text-sm text-destructive" role="alert">
              {drawerError}
            </p>
          ) : null}
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setDrawerOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              data-testid="apps-overview-save"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <OptimisticLockDialog
        open={lockDialogOpen}
        onOpenChange={setLockDialogOpen}
        onReload={handleReload}
        onDiscard={handleDiscard}
      />
    </div>
  );
}

function CountCell({ value }: { value: number | undefined }) {
  if (value === undefined) {
    return (
      <span className="text-xs text-muted-foreground" aria-label="Loading">
        …
      </span>
    );
  }
  if (value < 0) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="font-mono text-sm">{value}</span>;
}
