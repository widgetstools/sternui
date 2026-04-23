/**
 * 04 · FORMAT — currency / percent / thousands / decimals± / tick / picker.
 *
 * Quick-format actions for numeric data. The full FormatterPicker
 * (Excel-format input + presets) attaches at the end. Header target
 * disables the whole module since headers don't carry formatters.
 */
import { useState } from 'react';
import {
  ArrowLeft, ArrowRight, ChevronDown, DollarSign, Hash, Percent,
} from 'lucide-react';
import {
  PopoverCompat as Popover,
  FormatterPicker,
  type ValueFormatterTemplate,
} from '@marketsui/core';
import {
  BPS_TEMPLATE,
  COMMA_TEMPLATE,
  CURRENCY_FORMATTERS,
  PERCENT_TEMPLATE,
  isCommaTemplate,
  isPercentTemplate,
  isTickTemplate,
} from '../../formatterPresets';
import { Hair, Menu, MenuItem, MenuSep, Module, Pill, SplitPill } from '../primitives';
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
  const { fmt, disabled, isHeader, pickerDataType } = state;
  const vft = fmt.valueFormatterTemplate;
  const fmtDisabled = disabled || isHeader || pickerDataType !== 'number';

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
        <Popover
          open={currencyOpen}
          onOpenChange={setCurrencyOpen}
          trigger={
            <button
              type="button"
              disabled={fmtDisabled}
              aria-label="Currency menu"
              className="fx-pill fx-pill--narrow"
              data-testid="fmt-currency-menu"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <ChevronDown size={9} strokeWidth={2} />
            </button>
          }
        >
          <Menu>
            {Object.entries(CURRENCY_FORMATTERS).map(([key, f]) => (
              <MenuItem
                key={key}
                glyph={f.label}
                name={key}
                onClick={() => { actions.doFormat(f.template); setCurrencyOpen(false); }}
              />
            ))}
            <MenuSep />
            <MenuItem
              glyph="bp"
              name="Basis points"
              onClick={() => { actions.doFormat(BPS_TEMPLATE); setCurrencyOpen(false); }}
            />
          </Menu>
        </Popover>
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <ArrowLeft size={9} strokeWidth={2} />
          .0
        </span>
      </Pill>
      <Pill disabled={fmtDisabled} tooltip="More decimals" onClick={actions.increaseDecimals} variant="text">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
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
        <Popover
          open={tickMenuOpen}
          onOpenChange={setTickMenuOpen}
          trigger={
            <button
              type="button"
              disabled={fmtDisabled}
              aria-label="Tick precision"
              className="fx-pill fx-pill--narrow"
              data-testid="fmt-tick-menu-trigger"
              title="Tick precision"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <ChevronDown size={9} strokeWidth={1.75} />
            </button>
          }
        >
          <Menu className="min-w-[180px]">
            {TICK_MENU.map((m) => {
              const active = currentTickToken(vft) === m.token;
              return (
                <MenuItem
                  key={m.token}
                  glyph={active ? '✓' : ''}
                  name={m.label}
                  sample={m.sample}
                  active={active}
                  onClick={() => { actions.doFormat({ kind: 'tick', tick: m.token }); setTickMenuOpen(false); }}
                  testId={`fmt-tick-menu-${m.token}`}
                />
              );
            })}
          </Menu>
        </Popover>
      </SplitPill>

      <Hair />

      {/* Full Excel / preset picker — chip popover (provided by core). */}
      <FormatterPicker
        dataType={pickerDataType}
        value={vft}
        onChange={(next) => actions.doFormat(next)}
        defaultCollapsed
        compact
        data-testid="fmt-picker-toolbar"
      />
    </Module>
  );
}
