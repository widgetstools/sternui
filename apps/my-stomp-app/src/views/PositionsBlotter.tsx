import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { dataServices } from '../dataServices';

export function PositionsBlotter() {
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]"
      style={{ transform: 'translateZ(0)' }}
    >
      <HostedMarketsGrid
        gridId="positions-blotter"
        componentName="Positions Blotter"
        defaultInstanceId="positions-blotter"
        withStorage
        dataServices={dataServices}
        configManager={dataServices.configManager}
        showFiltersToolbar
        showFormattingToolbar
        showProfileSelector
        showSaveButton
        sideBar={{ toolPanels: ['columns', 'filters'] }}
        statusBar={{
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
          ],
        }}
      />
    </div>
  );
}
