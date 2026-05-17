import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Badge,
  Separator,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@starui/ui';
import {
  BookOpen,
  Database,
  Columns3,
  Plug,
  Layers,
  ExternalLink,
} from 'lucide-react';

interface HelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpSheet({ open, onOpenChange }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-ground)] p-0 sm:max-w-[680px]"
      >
        <SheetHeader className="space-y-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-5 py-4">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="flex items-center gap-2 font-mono text-[14px] tracking-tight text-[color:var(--ds-text-primary)]">
              <BookOpen size={14} strokeWidth={1.75} className="text-[color:var(--ds-accent-info)]" />
              MockDataProvider · usage guide
            </SheetTitle>
            <Badge className="border-transparent bg-[color:var(--ds-overlay-info-soft,rgba(56,189,248,0.12))] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
              Demo app
            </Badge>
          </div>
          <SheetDescription className="text-[12px] leading-relaxed text-[color:var(--ds-text-muted)]">
            Configure a synthetic provider, attach it to MarketsGrid two
            ways, and persist each grid's layout via the built-in profile
            system.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="quickstart" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 grid w-[calc(100%-2.5rem)] grid-cols-5 bg-[color:var(--ds-surface-sunken)]">
            <Trigger value="quickstart" label="Quick start" />
            <Trigger value="config"     label="Provider" />
            <Trigger value="columns"    label="Columns" />
            <Trigger value="wiring"     label="Wiring" />
            <Trigger value="layouts"    label="Layouts" />
          </TabsList>

          <Pane value="quickstart"><QuickStart /></Pane>
          <Pane value="config"><ProviderConfigDocs /></Pane>
          <Pane value="columns"><ColumnDocs /></Pane>
          <Pane value="wiring"><WiringDocs /></Pane>
          <Pane value="layouts"><LayoutDocs /></Pane>
        </Tabs>

        <Separator className="bg-[color:var(--ds-border-primary)]" />
        <div className="flex items-center justify-between gap-2 bg-[color:var(--ds-surface-primary)] px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
            Press <Kbd>Ctrl + /</Kbd> to toggle this panel
          </span>
          <a
            href="https://github.com/nndrao/starui"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-accent-info)]"
          >
            <ExternalLink size={11} strokeWidth={1.75} />
            View on GitHub
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Trigger({ value, label }: { value: string; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
    >
      {label}
    </TabsTrigger>
  );
}

function Pane({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent
      value={value}
      className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
    >
      <ScrollArea className="flex-1 px-5 py-4">{children}</ScrollArea>
    </TabsContent>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────

function QuickStart() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="What this demo shows" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <Prose>
          A four-panel workspace for learning <Code>MockDataProvider</Code>.
          The left panel edits the provider config; two MarketsGrid panels
          render the same stream wired two different ways; the bottom strip
          shows live throughput.
        </Prose>
      </Section>

      <Section title="The four panels" icon={<Layers size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="Provider config" desc="Pick dataType, rowCount, updateIntervalMs, and enableUpdates. Edits propagate to both grids; the JSON preview updates live." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Direct startMock" desc="Calls startMock(cfg, emit) directly in the same module. Simplest wiring." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="via DataServices" desc="Uses useProviderStream() from <DataServicesProvider>. Production wiring." />
        <ItemRow icon={<Columns3 size={13} strokeWidth={1.75} />} name="Live stats" desc="Rolling 5-second tick rate, row count, and last-update timestamp for each grid." />
      </Section>

      <Section title="Try it" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <Step n={1}>Set dataType to <Code>trades</Code> in the Provider Config panel. Both grids remount and show the trade book.</Step>
        <Step n={2}>Drag the <strong>updateIntervalMs</strong> slider to <Code>250</Code>. Watch ticks/s climb in the Stats strip.</Step>
        <Step n={3}>Open the gear icon in either grid → Conditional styling → add a rule. Hit the disk to save it as a layout. Switch dataType and back — your layout returns.</Step>
      </Section>

      <Section title="Keyboard shortcuts" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <ShortcutTable>
          <ShortcutRow keys="Ctrl + /"  label="Toggle this help drawer" />
          <ShortcutRow keys="Ctrl + ."  label="Switch theme (dark / light)" />
          <ShortcutRow keys="Ctrl + 1"  label="dataType = positions" />
          <ShortcutRow keys="Ctrl + 2"  label="dataType = trades" />
          <ShortcutRow keys="Ctrl + 3"  label="dataType = orders" />
        </ShortcutTable>
      </Section>
    </div>
  );
}

function ProviderConfigDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="MockProviderConfig" icon={<Database size={12} strokeWidth={1.75} />}>
        <Prose>
          The shape passed to <Code>startMock()</Code> or to
          <Code>useProviderStream()</Code>. All fields are optional except
          <Code>providerType</Code>.
        </Prose>
        <CodeBlock>
{`type MockProviderConfig = {
  providerType: 'mock';
  dataType?: 'positions' | 'trades' | 'orders';
  rowCount?: number;
  updateIntervalMs?: number;
  enableUpdates?: boolean;
};`}
        </CodeBlock>
      </Section>

      <Section title="Fields" icon={<Database size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="providerType: 'mock'" desc="Always 'mock'. The DataServices hub uses this to route the cfg to the mock transport." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="dataType" desc="'positions' (default, ~250-field bond portfolio) · 'trades' (lifecycle state machine, joins to positions by cusip) · 'orders' (legacy 7-column generator)." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="rowCount" desc="Snapshot size. Defaults: 50 (orders), 200 (trades), full universe size (positions). Values > universe cycle the universe." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="updateIntervalMs" desc="Ticker cadence. Each tick mutates 1–4% of the snapshot (positions/trades) or 1 random row (orders)." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="enableUpdates" desc="Pause/resume the ticker without resetting the snapshot. The grid keeps the data it has." />
      </Section>
    </div>
  );
}

function ColumnDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Column defs by dataType" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          AG-Grid column defs. Each demo column-def set targets the field
          names emitted by the matching mock builder.
        </Prose>
        <CodeBlock>
{`// data/columnDefsByType.ts
export const columnDefsByType = {
  positions: { columnDefs: positionColumnDefs, rowIdField: 'cusip',   defaultColDef },
  trades:    { columnDefs: tradeColumnDefs,    rowIdField: 'tradeId', defaultColDef },
  orders:    { columnDefs: orderColumnDefs,    rowIdField: 'id',      defaultColDef },
};`}
        </CodeBlock>
      </Section>

      <Section title="rowIdField" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          MarketsGrid needs a stable id per row so deltas merge cleanly.
          Positions are unique per <Code>cusip</Code>; trades per
          <Code>tradeId</Code>; orders use the synthetic <Code>id</Code>.
        </Prose>
      </Section>

      <Section title="Formatting" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          Money fields use thousands-grouped <Code>Intl.NumberFormat</Code>;
          prices use 3 decimals; yields append <Code>%</Code>; timestamps
          render as local <Code>HH:mm:ss</Code>. All editable later from the
          formatter toolbar — these defaults exist so the grid looks
          plausible on first render.
        </Prose>
      </Section>
    </div>
  );
}

function WiringDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Path 1 — Direct startMock()" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          Simplest wiring. <Code>startMock(cfg, emit)</Code> is a pure
          function that returns a <Code>ProviderHandle</Code> and pushes
          events into <Code>emit</Code>. No worker, no provider context.
        </Prose>
        <CodeBlock>
{`import { startMock } from '@starui/data-services';

const handle = startMock(cfg, (evt) => {
  if ('rows' in evt) {
    if (evt.replace) rowsRef.current = [...evt.rows];
    else rowsRef.current = applyDelta(rowsRef.current, evt.rows, idField);
    setRows(rowsRef.current);
  }
});
return () => handle.stop();`}
        </CodeBlock>
      </Section>

      <Section title="Path 2 — useProviderStream()" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          Production wiring. The cfg is sent to a SharedWorker hub that
          owns the provider instance and broadcasts deltas to every
          subscribed tab/window.
        </Prose>
        <CodeBlock>
{`// main.tsx
const services = createDataServicesClient({ appName, userId });
<DataServicesProvider services={services}><App /></DataServicesProvider>

// panel
useProviderStream(providerId, cfg, {
  onDelta: (rows, replace) => { /* same shape as path 1 */ },
  onStatus: () => undefined,
});`}
        </CodeBlock>
      </Section>

      <Section title="When to pick each" icon={<Plug size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Pick Direct when…" desc="You only need one provider in a single tab, you want zero infra, or you're embedding in a test." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Pick DataServices when…" desc="Multiple panels or windows share the same provider, you need provider configs to be persisted as named entities, or you want SharedWorker cross-tab broadcast." />
      </Section>

      <Section title="Lifecycle" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          Every provider emits <Code>status: 'loading'</Code> immediately,
          pushes its initial snapshot with <Code>replace: true</Code>,
          transitions to <Code>status: 'ready'</Code>, then starts ticking.
          <Code>handle.stop()</Code> is idempotent.
          <Code>handle.restart(extra)</Code> overlays new fields on the
          current cfg and re-emits.
        </Prose>
      </Section>
    </div>
  );
}

function LayoutDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="One bundle per (panel × dataType)" icon={<Layers size={12} strokeWidth={1.75} />}>
        <Prose>
          Each MarketsGrid uses a <Code>gridId</Code> that encodes both
          the panel and the dataType, so its profile bundle is independent.
        </Prose>
        <CodeBlock>
{`Direct panel        →  mockdata-direct-<dataType>-v1
DataServices panel  →  mockdata-via-ds-<dataType>-v1`}
        </CodeBlock>
        <Prose>
          Six combinations → six independent <Code>localStorage</Code>
          bundles. Saving a layout in "Direct + positions" leaves
          "Direct + trades" untouched.
        </Prose>
      </Section>

      <Section title="What gets saved" icon={<Layers size={12} strokeWidth={1.75} />}>
        <Prose>
          Every formatter setting, every customizer module's state, and
          AG-Grid's column model (visibility, order, width, sort, filter
          model) are bundled into a named layout. Switching layouts via
          the dropdown replays each module's state in order; AG-Grid's
          state always runs last.
        </Prose>
      </Section>

      <Section title="Storage keys" icon={<Layers size={12} strokeWidth={1.75} />}>
        <div className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-secondary)]">
          <div>markets-grid-bundle:mockdata-direct-positions-v1</div>
          <div>markets-grid-bundle:mockdata-direct-trades-v1</div>
          <div>markets-grid-bundle:mockdata-direct-orders-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-positions-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-trades-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-orders-v1</div>
        </div>
      </Section>
    </div>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
        <span className="inline-flex">{icon}</span>
        {title}
      </h3>
      <div className="flex flex-col gap-2 pl-1">{children}</div>
    </section>
  );
}

function ItemRow({ icon, name, desc }: { icon: ReactNode; name: string; desc: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-2.5">
      <span className="mt-[3px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] text-[color:var(--ds-text-secondary)]">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] font-semibold text-[color:var(--ds-text-primary)]">{name}</span>
        <span className="text-[11.5px] leading-relaxed text-[color:var(--ds-text-muted)]">{desc}</span>
      </div>
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">{children}</p>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-[1px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold text-[color:var(--ds-accent-info)]">
        {n}
      </span>
      <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">{children}</p>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[11px] text-[color:var(--ds-text-secondary)]">{children}</code>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-primary)]">{children}</pre>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[10px] font-medium text-[color:var(--ds-text-primary)] shadow-[0_1px_0_0_var(--ds-border-primary)]">{children}</kbd>
  );
}

function ShortcutTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
      <table className="w-full text-[12px]">
        <tbody className="divide-y divide-[color:var(--ds-border-primary)]">{children}</tbody>
      </table>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <tr className="bg-[color:var(--ds-surface-primary)]">
      <td className="w-[110px] border-r border-[color:var(--ds-border-primary)] px-3 py-2 align-middle">
        <Kbd>{keys}</Kbd>
      </td>
      <td className="px-3 py-2 text-[12px] text-[color:var(--ds-text-secondary)]">{label}</td>
    </tr>
  );
}
