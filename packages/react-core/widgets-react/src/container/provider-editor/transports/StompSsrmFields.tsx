/**
 * StompSsrmFields — Connection-tab inputs for SSRM STOMP providers
 * (`providerType: 'stomp-ssrm'`, the pull plane).
 *
 * Exposes exactly the SSRM surface: broker/topic/trigger, snapshot end
 * token, the REQUIRED key column (Perspective table index), the table
 * name, and every WINDOW-side query knob the pull datasource takes:
 * calc/expression columns, weighted-mean sources, BOTH tree shapes
 * (path levels or a parent-id column), column-projection narrowing and
 * the wide-book refresh gate. None of the push-plane knobs exist here —
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

import { Button, Input, Label, Switch } from '@starui/ui';
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

      <Card title="Weighted Aggregates">
        <div data-testid="ssrm-weighted-aggregates">
          <KeyValueEditor
            label="Weighted Means"
            description="Value column → weight column (OAS by DV01, WAL by notional)"
            value={cfg.weightedAggregates ?? {}}
            onChange={(next) =>
              onChange({ weightedAggregates: Object.keys(next).length > 0 ? next : undefined })
            }
            keyPlaceholder="oas"
            valuePlaceholder="dv01"
          />
        </div>
        <FieldErrors
          testId="ssrm-weighted-aggregates-error"
          errors={errorsFor('weightedAggregates')}
        />
        <Help>
          AG's value columns carry no weight slot, so a column aggregated with
          'wavg' takes its weight from here. A weighted column with no weight is
          REFUSED, never downgraded to a plain average — a weighted spread served
          unweighted is a wrong number that looks right. The weight must be a
          declared numeric column.
        </Help>
      </Card>

      <Card title="Tree Data">
        <ColumnListEditor
          label="Tree Levels"
          addLabel="Add Level"
          emptyLabel="No tree levels configured"
          placeholder="bookName"
          testId="ssrm-tree-path-fields"
          addTestId="ssrm-tree-path-add"
          rowTestId="ssrm-tree-path-level"
          ordered
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
        <Field label="Tree Parent Column">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.treeParentField ?? ''}
            onChange={(e) =>
              onChange({ treeParentField: e.target.value === '' ? undefined : e.target.value })
            }
            placeholder="parentPositionId"
            data-testid="ssrm-tree-parent-field"
          />
          <FieldErrors
            testId="ssrm-tree-parent-field-error"
            errors={errorsFor('treeParentField')}
          />
          <Help>
            The OTHER tree shape: a natural parent-id adjacency column (each row names
            its parent's key; roots have none). Rows keep their own key as the grid row
            id. Use this OR the levels above — never both.
          </Help>
        </Field>
      </Card>

      <Card title="Column Projection">
        <div className="flex items-center gap-2">
          <Switch
            id="ssrm-project-displayed-columns"
            checked={cfg.projectDisplayedColumns === true}
            onCheckedChange={(v) =>
              onChange({ projectDisplayedColumns: v ? true : undefined })
            }
            data-testid="ssrm-project-displayed-columns"
          />
          <Label
            htmlFor="ssrm-project-displayed-columns"
            className="text-xs font-medium text-muted-foreground"
          >
            Read only displayed columns
          </Label>
        </div>
        <Help>
          Narrows every read to the columns the grid is actually rendering. View build
          cost scales with projected width, so this is worth real time on a wide book —
          but it is OPT-IN: a cell renderer reading a SIBLING field that is not itself
          a displayed column would find it missing. List those below.
        </Help>
        <ColumnListEditor
          label="Always Projected"
          addLabel="Add Column"
          emptyLabel="No always-projected columns configured"
          placeholder="pnlPrev"
          testId="ssrm-always-project-columns"
          addTestId="ssrm-always-project-add"
          rowTestId="ssrm-always-project-column"
          value={cfg.alwaysProjectColumns ?? []}
          onChange={(columns) =>
            onChange({ alwaysProjectColumns: columns.length > 0 ? columns : undefined })
          }
        />
        <FieldErrors
          testId="ssrm-always-project-columns-error"
          errors={errorsFor('alwaysProjectColumns')}
        />
        <Help>
          Projected even when not displayed. Only consulted while the switch above is
          on.
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

/**
 * Column-name list — index-keyed rows, same feel as KeyValueEditor.
 * `ordered` numbers the rows for lists where position is meaning (tree
 * levels); the projection list is a set, so it stays unnumbered.
 */
function ColumnListEditor({
  label,
  addLabel,
  emptyLabel,
  placeholder,
  testId,
  addTestId,
  rowTestId,
  ordered,
  value,
  onChange,
}: {
  label: string;
  addLabel: string;
  emptyLabel: string;
  placeholder: string;
  testId: string;
  addTestId: string;
  rowTestId: string;
  ordered?: boolean;
  value: string[];
  onChange(next: string[]): void;
}) {
  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, ''])}
          className="h-7 gap-1 text-xs"
          data-testid={addTestId}
        >
          <Plus className="h-3 w-3" />
          {addLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {value.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              {ordered && (
                <span className="text-[11px] text-muted-foreground w-4 text-right">
                  {index + 1}
                </span>
              )}
              <Input
                value={entry}
                onChange={(e) =>
                  onChange(value.map((v, i) => (i === index ? e.target.value : v)))
                }
                placeholder={placeholder}
                className="flex-1 h-8 text-sm font-mono"
                data-testid={`${rowTestId}-${index}`}
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
