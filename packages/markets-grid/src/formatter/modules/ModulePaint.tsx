/**
 * 03 · PAINT — text colour, fill colour, borders.
 */
import { useState } from 'react';
import { PaintBucket, SquareDashed, Type } from 'lucide-react';
import {
  ColorPickerPopover,
  Popover as RadixPopover,
  PopoverContent as RadixPopoverContent,
  PopoverTrigger as RadixPopoverTrigger,
} from '@marketsui/core';
import { BorderStyleEditor } from '@marketsui/core';
import { Hair, Module, Pill } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

export function ModulePaint({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const { fmt, disabled } = state;
  const [borderOpen, setBorderOpen] = useState(false);

  return (
    <Module index="03" label="Paint">
      <ColorPickerPopover
        disabled={disabled}
        value={fmt.color}
        icon={<Type size={11} strokeWidth={2} />}
        onChange={(c) => actions.setTextColor(c)}
        compact
        title="Text color"
      />
      <ColorPickerPopover
        disabled={disabled}
        value={fmt.background}
        icon={<PaintBucket size={11} strokeWidth={1.5} />}
        onChange={(c) => actions.setBgColor(c)}
        compact
        title="Fill color"
      />

      <Hair />

      <RadixPopover open={borderOpen} onOpenChange={setBorderOpen}>
        <RadixPopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Cell borders"
            title="Cell borders"
            className="fx-pill"
            onMouseDown={(e) => { e.preventDefault(); }}
          >
            <SquareDashed size={13} strokeWidth={1.75} />
          </button>
        </RadixPopoverTrigger>
        <RadixPopoverContent
          align="start"
          sideOffset={6}
          className="gc-sheet-v2"
          style={{
            padding: 0,
            width: 460,
            maxWidth: '90vw',
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            boxShadow: 'var(--ck-popout-shadow, 0 20px 40px rgba(0,0,0,0.5))',
            fontFamily: 'var(--fx-font-sans, "IBM Plex Sans", sans-serif)',
          }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== 'SELECT' && tag !== 'INPUT') e.preventDefault();
          }}
        >
          <BorderStyleEditor value={fmt.borders} onChange={actions.applyBordersMap} />
        </RadixPopoverContent>
      </RadixPopover>
    </Module>
  );
}
