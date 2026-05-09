import { useEffect, useState } from 'react';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@starui/ui';
import type { AppRegistryRow } from '@starui/config-service';

import { useConfigClient } from './ConfigEditorContext';
import { EditorShell } from './EditorShell';
import { EditorDataTable, type EditorTableColumn } from './EditorDataTable';
import { OptimisticLockDialog } from './OptimisticLockDialog';
import {
  formatErrors,
  hasBlockingError,
  validateAppRegistry,
  type ValidationError,
} from './validation';
import {
  guardOptimisticUpdate,
  isOptimisticLockError,
} from './useOptimisticUpdate';

const ENVIRONMENTS = ['dev', 'uat', 'prod'] as const;

interface DraftApp {
  appId: string;
  displayName: string;
  manifestUrl: string;
  configServiceEnabled: boolean;
  environment: string;
}

const EMPTY_DRAFT: DraftApp = {
  appId: '',
  displayName: '',
  manifestUrl: '',
  configServiceEnabled: false,
  environment: 'dev',
};

function rowToDraft(row: AppRegistryRow): DraftApp {
  return {
    appId: row.appId,
    displayName: row.displayName,
    manifestUrl: row.manifestUrl,
    configServiceEnabled: row.configServiceEnabled,
    environment: row.environment,
  };
}

export function AppRegistryEditor() {
  const client = useConfigClient();
  const [apps, setApps] = useState<AppRegistryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<DraftApp>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expectedUpdatedTime, setExpectedUpdatedTime] = useState<
    string | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setApps(await client.apps.list());
  }

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setExpectedUpdatedTime(undefined);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function startEdit(row: AppRegistryRow) {
    setMode('edit');
    setEditingId(row.appId);
    setExpectedUpdatedTime(row.updatedTime);
    setDraft(rowToDraft(row));
    setError(null);
    setOpen(true);
  }

  function buildNextRow(): AppRegistryRow {
    return {
      appId: draft.appId.trim(),
      displayName: draft.displayName.trim(),
      manifestUrl: draft.manifestUrl.trim(),
      configServiceEnabled: draft.configServiceEnabled,
      environment: draft.environment,
    };
  }

  function liveErrors(): ValidationError[] {
    return validateAppRegistry(buildNextRow(), apps, mode);
  }

  const errors = liveErrors();
  const canSave = !hasBlockingError(errors) && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const next = buildNextRow();
      if (mode === 'create') {
        await client.apps.create(next);
      } else if (editingId) {
        await guardOptimisticUpdate<AppRegistryRow>({
          expectedUpdatedTime,
          fetchCurrent: () => client.apps.get(editingId),
        });
        await client.apps.update(editingId, next);
      }
      await refresh();
      setOpen(false);
    } catch (err) {
      if (isOptimisticLockError(err)) {
        setLockDialogOpen(true);
      } else {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReload() {
    setLockDialogOpen(false);
    if (!editingId) return;
    const fresh = await client.apps.get(editingId);
    if (fresh) {
      setDraft(rowToDraft(fresh));
      setExpectedUpdatedTime(fresh.updatedTime);
    }
    await refresh();
  }

  function handleDiscard() {
    setLockDialogOpen(false);
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setExpectedUpdatedTime(undefined);
  }

  const columns: EditorTableColumn<AppRegistryRow>[] = [
    {
      key: 'appId',
      header: 'App ID',
      cell: (r) => <span className="font-mono">{r.appId}</span>,
      sortValue: (r) => r.appId,
      width: '14rem',
    },
    {
      key: 'displayName',
      header: 'Display name',
      sortValue: (r) => r.displayName,
    },
    {
      key: 'environment',
      header: 'Environment',
      sortValue: (r) => r.environment,
      width: '10rem',
    },
    {
      key: 'configServiceEnabled',
      header: 'Config service',
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.configServiceEnabled ? 'enabled' : 'disabled'}
        </span>
      ),
      sortValue: (r) => (r.configServiceEnabled ? 1 : 0),
      width: '10rem',
    },
  ];

  const blockingErrors = errors.filter(
    (e) => (e.severity ?? 'error') === 'error',
  );
  const drawerError =
    error ?? (blockingErrors.length > 0 ? formatErrors(blockingErrors) : null);

  return (
    <>
      <EditorShell
        title="App registry"
        itemLabel="app"
        onCreate={startCreate}
        list={
          <EditorDataTable
            rows={apps}
            columns={columns}
            rowKey={(r) => r.appId}
            onEditRow={startEdit}
            emptyMessage="No apps registered."
            testIdPrefix="app"
          />
        }
        drawer={{
          open,
          mode,
          onOpenChange: setOpen,
          canSave,
          saving,
          error: drawerError,
          onSave: handleSave,
          body: (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="app-id">App ID</Label>
                <Input
                  id="app-id"
                  value={draft.appId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, appId: e.target.value }))
                  }
                  disabled={mode === 'edit'}
                  placeholder="UUID from manifest"
                  data-testid="app-field-id"
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
                  placeholder="Human-readable name"
                  data-testid="app-field-display-name"
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
                  placeholder="https://…/manifest.fin.json"
                  data-testid="app-field-manifest-url"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="app-environment">Environment</Label>
                <Select
                  value={draft.environment}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, environment: v }))
                  }
                >
                  <SelectTrigger
                    id="app-environment"
                    data-testid="app-field-environment"
                  >
                    <SelectValue placeholder="Choose an environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENVIRONMENTS.map((env) => (
                      <SelectItem key={env} value={env}>
                        {env}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="app-config-service-enabled">
                  Config service enabled
                </Label>
                <Switch
                  id="app-config-service-enabled"
                  checked={draft.configServiceEnabled}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({ ...d, configServiceEnabled: v }))
                  }
                  data-testid="app-field-config-service-enabled"
                />
              </div>
            </>
          ),
        }}
      />
      <OptimisticLockDialog
        open={lockDialogOpen}
        onOpenChange={setLockDialogOpen}
        onReload={handleReload}
        onDiscard={handleDiscard}
      />
    </>
  );
}
