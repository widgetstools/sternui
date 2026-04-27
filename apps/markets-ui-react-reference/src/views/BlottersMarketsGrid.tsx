/**
 * BlottersMarketsGrid — hosts the v2 `<MarketsGridContainer>` at
 * `/blotters/marketsgrid`.
 *
 * The v2 container owns its own picker (revealed via Alt+Shift+P)
 * and manages the live + historical providers, mode toggle, refresh,
 * and AppData-driven historical date binding. This view's job is to:
 *   - mount the data-plane provider with the resolved userId.
 *   - hand the container a popout-launching `onEditProvider`.
 *   - persist the picked provider selection per `(appId, userId,
 *     instanceId)` so reloading the blotter restores the same view.
 *
 * Persistence rides on the host ConfigManager (Dexie / REST). One
 * `AppConfigRow` per instance, `componentType = 'marketsgrid-view-state'`,
 * payload `{ liveProviderId, historicalProviderId, mode }`.
 * `asOfDate` is intentionally excluded — it persists through AppData
 * via `historicalDateAppDataRef` so the historical provider's cfg
 * resolves consistently.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { DataPlaneProvider } from '@marketsui/data-plane-react/v2';
import {
  MarketsGridContainer,
  type ProviderSelection,
  type ProviderMode,
} from '@marketsui/widgets-react/v2/markets-grid-container';
import type { AppConfigRow, ConfigManager } from '@marketsui/config-service';
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
  configManager: ConfigManager;
  userId: string;
  appId: string;
}

// ─── Persistence ──────────────────────────────────────────────────
//
// One row per (appId, userId, instanceId). The `configId` encodes
// the instanceId so two blotter windows on the same user/app keep
// independent provider selections.

const PROVIDERS_COMPONENT_TYPE = 'marketsgrid-view-state';

function viewStateConfigId(instanceId: string): string {
  return `marketsgrid-view-state::${instanceId}`;
}

interface ViewStatePayload {
  liveProviderId: string | null;
  historicalProviderId: string | null;
  mode: ProviderMode;
}

function BlotterShell({ instanceId, configManager, userId, appId }: BlotterShellProps) {
  const { isDark } = useTheme();
  const agTheme = isDark ? darkTheme : lightTheme;

  // `loaded === null` means we haven't read ConfigManager yet — keep
  // the loading state up so the picker doesn't flash a stale "no
  // selection" empty state before the saved selection drops in.
  // Once loaded, the payload is forwarded to MarketsGridContainer
  // via its `initial*` props.
  const [loaded, setLoaded] = useState<ViewStatePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    configManager
      .getConfig(viewStateConfigId(instanceId))
      .then((row) => {
        if (cancelled) return;
        const payload = (row?.payload as Partial<ViewStatePayload> | undefined) ?? {};
        setLoaded({
          liveProviderId: typeof payload.liveProviderId === 'string' ? payload.liveProviderId : null,
          historicalProviderId: typeof payload.historicalProviderId === 'string' ? payload.historicalProviderId : null,
          mode: payload.mode === 'historical' ? 'historical' : 'live',
        });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ liveProviderId: null, historicalProviderId: null, mode: 'live' });
      });
    return () => { cancelled = true; };
  }, [configManager, instanceId]);

  const onSelectionChange = useCallback((sel: ProviderSelection) => {
    const now = new Date().toISOString();
    const row: AppConfigRow = {
      configId: viewStateConfigId(instanceId),
      appId,
      userId,
      displayText: `MarketsGrid view state — ${instanceId}`,
      componentType: PROVIDERS_COMPONENT_TYPE,
      componentSubType: '',
      isTemplate: false,
      payload: sel,
      createdBy: userId,
      updatedBy: userId,
      creationTime: now,
      updatedTime: now,
    };
    // Fire-and-forget. The next mount reads back through getConfig.
    void configManager.saveConfig(row);
  }, [configManager, appId, userId, instanceId]);

  if (!loaded) {
    return <LoadingState message="Loading view state…" />;
  }

  return (
    <DataPlaneProvider client={dataPlaneClient} configManager={configManager} userId={userId}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MarketsGridContainer
            gridId={instanceId}
            defaultColDef={defaultColDef}
            theme={agTheme}
            onEditProvider={(providerId) => openProviderEditorPopout({ providerId })}
            historicalDateAppDataRef="positions.asOfDate"
            initialLiveProviderId={loaded.liveProviderId}
            initialHistoricalProviderId={loaded.historicalProviderId}
            initialMode={loaded.mode}
            onSelectionChange={onSelectionChange}
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
