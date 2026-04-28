/**
 * BlottersMarketsGrid — hosts the v2 `<MarketsGridContainer>` at
 * `/blotters/marketsgrid`.
 *
 * The v2 container owns its own picker (revealed via Alt+Shift+P)
 * and manages the live + historical providers, mode toggle, refresh,
 * and AppData-driven historical date binding. This view's job is to:
 *   - mount the data-plane provider with the resolved userId.
 *   - hand the container a popout-launching `onEditProvider`.
 *   - thread the storage factory through so MarketsGrid persists
 *     both profiles AND the data-provider selection in one row.
 *
 * Persistence: the data-provider selection is persisted at the GRID
 * LEVEL (top-level field on MarketsGrid's profile-set row, NOT inside
 * any individual profile) via the StorageAdapter's grid-level-data
 * methods. Profile switches preserve the selection because the
 * selection isn't carried by any profile.
 */

import { useEffect } from 'react';
import type { ColDef } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { DataPlaneProvider } from '@marketsui/data-plane-react/v2';
import { MarketsGridContainer } from '@marketsui/widgets-react/v2/markets-grid-container';
import type { ConfigManager } from '@marketsui/config-service';
import type { StorageAdapterFactory } from '@marketsui/markets-grid';
import { useTheme } from '../context/ThemeContext';
import { HostedComponent } from '../components/HostedComponent';
import { dataPlaneClient } from '../data-plane-client';
import { openProviderEditorPopout } from '../data-providers-popout';

// ─── AG-Grid per-column defaults ──────────────────────────────────
//
// Column list, headers, types come from the active DataProviderConfig's
// `columnDefinitions` (authored in the editor's Fields → Columns tabs).
// `defaultColDef` is the per-column base AG-Grid applies on top:
// floating-filter / sort / resize behaviour.
const defaultColDef: ColDef = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

// ─── AG-Grid theme variants ───────────────────────────────────────

const sharedThemeParams = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  headerFontSize: 10,
  iconSize: 10,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder: false,
  columnBorder: true,
  spacing: 6,
  borderRadius: 0,
  wrapperBorderRadius: 0,
};

const darkTheme = themeQuartz.withParams({
  ...sharedThemeParams,
  backgroundColor: '#161a1e',
  foregroundColor: '#eaecef',
  headerBackgroundColor: '#1e2329',
  headerTextColor: '#a0a8b4',
  oddRowBackgroundColor: '#161a1e',
  rowHoverColor: '#1e2329',
  selectedRowBackgroundColor: '#14b8a614',
  borderColor: '#313944',
});

const lightTheme = themeQuartz.withParams({
  ...sharedThemeParams,
  backgroundColor: '#ffffff',
  foregroundColor: '#3b3b3b',
  headerBackgroundColor: '#f3f3f3',
  headerTextColor: '#616161',
  oddRowBackgroundColor: '#fafafa',
  rowHoverColor: '#f3f3f3',
  selectedRowBackgroundColor: '#0d948814',
  borderColor: '#e5e5e5',
});

// ─── View ─────────────────────────────────────────────────────────

const DEFAULT_INSTANCE_ID = 'markets-ui-reference-blotter';

function BlottersMarketsGrid() {
  return (
    <HostedComponent
      componentName="MarketsGrid"
      defaultInstanceId={DEFAULT_INSTANCE_ID}
      documentTitle="MarketsGrid · Blotter"
      withStorage
    >
      {({ instanceId, storage, configManager, userId, appId }) =>
        instanceId == null || storage == null || configManager == null ? (
          <LoadingState message="Connecting to ConfigService…" />
        ) : (
          <BlotterShell
            instanceId={instanceId}
            storage={storage}
            configManager={configManager}
            userId={userId}
            appId={appId}
          />
        )
      }
    </HostedComponent>
  );
}

interface BlotterShellProps {
  instanceId: string;
  storage: StorageAdapterFactory;
  configManager: ConfigManager;
  userId: string;
  appId: string;
}

function BlotterShell({ instanceId, storage, configManager, userId, appId }: BlotterShellProps) {
  const { isDark } = useTheme();
  const agTheme = isDark ? darkTheme : lightTheme;

  // One-shot cleanup of the stale `marketsgrid-view-state::*` row
  // that older revisions of this view wrote. Persistence has moved
  // INTO MarketsGrid's profile-set row (at the grid level, alongside
  // `profiles`); the standalone view-state row is no longer used.
  // Best-effort: if the row isn't there, nothing happens.
  useEffect(() => {
    void configManager.deleteConfig(`marketsgrid-view-state::${instanceId}`).catch(() => {
      // No row to clean up — fine.
    });
  }, [configManager, instanceId]);

  return (
    <DataPlaneProvider client={dataPlaneClient} configManager={configManager} userId={userId}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MarketsGridContainer
            gridId={instanceId}
            instanceId={instanceId}
            appId={appId}
            userId={userId}
            storage={storage}
            defaultColDef={defaultColDef}
            theme={agTheme}
            onEditProvider={(providerId) => openProviderEditorPopout({ providerId })}
            historicalDateAppDataRef="positions.asOfDate"
            showFiltersToolbar
            showFormattingToolbar
          />
        </div>
      </div>
    </DataPlaneProvider>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontSize: 12,
        color: 'var(--bn-t2, #7a8494)',
      }}
    >
      {message}
    </div>
  );
}

export default BlottersMarketsGrid;
