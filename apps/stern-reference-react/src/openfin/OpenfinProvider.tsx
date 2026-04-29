import { useState, useEffect, useRef } from 'react';
import { buildUrl, bootstrapPlatform } from '@marketsui/openfin-platform-stern';
import { type DockMenuItem, createMenuItem } from '@marketsui/shared-types';
import { DockConfigurator } from '@marketsui/widgets-react';
import * as dock from '@marketsui/openfin-platform-stern/dock';

function getDefaultMenuItems(): DockMenuItem[] {
  return [
    createMenuItem({ id: 'orders-blotter',    caption: 'Orders Blotter',    url: '/blotter/orders',    openMode: 'view', order: 0 }),
    createMenuItem({ id: 'fills-blotter',     caption: 'Fills Blotter',     url: '/blotter/fills',     openMode: 'view', order: 1 }),
    createMenuItem({ id: 'positions-blotter', caption: 'Positions Blotter', url: '/blotter/positions', openMode: 'view', order: 2 }),
  ];
}

/**
 * OpenfinProvider — platform provider loaded at /platform/provider.
 *
 * The provider window stays hidden at all times in OpenFin.
 * The Dock Editor is a separate fin.Window at /dock-editor that communicates
 * with this provider via IAB:
 *   stern:dock-editor:request-config → provider responds with current menu items
 *   stern:dock-editor:apply          → provider applies updated menu items to dock
 */
export default function OpenfinProvider() {
  const isInitialized = useRef(false);
  const [status, setStatus] = useState<'initializing' | 'ready' | 'error' | 'no-openfin'>('initializing');
  const [menuItems] = useState<DockMenuItem[]>(getDefaultMenuItems);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.fin) {
      setStatus('no-openfin');
      return;
    }

    if (isInitialized.current) return;
    isInitialized.current = true;

    bootstrapPlatform({
      dock: { icon: buildUrl('/star.png'), title: 'Stern Reference Platform' },
      dockActions: dock,
      registrations: [
        { configType: 'GRID', configSubType: 'ORDERS',    url: '/blotter/orders',    width: 1200, height: 700, label: 'Orders Blotter' },
        { configType: 'GRID', configSubType: 'FILLS',     url: '/blotter/fills',     width: 1200, height: 700, label: 'Fills Blotter' },
        { configType: 'GRID', configSubType: 'POSITIONS', url: '/blotter/positions', width: 1200, height: 700, label: 'Positions Blotter' },
      ],
      onReady: () => setStatus('ready'),
    }).catch((err: unknown) => {
      console.error('[Provider] bootstrapPlatform failed', err);
      setStatus('error');
    });
  }, []);

  // In OpenFin the provider window is always hidden — this UI is only
  // reached in browser preview mode (status === 'no-openfin').
  if (status === 'no-openfin') {
    return (
      <div className="h-screen w-screen flex flex-col bg-background text-foreground">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card text-xs text-muted-foreground">
          <span>Stern Reference Platform</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            Preview Mode
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <DockConfigurator
            initialItems={menuItems}
            onApply={async () => {}}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        {status === 'error' ? (
          <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive text-lg">!</span>
          </div>
        ) : (
          <div className="h-12 w-12 mx-auto mb-4 rounded-full border-[3px] border-muted border-t-primary animate-spin" />
        )}
        <h1 className="text-lg font-semibold mb-1">Stern Reference Platform</h1>
        <p className="text-sm text-muted-foreground">
          {status === 'error' ? 'Initialization failed' : 'Initializing...'}
        </p>
      </div>
    </div>
  );
}
