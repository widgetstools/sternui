/**
 * StompPerspectiveFields — Connection-tab inputs for `stomp-perspective`.
 *
 * The wire settings are identical to a STOMP provider, so {@link StompFields}
 * is reused rather than duplicated — one editor to keep in step with the
 * transport. What this adds is the Table card: the handful of settings that
 * only mean something once the book is held in a Perspective Table.
 *
 * All inputs are shadcn primitives — no native controls.
 */

import { Input, Label, Switch } from '@starui/ui';
import type { StompPerspectiveProviderConfig, StompProviderConfig } from '@starui/shared-types';
import { StompFields } from './StompFields.js';

export interface StompPerspectiveFieldsProps {
  cfg: StompPerspectiveProviderConfig;
  onChange(next: Partial<StompPerspectiveProviderConfig>): void;
}

/** `a, b , c` → `['a','b','c']`, dropping blanks so a trailing comma is fine. */
function parseColumnList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function StompPerspectiveFields({ cfg, onChange }: StompPerspectiveFieldsProps) {
  const keyIsComposite = Array.isArray(cfg.keyColumn);

  return (
    <div className="space-y-4">
      <StompFields
        cfg={cfg as unknown as StompProviderConfig}
        onChange={onChange as (next: Partial<StompProviderConfig>) => void}
      />

      <Card title="Perspective Table">
        <Field label="Table Name">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.tableName ?? ''}
            onChange={(e) => onChange({ tableName: e.target.value || undefined })}
            placeholder="defaults to the provider id"
          />
          <Help>
            What a blotter opens (<code className="bg-muted px-1 rounded text-[10px]">open_table</code>).
            One Table per provider — every window reads a View of it instead of
            receiving its own copy of the rows.
          </Help>
        </Field>

        {keyIsComposite && (
          <Help>
            <strong className="text-foreground">Key Column is composite.</strong> Perspective
            indexes by a single scalar, so no Table will be built and this
            provider will serve the classic push path only. Set a single Key
            Column on the Behaviour tab to use the pull path.
          </Help>
        )}

        <Field label="Integer Columns">
          <Input
            className="h-8 text-sm font-mono"
            value={(cfg.integerColumns ?? []).join(', ')}
            onChange={(e) => onChange({ integerColumns: parseColumnList(e.target.value) })}
            placeholder="couponFrequency, lotSize"
          />
          <Help>
            Leave empty unless you need integer semantics. Numeric columns are
            typed <code className="bg-muted px-1 rounded text-[10px]">float</code> by
            default because Perspective silently TRUNCATES a float that lands in
            an integer column — on a real book one row in 20,000 was enough to
            make a sampled type wrong, and a double holds every integer to 2^53
            exactly, so float costs nothing.
          </Help>
        </Field>

        <Field label="Infer Date Columns">
          <div className="flex items-center gap-2">
            <Switch
              checked={cfg.inferDates !== false}
              onCheckedChange={(checked) => onChange({ inferDates: checked })}
            />
            <span className="text-xs text-muted-foreground">
              {cfg.inferDates !== false ? 'ISO strings → date / datetime' : 'keep as text'}
            </span>
          </div>
          <Help>
            Off means ISO date strings stay text, which loses server-side date
            sorting and range filtering.
          </Help>
        </Field>

        <Field label="Build Table After (rows)">
          <Input
            className="h-8 text-sm font-mono"
            type="number"
            value={cfg.buildAfterRows ?? ''}
            onChange={(e) =>
              onChange({
                buildAfterRows: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="2000"
          />
          <Help>
            Only used when there is no Snapshot End Token. With one, the Table is
            built when the snapshot completes, so its schema comes from the whole
            book rather than the first few thousand rows.
          </Help>
        </Field>
      </Card>
    </div>
  );
}

// ─── shared layout primitives — mirrors StompFields so each transport
//      can drop them in without an extra abstraction layer ──────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}
