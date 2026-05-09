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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@starui/ui';
import type { AppRegistryRow } from '@starui/config-service';

import { useConfigClient } from './ConfigEditorContext';
import { EditorShell } from './EditorShell';

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function startEdit(row: AppRegistryRow) {
    setMode('edit');
    setEditingId(row.appId);
    setDraft(rowToDraft(row));
    setError(null);
    setOpen(true);
  }

  const trimmedAppId = draft.appId.trim();
  const trimmedDisplayName = draft.displayName.trim();
  const trimmedManifestUrl = draft.manifestUrl.trim();
  const canSave =
    trimmedAppId.length > 0 &&
    trimmedDisplayName.length > 0 &&
    trimmedManifestUrl.length > 0 &&
    draft.environment.length > 0 &&
    !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const next: AppRegistryRow = {
        appId: trimmedAppId,
        displayName: trimmedDisplayName,
        manifestUrl: trimmedManifestUrl,
        configServiceEnabled: draft.configServiceEnabled,
        environment: draft.environment,
      };
      if (mode === 'create') {
        await client.apps.create(next);
      } else if (editingId) {
        await client.apps.update(editingId, next);
      }
      await refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditorShell
      title="App registry"
      itemLabel="app"
      onCreate={startCreate}
      list={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App ID</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Config service</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  No apps registered.
                </TableCell>
              </TableRow>
            ) : (
              apps.map((row) => (
                <TableRow
                  key={row.appId}
                  data-testid={`app-row-${row.appId}`}
                >
                  <TableCell className="font-mono">{row.appId}</TableCell>
                  <TableCell>{row.displayName}</TableCell>
                  <TableCell>{row.environment}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.configServiceEnabled ? 'enabled' : 'disabled'}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                      onClick={() => startEdit(row)}
                      data-testid={`app-edit-${row.appId}`}
                    >
                      Edit
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      }
      drawer={{
        open,
        mode,
        onOpenChange: setOpen,
        canSave,
        saving,
        error,
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
  );
}
