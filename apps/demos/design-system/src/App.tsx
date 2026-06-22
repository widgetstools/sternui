import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger, TooltipProvider } from '@starui/ui';
import { TopBar } from './components/TopBar';
import { useTickingStore } from './data/useTickingStore';
import { DesignSystemTab } from './tabs/DesignSystemTab';
import { MarketTab } from './tabs/MarketTab';
import { OrdersTab } from './tabs/OrdersTab';
import type { TerminalState } from './data/types';

interface TabDef {
  id: string;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'market', label: 'Market' },
  { id: 'orders', label: 'Orders' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'risk', label: 'Risk' },
  { id: 'research', label: 'Research' },
  { id: 'design-system', label: 'Design System' },
];

function renderTab(id: string, state: TerminalState) {
  switch (id) {
    case 'market':
      return <MarketTab state={state} />;
    case 'orders':
      return <OrdersTab state={state} />;
    case 'design-system':
      return <DesignSystemTab />;
    default:
      return (
        <div
          data-testid={`tab-${id}`}
          className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[color:var(--ds-text-secondary)]"
        >
          {id} — coming soon
        </div>
      );
  }
}

export function App() {
  const [active, setActive] = useState('market');
  const store = useTickingStore();

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
        <TopBar state={store.state} />

        <Tabs
          value={active}
          onValueChange={setActive}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <TabsList className="h-10 shrink-0 justify-start gap-1 rounded-none border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-2">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                data-testid={`ds-tab-${t.id}`}
                className="h-7 px-3 text-[12px] data-[state=active]:bg-[color:var(--ds-surface-secondary)] data-[state=active]:text-[color:var(--ds-text-primary)]"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((t) => (
            <TabsContent
              key={t.id}
              value={t.id}
              className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden"
            >
              {renderTab(t.id, store.state)}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
