import { ScrollArea } from '@starui/ui';
import type { TerminalState } from '../data/types';
import { RiskPanels } from '../panels/RiskPanels';

export interface RiskTabProps {
  state: TerminalState;
}

export function RiskTab({ state }: RiskTabProps) {
  return (
    <ScrollArea className="min-h-0 flex-1" data-testid="tab-risk">
      <RiskPanels state={state} />
    </ScrollArea>
  );
}
