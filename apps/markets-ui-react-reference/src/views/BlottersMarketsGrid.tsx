/**
 * BlottersMarketsGrid — hosts the v2 `<MarketsGridContainer>` at
 * `/blotters/marketsgrid`.
 *
 * The v2 container owns its own picker (Alt+Shift+P), manages live +
 * historical providers, mode toggle, refresh, and AppData-driven date
 * binding. This view uses HostedFeatureView to consolidate boilerplate
 * (identity resolution, ConfigManager, DataPlaneProvider) and just
 * configures the grid with storage, theming, and event handlers.
 *
 * Persistence: data-provider selection is persisted at the GRID LEVEL
 * (top-level field on the profile-set row) via StorageAdapter, not inside
 * profiles. Profile switches preserve the selection.
 */

import { useEffect, type ReactNode } from 'react';
import type { ColDef } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGridContainer } from '@marketsui/widgets-react/v2/markets-grid-container';
import type { HostedContext } from '../components/HostedComponent';
import { HostedFeatureView } from '../components/HostedFeatureView';
import { useTheme } from '../context/ThemeContext';
import { openProviderEditorPopout } from '../data-providers-popout';

// ─── AG-Grid per-column defaults ──────────────────────────────────

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

function BlottersMarketsGrid(): ReactNode {
  return (
    <HostedFeatureView
      componentName="MarketsGrid"
      defaultInstanceId={DEFAULT_INSTANCE_ID}
      documentTitle="MarketsGrid · Blotter"
      withStorage
    >
      {(ctx: HostedContext) => {
        // Sanity checks — HostedFeatureView guarantees configManager exists,
        // but storage and instanceId are only populated if withStorage=true
        // and identity resolved. Show loading if not ready yet.
        if (ctx.instanceId == null || ctx.storage == null) {
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
              Connecting to ConfigService…
            </div>
          );
        }

        return (
          <BlotterGrid
            instanceId={ctx.instanceId}
            storage={ctx.storage}
            configManager={ctx.configManager!}
            userId={ctx.userId}
            appId={ctx.appId}
          />
        );
      }}
    </HostedFeatureView>
  );
}

interface BlotterGridProps {
  instanceId: string;
  storage: any; // StorageAdapterFactory
  configManager: any; // ConfigManager
  userId: string;
  appId: string;
}

function BlotterGrid({ instanceId, storage, configManager, userId, appId }: BlotterGridProps) {
  const { isDark } = useTheme();
  const agTheme = isDark ? darkTheme : lightTheme;

  // Clean up stale `marketsgrid-view-state::*` rows from older versions.
  // Persistence has moved into MarketsGrid's profile-set row (grid-level,
  // alongside profiles). The standalone view-state row is no longer used.
  useEffect(() => {
    void configManager.deleteConfig(`marketsgrid-view-state::${instanceId}`).catch(() => {
      // No row to clean up — fine.
    });
  }, [configManager, instanceId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MarketsGridContainer
          gridId={instanceId}
          instanceId={instanceId}
          appId={appId}
          userId={userId}
          componentName="MarketsGrid"
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
  );
}

export default BlottersMarketsGrid;
