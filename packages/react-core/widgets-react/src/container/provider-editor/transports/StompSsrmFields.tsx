/**
 * StompSsrmFields — Connection-tab inputs for SSRM STOMP providers
 * (`providerType: 'stomp-ssrm'`, the pull plane).
 *
 * Exposes exactly the SSRM transport surface: broker/topic/trigger,
 * snapshot end token, the REQUIRED key column (Perspective table
 * index) and the table name. None of the push-plane knobs exist here —
 * windows read the worker-hosted Perspective table directly, so there
 * is nothing to fan out, throttle or conflate.
 *
 * Validation is inline: `validateStompSsrmConfig` runs on every render
 * and each issue is shown under the field it points at (the same
 * validator gates the config at the catalog seam, so the editor and
 * the store can never disagree about what "valid" means).
 *
 * Layout mirrors StompFields (cards of shadcn primitives — no native
 * controls; colors via design-system tokens only).
 */

import { Input, Label } from '@starui/ui';
import type { StompSsrmProviderConfig, StompSsrmIssueField } from '@starui/shared-types';
import { validateStompSsrmConfig } from '@starui/shared-types';

export interface StompSsrmFieldsProps {
  cfg: StompSsrmProviderConfig;
  onChange(next: Partial<StompSsrmProviderConfig>): void;
}

export function StompSsrmFields({ cfg, onChange }: StompSsrmFieldsProps) {
  const issues = validateStompSsrmConfig(cfg);
  const errorFor = (field: StompSsrmIssueField): string | null =>
    issues.find((i) => i.field === field)?.message ?? null;

  return (
    <div className="space-y-4">
      <Card title="Connection">
        <Field label="WebSocket URL" required>
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.websocketUrl ?? ''}
            onChange={(e) => onChange({ websocketUrl: e.target.value })}
            placeholder="ws://localhost:8081"
            data-testid="ssrm-websocket-url"
          />
          <FieldError testId="ssrm-websocket-url-error">{errorFor('websocketUrl')}</FieldError>
          <Help>
            The SSRM provider worker dials this broker and streams the book straight
            into its hosted Perspective table.
          </Help>
        </Field>
        <Field label="Listener Topic" required>
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.listenerTopic ?? ''}
            onChange={(e) => onChange({ listenerTopic: e.target.value })}
            placeholder="/snapshot/positions/GRID1"
            data-testid="ssrm-listener-topic"
          />
          <FieldError testId="ssrm-listener-topic-error">{errorFor('listenerTopic')}</FieldError>
          <Help>The topic carrying snapshot batches followed by live ticks.</Help>
        </Field>
      </Card>

      <Card title="Trigger">
        <Field label="Trigger Destination">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.requestMessage ?? ''}
            onChange={(e) => onChange({ requestMessage: e.target.value })}
            placeholder="/snapshot/positions/GRID1/1000"
          />
          <Help>
            SEND destination published after subscribing to start the snapshot.
            Leave empty for push-only brokers.
          </Help>
        </Field>
        <Field label="Trigger Body">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.requestBody ?? ''}
            onChange={(e) => onChange({ requestBody: e.target.value })}
            placeholder="(empty — rate in destination)"
          />
          <Help>Literal body for the trigger frame. Only sent with a destination.</Help>
        </Field>
        <Field label="Snapshot End Token">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.snapshotEndToken ?? ''}
            onChange={(e) => onChange({ snapshotEndToken: e.target.value })}
            placeholder="Success"
          />
          <Help>
            Case-insensitive substring that ends the seed: the dataset flips
            'seeding' → 'live' and later frames apply as keyed tick updates.
          </Help>
        </Field>
      </Card>

      <Card title="Row Identity">
        <Field label="Key Column" required>
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.keyColumn ?? ''}
            onChange={(e) => onChange({ keyColumn: e.target.value })}
            placeholder="positionId"
            data-testid="ssrm-key-column"
          />
          <FieldError testId="ssrm-key-column-error">{errorFor('keyColumn')}</FieldError>
          <Help>
            The Perspective table index — every snapshot row and live tick is keyed
            on it. A single column only; it must appear in the column definitions
            (Columns tab) once columns are declared.
          </Help>
        </Field>
        <Field label="Table Name">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.tableName ?? ''}
            onChange={(e) => onChange({ tableName: e.target.value })}
            placeholder="dataset"
          />
          <Help>
            Name windows open on the provider worker. Default 'dataset' — set it
            only when consumers address the table explicitly.
          </Help>
        </Field>
      </Card>
    </div>
  );
}

// ─── shared layout primitives — same local pattern as the other
//      transports (no extra abstraction layer) ──────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}{required ? ' *' : ''}
      </Label>
      {children}
    </div>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

function FieldError({ children, testId }: { children: string | null; testId: string }) {
  if (!children) return null;
  return (
    <p className="text-[11px] text-destructive" data-testid={testId} role="alert">
      {children}
    </p>
  );
}
