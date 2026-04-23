/**
 * 02 · TYPE — typography (B/I/U) + alignment + size.
 *
 * Same content in both surfaces; the parent shell's flex direction
 * + gap tokens handle horizontal vs vertical packing.
 */
import { useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight,
  Bold, ChevronDown, Italic, Underline,
} from 'lucide-react';
import { PopoverCompat as Popover } from '@grid-customizer/core';
import { Hair, Menu, MenuItem, Module, Pill } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24];

export function ModuleType({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const { fmt, disabled, isHeader } = state;
  const [sizeOpen, setSizeOpen] = useState(false);
  const fontSizeLabel = fmt.fontSize != null ? String(fmt.fontSize) : '11';

  return (
    <Module index="02" label="Type">
      {/* B / I / U */}
      <Pill disabled={disabled} tooltip="Bold" active={fmt.bold} onClick={actions.toggleBold}>
        <Bold size={13} strokeWidth={2.25} />
      </Pill>
      <Pill disabled={disabled} tooltip="Italic" active={fmt.italic} onClick={actions.toggleItalic}>
        <Italic size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Underline" active={fmt.underline} onClick={actions.toggleUnderline}>
        <Underline size={13} strokeWidth={1.75} />
      </Pill>

      <Hair />

      {/* Align L/C/R */}
      <Pill disabled={disabled} tooltip="Left" active={fmt.horizontal === 'left'} onClick={() => actions.toggleAlign('left')}>
        <AlignLeft size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Center" active={fmt.horizontal === 'center'} onClick={() => actions.toggleAlign('center')}>
        <AlignCenter size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Right" active={fmt.horizontal === 'right'} onClick={() => actions.toggleAlign('right')}>
        <AlignRight size={13} strokeWidth={1.75} />
      </Pill>

      <Hair />

      {/* Font size dropdown — display the current px in the trigger. */}
      <Popover
        open={sizeOpen}
        onOpenChange={setSizeOpen}
        trigger={
          <button
            disabled={disabled || isHeader}
            type="button"
            className="fx-pill fx-pill--text"
            title="Font size (px)"
            aria-label="Font size"
            data-testid="fmt-panel-font-size"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fontSizeLabel}</span>
            <span style={{ opacity: 0.6, marginLeft: 2 }}>PX</span>
            <ChevronDown size={9} strokeWidth={2} style={{ marginLeft: 3 }} />
          </button>
        }
      >
        <Menu>
          {FONT_SIZES.map((sz) => (
            <MenuItem
              key={sz}
              glyph={fmt.fontSize === sz ? '·' : ''}
              name={`${sz}px`}
              active={fmt.fontSize === sz}
              onClick={() => { actions.setFontSizePx(sz); setSizeOpen(false); }}
            />
          ))}
        </Menu>
      </Popover>
    </Module>
  );
}
