/**
 * Auto FI Format — apply vendor-style formatters and alignment to all columns.
 */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Tooltip } from '@starui/grid/customizer';
import { Button, cn } from '@starui/ui';
import type { Orientation } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const autoFormatPillClass = cn(
  'h-7 gap-1.5 px-2.5 rounded-[3px] border bg-transparent shadow-none',
  'border-primary/35 text-primary text-[10px] font-semibold uppercase tracking-[0.08em]',
  'hover:bg-primary/10 hover:border-primary',
  'disabled:opacity-40 disabled:hover:bg-transparent',
);

export function ModuleAutoFormat({
  actions,
  orientation,
}: {
  state: FormatterState;
  actions: FormatterActions;
  orientation: Orientation;
}) {
  const [flash, setFlash] = useState(false);

  const title =
    'Apply fixed-income auto-format to every column: Excel-style number formats, '
    + 'right-aligned numerics (Bloomberg / Tradeweb convention), left-aligned text, '
    + 'and standard P&L / yield / spread highlight rules.';

  const run = () => {
    actions.applyFiAutoFormat();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 600);
  };

  if (orientation === 'vertical') {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn(autoFormatPillClass, 'h-[30px] w-full justify-center')}
        data-testid="fmt-auto-fi-panel"
        onClick={run}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {flash ? 'Applied' : 'Auto FI format'}
      </Button>
    );
  }

  return (
    <Tooltip content={title}>
      <Button
        type="button"
        variant="outline"
        className={autoFormatPillClass}
        data-testid="fmt-auto-fi"
        data-confirmed={flash ? 'true' : undefined}
        onClick={run}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{flash ? 'Applied' : 'Auto FI'}</span>
      </Button>
    </Tooltip>
  );
}
