import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@starui/ui';
import { ArrowUpRight, Copy, Eye, Pencil, Trash2 } from 'lucide-react';
import {
  guardOptimisticUpdate,
  isOptimisticLockError,
  OptimisticLockDialog,
  useConfigClient,
} from '@starui/config-editor-ui';
import type { AppConfigRow, AppRegistryRow } from '@starui/config-service';

import { useAppScope } from '../AppScopeContext';

/**
 * Operator surface for the actual `appConfig` rows scoped to the
 * currently-selected appId.
 *
 * The four list editors elsewhere in the admin SPA cover the auth
 * tables (apps / users / roles / permissions). This is the missing
 * fifth surface: the table where component instances + templates
 * persist their saved state — MarketsGrid profiles, dock layouts,
 * order tickets, etc. Without this the operator can register apps
 * and grant roles but can't actually inspect or repair what an app
 * has saved.
 *
 * Talks to the framework-agnostic `ConfigClient` (Local-Dexie or
 * REST) via `findByAppId` / `updateConfig` / `cloneConfig` /
 * `deleteConfig`. Optimistic locking from Session 6 is enforced via
 * `guardOptimisticUpdate` before each save.
 */

interface DraftRow {
  configId: string;
  displayText: string;
  componentType: string;
  componentSubType: string;
  userId: string;
  isPublic: boolean;
  isTemplate: boolean;
  payloadText: string;
  expectedUpdatedTime?: string;
}

function rowToDraft(row: AppConfigRow): DraftRow {
  return {
    configId: row.configId,
    displayText: row.displayText,
    componentType: row.componentType,
    componentSubType: row.componentSubType,
    userId: row.userId,
    isPublic: row.isPublic ?? true,
    isTemplate: row.isTemplate,
    payloadText: JSON.stringify(row.payload ?? {}, null, 2),
    expectedUpdatedTime: row.updatedTime,
  };
}

interface ParsedPayload {
  ok: boolean;
  value?: unknown;
  error?: string;
}

function parsePayload(text: string): ParsedPayload {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JSON',
    };
  }
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export function AppConfigList() {
  const client = useConfigClient();
  const { appId } = useAppScope();
  const [app, setApp] = useState<AppRegistryRow | null>(null);
  const [rows, setRows] = useState<AppConfigRow[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

  useEffect(() => {
    if (!appId) {
      setRows([]);
      setApp(null);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, client]);

  async function refresh() {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      // Load the parent app and its configs in parallel so the header
      // can show the app's displayName + environment alongside the id.
      // The header is otherwise just an opaque appId chip — the operator
      // has no clue *which* of the registered apps they're looking at.
      const [parentApp, next] = await Promise.all([
        client.apps.get(appId).catch(() => undefined),
        client.findByAppId(appId),
      ]);
      setApp(parentApp ?? null);
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configs');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle.length === 0) return rows;
    return rows.filter((r) => {
      return (
        r.configId.toLowerCase().includes(needle) ||
        r.displayText.toLowerCase().includes(needle) ||
        r.componentType.toLowerCase().includes(needle) ||
        r.componentSubType.toLowerCase().includes(needle) ||
        r.userId.toLowerCase().includes(needle)
      );
    });
  }, [rows, filter]);

  function openView(row: AppConfigRow) {
    setDraft(rowToDraft(row));
    setDrawerMode('view');
    setDrawerError(null);
    setDrawerOpen(true);
  }

  function openEdit(row: AppConfigRow) {
    setDraft(rowToDraft(row));
    setDrawerMode('edit');
    setDrawerError(null);
    setDrawerOpen(true);
  }

  async function handleClone(row: AppConfigRow) {
    const newName = window.prompt(
      'Display text for the clone',
      `${row.displayText} (copy)`,
    );
    if (!newName || newName.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await client.cloneConfig(row.configId, newName.trim(), row.userId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: AppConfigRow) {
    const ok = window.confirm(
      `Delete "${row.displayText}" (${row.configId})? This cannot be undone.`,
    );
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await client.deleteConfig(row.configId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    const parsed = parsePayload(draft.payloadText);
    if (!parsed.ok) {
      setDrawerError(`Invalid JSON: ${parsed.error}`);
      return;
    }
    setSaving(true);
    setDrawerError(null);
    try {
      await guardOptimisticUpdate<AppConfigRow>({
        expectedUpdatedTime: draft.expectedUpdatedTime,
        fetchCurrent: () => client.getConfig(draft.configId),
      });
      await client.updateConfig(
        draft.configId,
        {
          displayText: draft.displayText.trim(),
          componentType: draft.componentType.trim(),
          componentSubType: draft.componentSubType.trim(),
          userId: draft.userId.trim(),
          isPublic: draft.isPublic,
          isTemplate: draft.isTemplate,
          payload: parsed.value,
        },
        { expectedUpdatedTime: draft.expectedUpdatedTime },
      );
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
    if (!draft) return;
    const fresh = await client.getConfig(draft.configId);
    if (fresh) setDraft(rowToDraft(fresh));
    await refresh();
  }

  function handleDiscard() {
    setLockDialogOpen(false);
    setDrawerOpen(false);
    setDraft(null);
  }

  if (!appId) {
    return (
      <div
        className="p-4 text-sm text-muted-foreground"
        data-testid="app-config-needs-app"
      >
        Choose an application above to browse its configurations.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {app ? app.displayName : 'App configurations'}
            {app ? (
              <Badge variant="outline" className="ml-2 align-middle">
                {app.environment}
              </Badge>
            ) : null}
          </h2>
          <p className="text-xs text-muted-foreground">
            Saved component state for{' '}
            <span className="font-mono">{appId}</span>
            {app === null && !loading ? (
              <>
                {' — '}
                <span className="text-amber-600 dark:text-amber-400">
                  no matching app in the registry (orphan configs?)
                </span>
              </>
            ) : null}
            {' · '}
            {rows.length} row{rows.length === 1 ? '' : 's'} (templates +
            instances).{' '}
            <Link
              to="/apps"
              className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
              data-testid="app-config-back-to-apps"
            >
              View in apps registry <ArrowUpRight className="h-3 w-3" />
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by id, name, component, owner…"
            className="max-w-sm"
            data-testid="app-config-filter"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            data-testid="app-config-refresh"
          >
            {loading ? 'Loading…' : 'Refresh'}
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
              <TableHead>Display text</TableHead>
              <TableHead>Component</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-[12rem] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground"
                  data-testid="app-config-empty"
                >
                  {rows.length === 0
                    ? 'No configurations saved for this app yet.'
                    : 'No rows match the current filter.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.configId}
                  data-testid={`app-config-row-${row.configId}`}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.displayText}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.configId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">
                      {row.componentType}
                      {row.componentSubType ? ` · ${row.componentSubType}` : ''}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.userId}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isPublic === false ? 'outline' : 'secondary'}>
                      {row.isPublic === false ? 'private' : 'public'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isTemplate ? 'default' : 'outline'}>
                      {row.isTemplate ? 'template' : 'instance'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatTimestamp(row.updatedTime)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openView(row)}
                        aria-label="View row"
                        data-testid={`app-config-view-${row.configId}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(row)}
                        aria-label="Edit row"
                        data-testid={`app-config-edit-${row.configId}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleClone(row)}
                        disabled={saving}
                        aria-label="Clone row"
                        data-testid={`app-config-clone-${row.configId}`}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(row)}
                        disabled={saving}
                        aria-label="Delete row"
                        data-testid={`app-config-delete-${row.configId}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="flex w-full flex-col gap-4 sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {drawerMode === 'view' ? 'View configuration' : 'Edit configuration'}
            </SheetTitle>
            <SheetDescription>
              {drawerMode === 'view'
                ? 'Read-only inspection of the saved row.'
                : 'Persist via the same optimistic-locking guard as the editors.'}
            </SheetDescription>
          </SheetHeader>
          {draft ? (
            <div className="flex flex-col gap-3 overflow-y-auto">
              <FieldRow
                label="Config ID"
                value={draft.configId}
                readOnly
              />
              <FieldRow
                label="Display text"
                value={draft.displayText}
                readOnly={drawerMode === 'view'}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, displayText: v } : d))
                }
                testId="app-config-field-display-text"
              />
              <div className="grid grid-cols-2 gap-3">
                <FieldRow
                  label="Component type"
                  value={draft.componentType}
                  readOnly={drawerMode === 'view'}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, componentType: v } : d))
                  }
                />
                <FieldRow
                  label="Component subtype"
                  value={draft.componentSubType}
                  readOnly={drawerMode === 'view'}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, componentSubType: v } : d))
                  }
                />
              </div>
              <FieldRow
                label="Owner (userId)"
                value={draft.userId}
                readOnly={drawerMode === 'view'}
                onChange={(v) =>
                  setDraft((d) => (d ? { ...d, userId: v } : d))
                }
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  Payload (JSON)
                </span>
                <Textarea
                  value={draft.payloadText}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, payloadText: e.target.value } : d,
                    )
                  }
                  readOnly={drawerMode === 'view'}
                  rows={16}
                  className="font-mono text-xs"
                  data-testid="app-config-field-payload"
                />
              </div>
            </div>
          ) : null}
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
              {drawerMode === 'view' ? 'Close' : 'Cancel'}
            </Button>
            {drawerMode === 'edit' ? (
              <Button
                onClick={handleSave}
                disabled={saving || !draft}
                data-testid="app-config-save"
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            ) : null}
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

interface FieldRowProps {
  label: string;
  value: string;
  readOnly?: boolean;
  onChange?: (next: string) => void;
  testId?: string;
}

function FieldRow({ label, value, readOnly, onChange, testId }: FieldRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <Input
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}
