import { memo } from 'react';
import { IconInput, LedBar, MetaCell, Mono } from '../../../ui/SettingsPanel';
import { Select, Switch } from '../../../ui/shadcn';
import type { ConditionalRule, FlashTarget } from '../state';

export const RuleMetaStrip = memo(function RuleMetaStrip({
  ruleId,
  enabled,
  scopeType,
  priority,
  flash,
  appliedCount,
  setDraft,
}: {
  ruleId: string;
  enabled: boolean;
  scopeType: 'cell' | 'row';
  priority: number;
  flash: ConditionalRule['flash'];
  appliedCount: number;
  setDraft: (patch: Partial<ConditionalRule>) => void;
}) {
  return (
    <div className="gc-meta-grid">
      <MetaCell
        label="STATUS"
        value={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <LedBar on={enabled} />
            <Switch
              checked={enabled}
              onChange={(e) => setDraft({ enabled: e.target.checked })}
            />
            <Mono color={enabled ? 'var(--ck-green)' : 'var(--ck-t2)'}>
              {enabled ? 'ACTIVE' : 'MUTED'}
            </Mono>
          </span>
        }
      />
      <MetaCell
        label="SCOPE"
        value={
          <Select
            value={scopeType}
            onChange={(e) => {
              const v = e.target.value;
              const nextScope =
                v === 'row'
                  ? { type: 'row' as const }
                  : { type: 'cell' as const, columns: [] };
              // Flash target is scope-constrained: row → 'row',
              // cell → 'cells' | 'headers' | 'cells+headers'. Flip
              // the target with the scope so the stored config never
              // becomes invalid.
              const nextFlash = flash
                ? {
                    ...flash,
                    target:
                      v === 'row'
                        ? ('row' as FlashTarget)
                        : flash.target === 'row'
                          ? ('cells' as FlashTarget)
                          : flash.target,
                  }
                : undefined;
              setDraft({ scope: nextScope, flash: nextFlash });
            }}
            style={{
              width: '100%',
              height: 28,
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <option value="cell">CELL</option>
            <option value="row">ROW</option>
          </Select>
        }
      />
      <MetaCell
        label="PRIORITY"
        value={
          <IconInput
            numeric
            value={String(priority)}
            onCommit={(v) => {
              const n = Number(v);
              if (Number.isFinite(n)) {
                setDraft({ priority: Math.max(0, Math.min(100, Math.round(n))) });
              }
            }}
            data-testid={`cs-rule-priority-${ruleId}`}
          />
        }
      />
      <MetaCell
        label="APPLIED"
        value={<Mono color="var(--ck-amber)">{appliedCount} rows</Mono>}
      />
    </div>
  );
});
