import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@starui/ui';
import type { TerminalState } from '../data/types';
import { OrdersBlotter } from '../panels/OrdersBlotter';
import { OrderEntryForm } from '../panels/OrderEntryForm';
import { RfqSimulator } from '../panels/RfqSimulator';

const panelClass = 'overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]';

export interface OrdersTabProps {
  state: TerminalState;
}

export function OrdersTab({ state }: OrdersTabProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 gap-2" data-testid="tab-orders">
      <ResizablePanel defaultSize={58} minSize={30}>
        <div className={`h-full ${panelClass}`}>
          <OrdersBlotter state={state} />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={24} minSize={16}>
        <div className={`h-full ${panelClass}`}>
          <OrderEntryForm state={state} />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={18} minSize={14}>
        <div className={`h-full ${panelClass}`}>
          <RfqSimulator state={state} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
