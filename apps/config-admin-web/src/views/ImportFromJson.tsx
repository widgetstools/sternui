import { useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  RadioGroup,
  RadioGroupItem,
  Label,
} from '@starui/ui';
import { Upload } from 'lucide-react';
import { useConfigClient } from '@starui/config-editor-ui';
import type {
  AppConfigRow,
  AppRegistryRow,
  ConfigClient,
  PermissionRow,
  RoleRow,
  UserProfileRow,
} from '@starui/config-service';

/**
 * One-shot bootstrap path: drop in JSON files exported from an app's
 * in-app `<ConfigBrowser>` (or a hand-rolled `seed-config.json`-shaped
 * bundle) and push every row into the server.
 *
 * Why this exists: in-app config-browser exports per-table flat
 * arrays. When a team starts with everything in Dexie and decides to
 * move to the REST server, the natural migration is "export each
 * table from the app, import here." No background sync, no continuous
 * push — one explicit action by the operator.
 *
 * Accepted file shapes (any combination, any number of files in one go):
 *
 *   1. Flat array — the exact shape ConfigBrowser writes:
 *        [ { configId: ..., ... }, ... ]
 *      Table is detected from the primary-key field on the first row.
 *
 *   2. Bundled object — same shape as the server's seed-config.json,
 *      extended with appConfig:
 *        {
 *          appConfig: [...],
 *          appRegistry: [...],
 *          userProfiles: [...],
 *          roles: [...],
 *          permissions: [...]
 *        }
 *      Any subset of keys is accepted; missing keys are ignored.
 *
 * Mode picker controls whether existing rows are skipped or
 * overwritten. Per-row writes go through the same client APIs the
 * editors use, so server-side validation, audit stamping, and
 * optimistic-locking all apply uniformly.
 */

type TableKey =
  | 'appConfig'
  | 'appRegistry'
  | 'userProfiles'
  | 'roles'
  | 'permissions';

type Mode = 'skip-existing' | 'overwrite';

interface ParsedFile {
  fileName: string;
  rowsByTable: Partial<Record<TableKey, unknown[]>>;
  errors: string[];
}

interface ImportSummary {
  fileName: string;
  table: TableKey;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const TABLE_LABELS: Record<TableKey, string> = {
  appConfig: 'App configurations',
  appRegistry: 'App registry',
  userProfiles: 'User profiles',
  roles: 'Roles',
  permissions: 'Permissions',
};

const TABLE_PK: Record<TableKey, string> = {
  appConfig: 'configId',
  appRegistry: 'appId',
  userProfiles: 'userId',
  roles: 'roleId',
  permissions: 'permissionId',
};

function detectTable(row: unknown): TableKey | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.configId === 'string') return 'appConfig';
  if (typeof r.appId === 'string' && typeof r.manifestUrl === 'string') {
    return 'appRegistry';
  }
  if (typeof r.userId === 'string' && Array.isArray(r.roleIds)) {
    return 'userProfiles';
  }
  if (typeof r.roleId === 'string' && Array.isArray(r.permissionIds)) {
    return 'roles';
  }
  if (typeof r.permissionId === 'string') return 'permissions';
  return null;
}

function parseBundle(raw: unknown): Partial<Record<TableKey, unknown[]>> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const out: Partial<Record<TableKey, unknown[]>> = {};
  let matchedAny = false;
  for (const key of Object.keys(TABLE_LABELS) as TableKey[]) {
    const v = obj[key];
    if (Array.isArray(v)) {
      out[key] = v;
      matchedAny = true;
    }
  }
  return matchedAny ? out : null;
}

async function parseFile(file: File): Promise<ParsedFile> {
  const result: ParsedFile = {
    fileName: file.name,
    rowsByTable: {},
    errors: [],
  };
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch (err) {
    result.errors.push(
      `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      result.errors.push('Empty array — nothing to import.');
      return result;
    }
    const table = detectTable(raw[0]);
    if (!table) {
      result.errors.push(
        'Could not detect table from the first row. Expected a known primary-key field (configId, appId, userId, roleId, or permissionId).',
      );
      return result;
    }
    result.rowsByTable[table] = raw;
    return result;
  }

  const bundle = parseBundle(raw);
  if (bundle) {
    result.rowsByTable = bundle;
    return result;
  }

  result.errors.push(
    'Expected a JSON array (single-table export) or an object with appConfig/appRegistry/userProfiles/roles/permissions arrays (bundle).',
  );
  return result;
}

function pkOf(table: TableKey, row: unknown): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const v = (row as Record<string, unknown>)[TABLE_PK[table]];
  return typeof v === 'string' ? v : null;
}

async function existsOnServer(
  client: ConfigClient,
  table: TableKey,
  pk: string,
): Promise<boolean> {
  try {
    switch (table) {
      case 'appConfig': {
        const row = await client.getConfig(pk);
        return Boolean(row);
      }
      case 'appRegistry': {
        const row = await client.apps.get(pk);
        return Boolean(row);
      }
      case 'userProfiles': {
        const row = await client.userProfiles.get(pk);
        return Boolean(row);
      }
      case 'roles': {
        const row = await client.roles.get(pk);
        return Boolean(row);
      }
      case 'permissions': {
        const row = await client.permissions.get(pk);
        return Boolean(row);
      }
    }
  } catch {
    return false;
  }
}

async function upsertOne(
  client: ConfigClient,
  table: TableKey,
  row: unknown,
): Promise<void> {
  switch (table) {
    case 'appConfig':
      await client.upsertConfig(row as AppConfigRow);
      return;
    case 'appRegistry':
      await client.apps.upsert(row as AppRegistryRow);
      return;
    case 'userProfiles':
      await client.userProfiles.upsert(row as UserProfileRow);
      return;
    case 'roles':
      await client.roles.upsert(row as RoleRow);
      return;
    case 'permissions':
      await client.permissions.upsert(row as PermissionRow);
      return;
  }
}

export function ImportFromJson() {
  const client = useConfigClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedFile[]>([]);
  const [mode, setMode] = useState<Mode>('skip-existing');
  const [running, setRunning] = useState(false);
  const [summaries, setSummaries] = useState<ImportSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const counts: Partial<Record<TableKey, number>> = {};
    for (const file of parsed) {
      for (const [table, rows] of Object.entries(file.rowsByTable) as [
        TableKey,
        unknown[],
      ][]) {
        counts[table] = (counts[table] ?? 0) + rows.length;
      }
    }
    return counts;
  }, [parsed]);

  const hasParseErrors = useMemo(
    () => parsed.some((p) => p.errors.length > 0),
    [parsed],
  );

  const importable = useMemo(
    () => parsed.flatMap((p) => Object.values(p.rowsByTable).map((r) => r?.length ?? 0)),
    [parsed],
  ).reduce((a, b) => a + b, 0);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setSummaries([]);
    const next: ParsedFile[] = [];
    for (let i = 0; i < files.length; i += 1) {
      next.push(await parseFile(files[i]));
    }
    setParsed(next);
  }

  function reset() {
    setParsed([]);
    setSummaries([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function runImport() {
    setRunning(true);
    setError(null);
    const results: ImportSummary[] = [];
    try {
      for (const file of parsed) {
        for (const [table, rows] of Object.entries(file.rowsByTable) as [
          TableKey,
          unknown[],
        ][]) {
          const summary: ImportSummary = {
            fileName: file.fileName,
            table,
            total: rows.length,
            imported: 0,
            skipped: 0,
            failed: 0,
            errors: [],
          };
          for (const row of rows) {
            const pk = pkOf(table, row);
            if (!pk) {
              summary.failed += 1;
              summary.errors.push(`Row missing ${TABLE_PK[table]}; skipped.`);
              continue;
            }
            try {
              if (mode === 'skip-existing') {
                const present = await existsOnServer(client, table, pk);
                if (present) {
                  summary.skipped += 1;
                  continue;
                }
              }
              await upsertOne(client, table, row);
              summary.imported += 1;
            } catch (err) {
              summary.failed += 1;
              summary.errors.push(
                `${pk}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
          results.push(summary);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSummaries(results);
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Import from JSON</h2>
        <p className="text-xs text-muted-foreground">
          Bulk-load rows into the server from{' '}
          <span className="font-mono">ConfigBrowser</span> exports
          (per-table flat arrays) or a bundled{' '}
          <span className="font-mono">seed-config.json</span>-shaped object.
          Drop one or many files at once.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-card p-4 text-card-foreground">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">JSON files</span>
            <span className="text-xs text-muted-foreground">
              {parsed.length === 0
                ? 'No files staged yet.'
                : `${parsed.length} file${parsed.length === 1 ? '' : 's'} staged · ${importable} row${importable === 1 ? '' : 's'} ready to import.`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              multiple
              hidden
              onChange={(e) => {
                void handleFiles(e.target.files);
                // Reset so picking the same file twice in a row still fires onChange.
                e.target.value = '';
              }}
              data-testid="import-file-input"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              data-testid="import-pick-files"
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Pick files…
            </Button>
            {parsed.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                data-testid="import-reset"
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        {parsed.length > 0 ? (
          <ul
            className="flex flex-col gap-1.5 text-xs"
            data-testid="import-file-list"
          >
            {parsed.map((file, i) => (
              <li
                key={`${file.fileName}-${i}`}
                className="flex items-center justify-between gap-3 rounded border border-border px-2 py-1.5"
              >
                <span className="font-mono">{file.fileName}</span>
                <span className="flex flex-wrap gap-1">
                  {file.errors.map((msg, j) => (
                    <Badge
                      key={`err-${j}`}
                      variant="destructive"
                      className="font-normal"
                    >
                      {msg}
                    </Badge>
                  ))}
                  {(Object.entries(file.rowsByTable) as [TableKey, unknown[]][]).map(
                    ([t, rows]) => (
                      <Badge key={t} variant="secondary" className="font-mono">
                        {TABLE_LABELS[t]} · {rows.length}
                      </Badge>
                    ),
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {parsed.length > 0 && !hasParseErrors ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 text-card-foreground">
          <span className="text-sm font-medium">Conflict policy</span>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="skip-existing" id="mode-skip" />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="mode-skip" className="font-medium">
                  Skip existing
                </Label>
                <span className="text-xs text-muted-foreground">
                  For each row, GET by primary key first; only upsert when
                  the server has no row with that id. Slower (one extra GET
                  per row) but safe.
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="overwrite" id="mode-overwrite" />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="mode-overwrite" className="font-medium">
                  Overwrite existing
                </Label>
                <span className="text-xs text-muted-foreground">
                  Upsert unconditionally. Faster but clobbers any
                  server-side edits made since the export was taken.
                </span>
              </div>
            </div>
          </RadioGroup>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Will write{' '}
              {(Object.entries(totals) as [TableKey, number][])
                .map(([t, c]) => `${c} ${TABLE_LABELS[t].toLowerCase()}`)
                .join(', ')}
              .
            </span>
            <Button
              onClick={runImport}
              disabled={running || importable === 0}
              data-testid="import-run"
            >
              {running ? 'Importing…' : 'Import to server'}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {summaries.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-4 text-card-foreground">
          <span className="text-sm font-medium">Import results</span>
          <ul
            className="flex flex-col gap-1.5 text-xs"
            data-testid="import-summary"
          >
            {summaries.map((s, i) => (
              <li
                key={`${s.fileName}-${s.table}-${i}`}
                className="flex flex-col gap-1 rounded border border-border px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-mono">{s.fileName}</span> →{' '}
                    {TABLE_LABELS[s.table]}
                  </span>
                  <span className="flex gap-1">
                    <Badge variant="secondary">imported {s.imported}</Badge>
                    {s.skipped > 0 ? (
                      <Badge variant="outline">skipped {s.skipped}</Badge>
                    ) : null}
                    {s.failed > 0 ? (
                      <Badge variant="destructive">failed {s.failed}</Badge>
                    ) : null}
                  </span>
                </div>
                {s.errors.length > 0 ? (
                  <ul className="ml-4 list-disc text-destructive">
                    {s.errors.slice(0, 5).map((msg, j) => (
                      <li key={j} className="font-mono">
                        {msg}
                      </li>
                    ))}
                    {s.errors.length > 5 ? (
                      <li>…and {s.errors.length - 5} more.</li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
