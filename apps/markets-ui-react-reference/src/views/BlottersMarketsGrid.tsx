/**
 * BlottersMarketsGrid — hosts the v2 `<MarketsGridContainer>` at
 * `/blotters/marketsgrid`.
 *
 * The v2 container owns its own picker (revealed via Shift+Ctrl+P)
 * and manages the live + historical providers, mode toggle, refresh,
 * and AppData-driven historical date binding. This view's job is to:
 *   - mount the data-plane provider with the resolved userId.
 *   - hand the container a popout-launching `onEditProvider`.
 *
 * Persistence of the picked providerId is no longer per-instance — the
 * picker selection lives in container state for the session. Long-term
 * persistence will come back via a saved profile when MarketsGrid's
 * profile schema gains `liveProviderId` / `historicalProviderId`.
 */

import { useEffect, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { DataPlaneProvider } from '@marketsui/data-plane-react/v2';
import { MarketsGridContainer } from '@marketsui/widgets-react/v2/markets-grid-container';
import { getConfigManager, readHostEnv } from '@marketsui/openfin-platform/config';
import type { ConfigManager } from '@marketsui/config-service';
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
      {({ instanceId, storage }) =>
        instanceId == null || storage == null ? (
          <LoadingState message="Connecting to ConfigService…" />
        ) : (
          <BlotterShell instanceId={instanceId} />
        )
      }
    </HostedComponent>
  );
}

interface BlotterShellProps {
  instanceId: string;
}

function BlotterShell({ instanceId }: BlotterShellProps) {
  const { isDark } = useTheme();
  const agTheme = isDark ? darkTheme : lightTheme;

  // Resolve the platform's ConfigManager + the active userId. Both
  // are async on first call (Dexie open + OpenFin customData read);
  // until they resolve we render a loading state.
  const [cm, setCm] = useState<ConfigManager | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getConfigManager(),
      readHostEnv().catch(() => ({ userId: undefined })),
    ]).then(([manager, env]) => {
      if (cancelled) return;
      setCm(manager);
      setUserId(env.userId ?? 'dev1');
    });
    return () => { cancelled = true; };
  }, []);

  if (!cm || !userId) {
    return <LoadingState message="Resolving config service…" />;
  }

  return (
    <DataPlaneProvider client={dataPlaneClient} configManager={cm} userId={userId}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MarketsGridContainer
            gridId={instanceId}
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
