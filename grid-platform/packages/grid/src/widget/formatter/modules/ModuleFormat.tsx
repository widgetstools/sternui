/**
 * 04 · FORMAT — currency / percent / thousands / decimals± / tick / picker.
 *
 * Quick-format actions for numeric data. The full FormatterPicker
 * (Excel-format input + presets) attaches at the end. Header target
 * disables the whole module since headers don't carry formatters.
 */
import { useState } from 'react';
import { spacing } from '@starui/design-system/tokens';
import {
  ArrowLeft, ArrowRight, ChevronDown, DollarSign, Hash, Percent,
} from 'lucide-react';
import type { ValueFormatterTemplate } from '@stargrid/engine';
import { FormatterPicker, Tooltip } from '@stargrid/grid/customizer';
import {
  BPS_TEMPLATE,
  COMMA_TEMPLATE,
  CURRENCY_FORMATTERS,
  PERCENT_TEMPLATE,
  isCommaTemplate,
  isPercentTemplate,
  isTickTemplate,
} from '../../formatterPresets';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@starui/ui';
import { Hair, Module, Pill, pillClasses, SplitPill } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const TICK_MENU = [
  { token: 'TICK32',      label: '32nds',                 denominator: '32',  sample: '100-16' },
  { token: 'TICK32_PLUS', label: "32nds with +",          denominator: '32+', sample: '100-16+' },
  { token: 'TICK64',      label: '64ths',                 denominator: '64',  sample: '100-32' },
  { token: 'TICK128',     label: '128ths',                denominator: '128', sample: '100-064' },
  { token: 'TICK256',     label: '256ths',                denominator: '256', sample: '100-128' },
] as const;

function currentTickToken(t: ValueFormatterTemplate | undefined): typeof TICK_MENU[number]['token'] | null {
  return t && t.kind === 'tick' ? (t.tick as typeof TICK_MENU[number]['token']) : null;
}

export function ModuleFormat({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const { fmt, disabled, isHeader, pickerDataType, scope } = state;
  const vft = fmt.valueFormatterTemplate;
  // Per-column (SELECTED): formatter only makes sense for `number` columns.
  // Global (ALL + CELLS): formatter is always available — the transform
  // filters at apply time so it only lands on number / date / string
  // columns. Headers never carry formatters in either scope.
  const fmtDisabled =
    isHeader ||
    (scope === 'selected' && (disabled || pickerDataType !== 'number'));

  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [tickMenuOpen, setTickMenuOpen] = useState(false);

  return (
    <Module index="04" label="Format">
      {/* Currency split — primary $ + chevron menu (USD/EUR/GBP/JPY/BPS). */}
      <SplitPill>
        <Pill
          disabled={fmtDisabled}
          tooltip="Currency (USD)"
          onClick={() => actions.doFormat(CURRENCY_FORMATTERS.USD.template)}
        >
          <DollarSign size={13} strokeWidth={1.75} />
        </Pill>
        <DropdownMenu open={currencyOpen} onOpenChange={setCurrencyOpen}>
          <DropdownMenuTrigger asChild>
            <Tooltip content="Pick a currency (USD, EUR, GBP, JPY, basis points)">
              <button
                type="button"
                disabled={fmtDisabled}
                aria-label="Currency menu"
                className={pillClasses('narrow')}
                data-testid="fmt-currency-menu"
              >
                <ChevronDown size={9} strokeWidth={2} />
              </button>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="fx-menu min-w-[160px]">
            {Object.entries(CURRENCY_FORMATTERS).map(([key, f]) => (
              <DropdownMenuItem
                key={key}
                onSelect={() => actions.doFormat(f.template)}
              >
                <span className="w-5 text-[11px] font-mono text-muted-foreground">{f.label}</span>
                <span>{key}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => actions.doFormat(BPS_TEMPLATE)}>
              <span className="w-5 text-[11px] font-mono text-muted-foreground">bp</span>
              <span>Basis points</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SplitPill>

      <Pill
        disabled={fmtDisabled}
        tooltip="Percentage"
        active={!fmtDisabled && isPercentTemplate(vft)}
        onClick={() => actions.doFormat(isPercentTemplate(vft) ? undefined : PERCENT_TEMPLATE)}
      >
        <Percent size={13} strokeWidth={1.75} />
      </Pill>

      <Pill
        disabled={fmtDisabled}
        tooltip="Thousands (1,234)"
        active={!fmtDisabled && isCommaTemplate(vft)}
        onClick={() => actions.doFormat(isCommaTemplate(vft) ? undefined : COMMA_TEMPLATE)}
      >
        <Hash size={13} strokeWidth={1.75} />
      </Pill>

      <Hair />

      {/* Decimals ±. */}
      <Pill disabled={fmtDisabled} tooltip="Fewer decimals" onClick={actions.decreaseDecimals} variant="text">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.px }}>
          <ArrowLeft size={9} strokeWidth={2} />
          .0
        </span>
      </Pill>
      <Pill disabled={fmtDisabled} tooltip="More decimals" onClick={actions.increaseDecimals} variant="text">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.px }}>
          .0
          <ArrowRight size={9} strokeWidth={2} />
        </span>
      </Pill>

      <Hair />

      {/* Tick split — main button toggles current tick; chevron picks denominator. */}
      <SplitPill>
        <Pill
          disabled={fmtDisabled}
          active={!fmtDisabled && isTickTemplate(vft)}
          variant="text"
          tooltip={
            currentTickToken(vft)
              ? `Tick: ${TICK_MENU.find((m) => m.token === currentTickToken(vft))?.label ?? '32nds'}`
              : 'Tick format (32nds)'
          }
          onClick={() =>
            actions.doFormat(
              isTickTemplate(vft)
                ? undefined
                : { kind: 'tick', tick: currentTickToken(vft) ?? 'TICK32' },
            )
          }
          data-testid="fmt-tick-btn"
        >
          {currentTickToken(vft)
            ? (TICK_MENU.find((m) => m.token === currentTickToken(vft))?.denominator ?? '32')
            : '32'}
        </Pill>
        <DropdownMenu open={tickMenuOpen} onOpenChange={setTickMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Tooltip content="Tick precision — choose denominator (32, 64, 128, 256)">
              <button
                type="button"
                disabled={fmtDisabled}
                aria-label="Tick precision"
                className={pillClasses('narrow')}
                data-testid="fmt-tick-menu-trigger"
              >
                <ChevronDown size={9} strokeWidth={1.75} />
              </button>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="fx-menu min-w-[180px]">
            {TICK_MENU.map((m) => {
              const active = currentTickToken(vft) === m.token;
              return (
                <DropdownMenuItem
                  key={m.token}
                  onSelect={() => actions.doFormat({ kind: 'tick', tick: m.token })}
                  data-testid={`fmt-tick-menu-${m.token}`}
                  className={active ? 'bg-primary/10 text-primary' : undefined}
                >
                  <span className="w-3 text-center text-[11px]">{active ? '✓' : ''}</span>
                  <span className="flex-1">{m.label}</span>
                  <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{m.sample}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SplitPill>

      <Hair />

      {/*
        CELLS + ALL scope renders TWO pickers — Number and Date — so the
        user can author a global number format AND a global date format
        without first selecting a column of the matching type. Other
        scopes keep a single picker driven by the active column's
        `pickerDataType`.
      */}
      {scope === 'all' && !isHeader ? (
        <>
          <FormatterPicker
            dataType="number"
            value={state.globalNumberFormatter}
            onChange={(next) => actions.doFormat(next, 'number')}
            defaultCollapsed
            compact
            data-testid="fmt-picker-toolbar-number"
          />
          <FormatterPicker
            dataType="date"
            value={state.globalDateFormatter}
            onChange={(next) => actions.doFormat(next, 'date')}
            defaultCollapsed
            compact
            data-testid="fmt-picker-toolbar-date"
          />
        </>
      ) : (
        <FormatterPicker
          dataType={pickerDataType}
          value={vft}
          onChange={(next) => actions.doFormat(next)}
          defaultCollapsed
          compact
          data-testid="fmt-picker-toolbar"
        />
      )}
    </Module>
  );
}
