/**
 * StompSsrmFields — Connection-tab inputs for SSRM STOMP providers
 * (`providerType: 'stomp-ssrm'`, the pull plane).
 *
 * Exposes exactly the SSRM surface: broker/topic/trigger, snapshot end
 * token, the REQUIRED key column (Perspective table index), the table
 * name, and the WINDOW-side query knobs (P4b-2): calc/expression
 * columns, tree path levels and the wide-book refresh gate. None of
 * the push-plane knobs exist here — windows read the worker-hosted
 * Perspective table directly, so there is nothing to fan out, throttle
 * or conflate.
 *
 * Validation is inline: `validateStompSsrmConfig` runs on every render
 * and each issue is shown under the field it points at (the same
 * validator gates the config at the catalog seam, so the editor and
 * the store can never disagree about what "valid" means).
 *
 * Layout mirrors StompFields (cards of shadcn primitives — no native
 * controls; colors via design-system tokens only).
 */

import { Button, Input, Label } from '@starui/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { StompSsrmProviderConfig, StompSsrmIssueField } from '@starui/shared-types';
import { validateStompSsrmConfig } from '@starui/shared-types';
import { KeyValueEditor } from '../KeyValueEditor.js';

export interface StompSsrmFieldsProps {
  cfg: StompSsrmProviderConfig;
  onChange(next: Partial<StompSsrmProviderConfig>): void;
}

export function StompSsrmFields({ cfg, onChange }: StompSsrmFieldsProps) {
  const issues = validateStompSsrmConfig(cfg);
  const errorFor = (field: StompSsrmIssueField): string | null =>
    issues.find((i) => i.field === field)?.message ?? null;
  const errorsFor = (field: StompSsrmIssueField): string[] =>
    issues.filter((i) => i.field === field).map((i) => i.message);

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

      <Card title="Calculated Columns">
        <div data-testid="ssrm-calc-expressions">
          <KeyValueEditor
            label="Calc Expressions"
            description="Column name → Perspective expression over real columns"
            value={cfg.calcExpressions ?? {}}
            onChange={(next) =>
              onChange({ calcExpressions: Object.keys(next).length > 0 ? next : undefined })
            }
            keyPlaceholder="pnlPerUnit"
            valuePlaceholder='"pnl" / "quantity"'
          />
        </div>
        <FieldErrors testId="ssrm-calc-expressions-error" errors={errorsFor('calcExpressions')} />
        <Help>
          Window-side: each expression is attached to every view the grid builds, so
          calc columns sort, filter, aggregate and export like real columns — they are
          never part of the worker's table schema. Expressions can only reference real
          columns (quoted, e.g. "pnl"), not other calc columns.
        </Help>
      </Card>

      <Card title="Tree Data">
        <TreePathFieldsEditor
          value={cfg.treePathFields ?? []}
          onChange={(levels) =>
            onChange({ treePathFields: levels.length > 0 ? levels : undefined })
          }
        />
        <FieldErrors testId="ssrm-tree-path-fields-error" errors={errorsFor('treePathFields')} />
        <Help>
          Ordered categorical columns that synthesize a server-side tree (level 1
          groups by the first field, and so on; the deepest route reads leaf rows) —
          the dataset needs no parent/child column. Leave empty for flat data.
          Mutually exclusive with row grouping in the consuming grid.
        </Help>
      </Card>

      <Card title="Wide-Book Refresh Gate">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wide Column Threshold">
            <Input
              type="number"
              className="h-8 text-sm"
              min={1}
              step={1}
              value={cfg.wideColumnThreshold ?? ''}
              onChange={(e) =>
                onChange({
                  wideColumnThreshold:
                    e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="80"
              data-testid="ssrm-wide-column-threshold"
            />
          </Field>
          <Field label="Wide Sweep Throttle (ms)">
            <Input
              type="number"
              className="h-8 text-sm"
              min={100}
              step={100}
              value={cfg.sweepThrottleWideMs ?? ''}
              onChange={(e) =>
                onChange({
                  sweepThrottleWideMs:
                    e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              placeholder="1000"
              data-testid="ssrm-sweep-throttle-wide"
            />
          </Field>
        </div>
        <FieldErrors
          testId="ssrm-wide-gate-error"
          errors={[...errorsFor('wideColumnThreshold'), ...errorsFor('sweepThrottleWideMs')]}
        />
        <Help>
          At or above the column threshold (default 80) the live tick sweep degrades
          to the wide throttle (default 1000 ms) and refreshes only the viewport's
          most recently used blocks — off-screen blocks catch up on scroll-back.
          Leave both empty for the defaults.
        </Help>
      </Card>
    </div>
  );
}

/** Ordered list of tree levels — index-keyed rows, same feel as KeyValueEditor. */
function TreePathFieldsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange(levels: string[]): void;
}) {
  return (
    <div className="space-y-3" data-testid="ssrm-tree-path-fields">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Tree Levels</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, ''])}
          className="h-7 gap-1 text-xs"
          data-testid="ssrm-tree-path-add"
        >
          <Plus className="h-3 w-3" />
          Add Level
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">No tree levels configured</p>
      ) : (
        <div className="space-y-2">
          {value.map((level, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-4 text-right">{index + 1}</span>
              <Input
                value={level}
                onChange={(e) =>
                  onChange(value.map((v, i) => (i === index ? e.target.value : v)))
                }
                placeholder="bookName"
                className="flex-1 h-8 text-sm font-mono"
                data-testid={`ssrm-tree-path-level-${index}`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
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

/** Multi-issue variant — record-shaped fields can carry several problems at once. */
function FieldErrors({ errors, testId }: { errors: string[]; testId: string }) {
  if (errors.length === 0) return null;
  return (
    <div className="space-y-0.5" data-testid={testId} role="alert">
      {errors.map((message, i) => (
        <p key={i} className="text-[11px] text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
