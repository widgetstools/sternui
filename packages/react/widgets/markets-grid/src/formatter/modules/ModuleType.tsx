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
import { Tooltip } from '@starui/grid-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@starui/ui';
import { Hair, Module, Pill, pillClasses } from '../primitives';
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
  const controlDisabled = isHeader ? false : disabled;
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
      <Pill disabled={disabled} tooltip="Align left" active={fmt.horizontal === 'left'} onClick={() => actions.toggleAlign('left')}>
        <AlignLeft size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Align center" active={fmt.horizontal === 'center'} onClick={() => actions.toggleAlign('center')}>
        <AlignCenter size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Align right" active={fmt.horizontal === 'right'} onClick={() => actions.toggleAlign('right')}>
        <AlignRight size={13} strokeWidth={1.75} />
      </Pill>

      <Hair />

      {/* Font size dropdown — display the current px in the trigger. */}
      <DropdownMenu open={sizeOpen} onOpenChange={setSizeOpen}>
        <DropdownMenuTrigger asChild>
          <Tooltip content="Font size in pixels">
            <button
              disabled={controlDisabled}
              type="button"
              className={pillClasses('text')}
              aria-label="Font size"
              data-testid="fmt-panel-font-size"
            >
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fontSizeLabel}</span>
              <span style={{ opacity: 0.6, marginLeft: 2 }}>PX</span>
              <ChevronDown size={9} strokeWidth={2} style={{ marginLeft: 3 }} />
            </button>
          </Tooltip>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="fx-menu min-w-[120px]">
          {FONT_SIZES.map((sz) => (
            <DropdownMenuItem
              key={sz}
              onSelect={() => actions.setFontSizePx(sz)}
              className={fmt.fontSize === sz ? 'bg-primary/10 text-primary' : undefined}
            >
              <span className="w-3 text-center text-[11px] text-muted-foreground">
                {fmt.fontSize === sz ? '·' : ''}
              </span>
              <span>{sz}px</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Module>
  );
}
