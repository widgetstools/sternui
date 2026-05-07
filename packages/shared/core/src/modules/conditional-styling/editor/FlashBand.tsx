import { memo } from 'react';
import {
  Band,
  Caps,
  Mono,
  PillToggleBtn,
  PillToggleGroup,
  SubLabel,
} from '../../../ui/SettingsPanel';
import { Switch } from '../../../ui/shadcn';
import type { ConditionalRule, FlashTarget } from '../state';

export const FlashBand = memo(function FlashBand({
  ruleId,
  flash,
  scopeType,
  setDraft,
}: {
  ruleId: string;
  flash: ConditionalRule['flash'];
  scopeType: 'cell' | 'row';
  setDraft: (patch: Partial<ConditionalRule>) => void;
}) {
  return (
    <Band index="07" title="FLASH ON MATCH">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Switch
          checked={Boolean(flash?.enabled)}
          onChange={(e) => {
            const enabled = e.target.checked;
            if (!enabled) {
              // Disable while keeping the rest of the config so
              // re-enabling restores the previous target.
              setDraft({
                flash: flash ? { ...flash, enabled: false } : undefined,
              });
              return;
            }
            const defaultTarget: FlashTarget = scopeType === 'row' ? 'row' : 'cells';
            setDraft({
              flash: {
                enabled: true,
                target: flash?.target ?? defaultTarget,
                flashDuration: flash?.flashDuration,
                fadeDuration: flash?.fadeDuration,
              },
            });
          }}
          data-testid={`cs-rule-flash-enabled-${ruleId}`}
        />
        <Mono color={flash?.enabled ? 'var(--ck-green)' : 'var(--ck-t2)'} size={11}>
          {flash?.enabled ? 'ON' : 'OFF'}
        </Mono>

        {/* Target picker — only when flash is on AND scope is cell */}
        {flash?.enabled && scopeType === 'cell' && (
          <>
            <SubLabel>TARGET</SubLabel>
            <PillToggleGroup>
              {(
                [
                  ['cells', 'CELLS'],
                  ['headers', 'HEADERS'],
                  ['cells+headers', 'BOTH'],
                ] as ReadonlyArray<[FlashTarget, string]>
              ).map(([value, label]) => (
                <PillToggleBtn
                  key={value}
                  active={flash?.target === value}
                  onClick={() =>
                    setDraft({
                      flash: {
                        enabled: true,
                        target: value,
                        flashDuration: flash?.flashDuration,
                        fadeDuration: flash?.fadeDuration,
                      },
                    })
                  }
                  style={{
                    height: 24,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '0 10px',
                    minWidth: 56,
                  }}
                  data-testid={`cs-rule-flash-target-${value}-${ruleId}`}
                >
                  {label}
                </PillToggleBtn>
              ))}
            </PillToggleGroup>
          </>
        )}
        {flash?.enabled && scopeType === 'row' && (
          <Caps size={10} color="var(--ck-t2)">
            TARGETS ENTIRE ROW
          </Caps>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <Caps size={9} color="var(--ck-t3)">
          Flashes AG-Grid's built-in highlight when a cell value change causes this rule to match.
        </Caps>
      </div>
    </Band>
  );
});
