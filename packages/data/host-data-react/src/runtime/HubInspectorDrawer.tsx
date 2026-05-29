/**
 * HubInspectorDrawer — dev/operator view of SharedWorker hub state.
 *
 * Open with Alt+Shift+S (Option+Shift+S on macOS). Polls `hub-introspect`
 * while open so subscriber + cache counts stay live.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@starui/ui';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';
import type {
  HubAppDataIntrospectRow,
  HubIntrospectSnapshot,
  HubProviderIntrospectRow,
  ProviderStatus,
} from '@starui/host-data/runtime';
import { useDataServices } from './index.js';

const POLL_MS = 1000;

export interface HubInspectorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HubInspectorDrawer({ open, onOpenChange }: HubInspectorDrawerProps): React.ReactNode {
  const { client } = useDataServices();
  const [snapshot, setSnapshot] = useState<HubIntrospectSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [expandedAppDataId, setExpandedAppDataId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await client.getHubIntrospect();
      setSnapshot(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  const totalRows = snapshot?.providers.reduce((sum, p) => sum + (p.rowCount ?? 0), 0) ?? 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent hideHandle className="left-auto right-0 top-0 mt-0 h-full w-full max-w-2xl rounded-none border-l">
        <DrawerHeader className="border-b border-border pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle className="text-base">Data Services Hub</DrawerTitle>
              <DrawerDescription className="text-xs">
                SharedWorker runtime — providers, loaded configs, subscribers, and cache sizes
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => { void refresh(); }}
                disabled={loading}
                title="Refresh now"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <DrawerClose asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Close">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <section className="grid grid-cols-2 gap-3 text-xs">
            <SummaryStat label="Connected ports" value={fmtInt(snapshot?.connectedPorts)} />
            <SummaryStat label="Catalog ready" value={snapshot?.catalogReady ? 'yes' : 'no'} />
            <SummaryStat label="Catalog providers" value={fmtInt(snapshot?.catalogProviderCount)} />
            <SummaryStat label="Running providers" value={fmtInt(snapshot?.runningProviderCount)} />
            <SummaryStat label="Cached rows (total)" value={fmtInt(totalRows)} />
            <SummaryStat label="AppData listeners" value={fmtInt(snapshot?.appData?.listenerCount)} />
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Providers
            </h3>
            <Separator />
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-[11px]">Id</TableHead>
                    <TableHead className="text-[11px]">Type</TableHead>
                    <TableHead className="text-[11px]">Status</TableHead>
                    <TableHead className="text-[11px] text-right">Subs</TableHead>
                    <TableHead className="text-[11px] text-right">Rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(snapshot?.providers.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs text-muted-foreground py-6 text-center">
                        No providers in catalog or runtime
                      </TableCell>
                    </TableRow>
                  ) : (
                    snapshot?.providers.map((row) => (
                      <ProviderRows
                        key={row.providerId}
                        row={row}
                        expanded={expandedProviderId === row.providerId}
                        onToggle={() => {
                          setExpandedProviderId((prev) => (prev === row.providerId ? null : row.providerId));
                        }}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              AppData
            </h3>
            <Separator />
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-[11px]">Name</TableHead>
                    <TableHead className="text-[11px]">Config id</TableHead>
                    <TableHead className="text-[11px] text-right">Keys</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(snapshot?.appData.rows.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-xs text-muted-foreground py-6 text-center">
                        No AppData rows loaded
                      </TableCell>
                    </TableRow>
                  ) : (
                    snapshot?.appData.rows.map((row) => (
                      <AppDataRows
                        key={row.configId}
                        row={row}
                        expanded={expandedAppDataId === row.configId}
                        onToggle={() => {
                          setExpandedAppDataId((prev) => (prev === row.configId ? null : row.configId));
                        }}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <p className="text-[10px] text-muted-foreground">
            Alt+Shift+S toggles this panel. Expand a row to inspect the worker-loaded config JSON.
            Running providers show the live slot cfg; idle catalog rows show the cached transport cfg.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ProviderRows({
  row,
  expanded,
  onToggle,
}: {
  row: HubProviderIntrospectRow;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactNode {
  const hasCfg = row.cfg != null;
  return (
    <>
      <TableRow className={hasCfg ? 'cursor-pointer hover:bg-muted/40' : undefined} onClick={hasCfg ? onToggle : undefined}>
        <TableCell className="py-2 w-8 text-muted-foreground">
          {hasCfg ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : null}
        </TableCell>
        <TableCell className="font-mono text-[11px] max-w-[120px] truncate" title={row.providerId}>
          {row.providerId}
        </TableCell>
        <TableCell className="text-xs">{row.providerType}</TableCell>
        <TableCell>
          <StatusBadge running={row.running} status={row.status} />
        </TableCell>
        <TableCell className="text-right font-mono text-xs">{row.running ? fmtInt(row.subscriberCount) : '—'}</TableCell>
        <TableCell className="text-right font-mono text-xs">{row.running ? fmtInt(row.rowCount) : '—'}</TableCell>
      </TableRow>
      {expanded && hasCfg && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20 p-0">
            <ConfigJsonBlock
              title={row.running ? 'Runtime provider cfg' : 'Catalog provider cfg'}
              value={row.cfg}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function AppDataRows({
  row,
  expanded,
  onToggle,
}: {
  row: HubAppDataIntrospectRow;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactNode {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={onToggle}>
        <TableCell className="py-2 w-8 text-muted-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </TableCell>
        <TableCell className="font-mono text-xs">{row.name}</TableCell>
        <TableCell className="font-mono text-[11px] text-muted-foreground">{row.configId}</TableCell>
        <TableCell className="text-right font-mono text-xs">{row.keyCount}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/20 p-0">
            <ConfigJsonBlock title="AppData values" value={row.values} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ConfigJsonBlock({ title, value }: { title: string; value: unknown }): React.ReactNode {
  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <pre className="max-h-64 overflow-auto rounded border border-border bg-background px-2 py-2 text-[11px] font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function StatusBadge({ running, status }: { running: boolean; status?: ProviderStatus }): React.ReactNode {
  if (!running) {
    return (
      <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
        idle
      </Badge>
    );
  }
  const tone =
    status === 'ready' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
    status === 'loading' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
    status === 'error' ? 'bg-destructive/15 text-destructive' :
    'bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={`${tone} text-[10px] font-medium`}>
      {status ?? 'unknown'}
    </Badge>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }): React.ReactNode {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-0.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-medium">{value}</div>
    </div>
  );
}

function fmtInt(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString();
}
