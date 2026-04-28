/**
 * DataProviderEditor — outer shell with a list (left) + form (right).
 *
 * Routes ARE NOT used here; the popout opens this component directly
 * with an optional `initialProviderId`. The list is reactive — when
 * the form saves, the list refresh()es so the new row pops in.
 *
 * Layout: viewport-fit. Outer container is `overflow: hidden`. The
 * left list owns its own scroll; the right pane delegates scrolling
 * to the form's tab bodies.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger, Input, Label, ScrollArea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@marketsui/ui';
import { Database, Globe, Plus, Radio, Search, Trash2, TestTube2 } from 'lucide-react';
import type { DataProviderConfig, ProviderConfig, ProviderType } from '@marketsui/shared-types';
import { useDataPlane, useDataProvidersList } from '@marketsui/data-plane-react/v2';
import { EditorForm } from './EditorForm.js';

// ─── Provider-type defaults — keep MINIMAL; everything else is
//      filled in via the form's per-transport components ──────────

const PROVIDER_TYPE_META: Record<ProviderType, { label: string; description: string; icon: typeof Database }> = {
  stomp: { label: 'STOMP', description: 'WebSocket streaming with snapshot + delta semantics.', icon: Radio },
  rest: { label: 'REST', description: 'One-shot HTTP fetch — no live updates.', icon: Globe },
  websocket: { label: 'WebSocket', description: 'Raw WebSocket, framed by you.', icon: Radio },
  socketio: { label: 'Socket.IO', description: 'Socket.IO event-driven channel.', icon: Radio },
  mock: { label: 'Mock', description: 'In-memory dummy stream — for dev/tests.', icon: TestTube2 },
  appdata: { label: 'AppData', description: 'Key/value store referenced by other providers via {{name.key}}.', icon: Database },
};

const SUPPORTED_TYPES: ProviderType[] = ['stomp', 'rest', 'mock', 'appdata'];

export interface DataProviderEditorProps {
  userId: string;
  /** Optional id to focus on open (popout receives via query string). */
  initialProviderId?: string | null;
  /** Optional close callback (popout window close). */
  onClose?: () => void;
}

export function DataProviderEditor({ userId, initialProviderId = null, onClose }: DataProviderEditorProps) {
  const { configStore } = useDataPlane();
  const list = useDataProvidersList();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialProviderId);
  const [creating, setCreating] = useState<DataProviderConfig | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DataProviderConfig | null>(null);

  // Resolve which row to edit. `creating` (an in-memory draft) wins
  // until saved; otherwise look up the selected id in the list.
  const selected = useMemo<DataProviderConfig | null>(() => {
    if (creating) return creating;
    if (!selectedId) return null;
    return list.configs.find((c) => c.providerId === selectedId) ?? null;
  }, [creating, selectedId, list.configs]);

  // When the popout opens with initialProviderId, snap selection
  // once the list resolves.
  useEffect(() => {
    if (initialProviderId && !selectedId && list.configs.some((c) => c.providerId === initialProviderId)) {
      setSelectedId(initialProviderId);
    }
  }, [initialProviderId, selectedId, list.configs]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return list.configs;
    return list.configs.filter((c) =>
      c.name.toLowerCase().includes(s) ||
      c.providerType.toLowerCase().includes(s) ||
      (c.description ?? '').toLowerCase().includes(s),
    );
  }, [list.configs, search]);

  const startCreate = (type: ProviderType) => {
    const fresh: DataProviderConfig = {
      providerId: undefined,
      name: 'untitled',
      providerType: type,
      config: { providerType: type } as ProviderConfig,
      userId,
      public: false,
    };
    setCreating(fresh);
    setSelectedId(null);
  };

  const onSaved = (saved: DataProviderConfig) => {
    setCreating(null);
    setSelectedId(saved.providerId ?? null);
    list.refresh();
  };

  const onDelete = async (cfg: DataProviderConfig) => {
    if (!cfg.providerId) return;
    await configStore.remove(cfg.providerId);
    setConfirmDelete(null);
    if (selectedId === cfg.providerId) setSelectedId(null);
    list.refresh();
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <Sidebar
        configs={filtered}
        loading={list.loading}
        error={list.error}
        search={search}
        onSearchChange={setSearch}
        selectedId={selectedId ?? creating?.providerId ?? null}
        onSelect={(id) => { setCreating(null); setSelectedId(id); }}
        onNew={startCreate}
        onDeleteRequest={setConfirmDelete}
      />

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {selected ? (
          <EditorForm
            initial={selected}
            userId={userId}
            onCancel={onClose}
            onSaved={onSaved}
          />
        ) : (
          <EmptyRight onNew={startCreate} />
        )}
      </main>

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete provider?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.name} will be removed. Subscribers in other windows will fail
              to re-attach until a replacement is configured. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDelete && onDelete(confirmDelete)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sidebar — list of saved providers + "+ New" picker ──────────

function Sidebar({
  configs, loading, error, search, onSearchChange, selectedId, onSelect, onNew, onDeleteRequest,
}: {
  configs: readonly DataProviderConfig[];
  loading: boolean;
  error?: string;
  search: string;
  onSearchChange(s: string): void;
  selectedId: string | null;
  onSelect(id: string): void;
  onNew(type: ProviderType): void;
  onDeleteRequest(cfg: DataProviderConfig): void;
}) {
  return (
    <aside className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col min-h-0">
      <div className="px-3 py-3 border-b border-border space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Providers</h2>
          <NewProviderPicker onPick={onNew} />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          {loading && <li className="text-xs text-muted-foreground px-2 py-3">Loading…</li>}
          {error && <li className="text-xs text-destructive px-2 py-3">{error}</li>}
          {!loading && configs.length === 0 && (
            <li className="text-xs text-muted-foreground px-2 py-3">No providers yet.</li>
          )}
          {configs.map((c) => (
            <SidebarRow
              key={c.providerId}
              cfg={c}
              selected={selectedId === c.providerId}
              onSelect={() => c.providerId && onSelect(c.providerId)}
              onDelete={() => onDeleteRequest(c)}
            />
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}

function SidebarRow({
  cfg, selected, onSelect, onDelete,
}: { cfg: DataProviderConfig; selected: boolean; onSelect(): void; onDelete(): void }) {
  const meta = PROVIDER_TYPE_META[cfg.providerType] ?? PROVIDER_TYPE_META.mock;
  const Icon = meta.icon;
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
      className={[
        'group rounded-md px-2 py-1.5 cursor-pointer flex items-center gap-2 text-xs',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{cfg.name}</div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span>{meta.label}</span>
          {cfg.public && <Badge variant="outline" className="h-3.5 px-1 text-[9px]">Public</Badge>}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </li>
  );
}

function NewProviderPicker({ onPick }: { onPick(type: ProviderType): void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ProviderType>('stomp');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" /> New</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Provider</DialogTitle>
          <DialogDescription>Pick a transport. You can change details after.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ProviderType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-sm">
                    {PROVIDER_TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{PROVIDER_TYPE_META[type].description}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { setOpen(false); onPick(type); }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyRight({ onNew }: { onNew(type: ProviderType): void }) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <Database className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-60" />
        <h2 className="text-base font-semibold mb-1">No provider selected</h2>
        <p className="text-xs text-muted-foreground mb-5">
          Pick a provider on the left, or create a new one to get started.
        </p>
        <div className="flex justify-center">
          <Button size="sm" onClick={() => onNew('stomp')}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New STOMP Provider
          </Button>
        </div>
      </div>
    </div>
  );
}
