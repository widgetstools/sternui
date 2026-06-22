import { ScrollArea } from '@starui/ui';
import type { TerminalState } from '../data/types';
import { AnalyticsCards } from '../panels/AnalyticsCards';
import { YieldCurveChart } from '../panels/YieldCurveChart';

export interface AnalyticsTabProps {
  state: TerminalState;
}

export function AnalyticsTab({ state }: AnalyticsTabProps) {
  return (
    <ScrollArea className="min-h-0 flex-1" data-testid="tab-analytics">
      <div className="flex flex-col gap-3">
        <AnalyticsCards state={state} />
        <div className="h-[360px] overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]">
          <YieldCurveChart state={state} />
        </div>
      </div>
    </ScrollArea>
  );
}
