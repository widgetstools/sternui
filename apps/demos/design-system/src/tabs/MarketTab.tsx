import { useState } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@starui/ui';
import type { TerminalState } from '../data/types';
import { BondBlotter } from '../panels/BondBlotter';
import { Watchlist } from '../panels/Watchlist';
import { OrderBook } from '../panels/OrderBook';
import { PriceChart } from '../panels/PriceChart';
import { TradeTicket } from '../panels/TradeTicket';

const panelClass = 'overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]';

export interface MarketTabProps {
  state: TerminalState;
}

export function MarketTab({ state }: MarketTabProps) {
  const [selectedId, setSelectedId] = useState(state.instruments[0]?.id ?? '');
  const inst = state.instruments.find((i) => i.id === selectedId) ?? state.instruments[0];
  const quote = state.quotes[inst.id];

  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 gap-2" data-testid="tab-market">
      <ResizablePanel defaultSize={20} minSize={14}>
        <div className={`h-full ${panelClass}`}>
          <Watchlist state={state} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={55} minSize={30}>
        <ResizablePanelGroup orientation="vertical" className="gap-2">
          <ResizablePanel defaultSize={62} minSize={30}>
            <div className={`h-full ${panelClass}`}>
              <BondBlotter state={state} />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={38} minSize={20}>
            <div className={`h-full ${panelClass}`}>
              <PriceChart state={state} instrumentId={inst.id} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={25} minSize={16}>
        <div className="flex h-full flex-col gap-2">
          <div className={`min-h-0 flex-1 ${panelClass}`}>
            <OrderBook state={state} instrumentId={inst.id} />
          </div>
          <TradeTicket instrument={inst} quote={quote} />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
