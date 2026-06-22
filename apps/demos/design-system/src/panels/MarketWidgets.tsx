import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { BondBlotter } from './BondBlotter';
import { PriceChart } from './PriceChart';
import { useDemoState } from '../state/DemoStateProvider';

/** Dock widget adapter: BondBlotter wired to DemoState; row-click sets selectedId. */
export function BlotterWidget(_props: WidgetProps) {
  const { store, setSelectedId } = useDemoState();
  return <BondBlotter state={store.state} onRowClicked={setSelectedId} />;
}

/** Dock widget adapter: PriceChart wired to DemoState selectedId. */
export function PriceChartWidget(_props: WidgetProps) {
  const { store, selectedId } = useDemoState();
  return <PriceChart state={store.state} instrumentId={selectedId} />;
}
