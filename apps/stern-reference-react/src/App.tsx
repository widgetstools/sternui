import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useSearchParams } from 'react-router-dom';
import { resolveInstanceId } from '@marketsui/openfin-platform-stern';
import { AppProvider } from './providers/AppProvider.js';
import { OrdersBlotter } from './widgets/OrdersBlotter.js';
import { FillsBlotter } from './widgets/FillsBlotter.js';
import { SimpleBlotter } from '@marketsui/widgets-react';
import { widgetRoutes } from './registry/widgetRoutes.js';

// DataProvider authoring moved to the markets-ui-react-reference app
// (the v2 DataProviderEditor requires a `<DataPlaneProvider>` which
// stern-reference-react's stack doesn't wire). Launch the editor
// from that app or via the OpenFin dock if you need it.

/**
 * BlotterPage — renders a blotter widget using the configId from URL search params.
 */
function BlotterPage({ Widget }: { Widget: React.ComponentType<{ configId: string }> }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [configId, setConfigId] = useState(() => searchParams.get('id') || 'default-config');

  useEffect(() => {
    resolveInstanceId().then((id) => {
      if (id && id !== configId) {
        setConfigId(id);
        setSearchParams({ id }, { replace: true });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen w-screen">
      <Widget configId={configId} />
    </div>
  );
}

/**
 * HomePage — widget launcher showing available widgets.
 */
function HomePage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Stern Trading Platform</h1>
        <p className="text-muted-foreground mb-8">Select a widget to launch</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {widgetRoutes.map(route => (
            <Link
              key={route.id}
              to={`${route.route}?id=${route.id}`}
              className="block p-4 rounded-lg border border-border bg-card hover:bg-accent transition-colors"
            >
              <h3 className="font-semibold mb-1">{route.label}</h3>
              {route.description && (
                <p className="text-sm text-muted-foreground">{route.description}</p>
              )}
              {route.category && (
                <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                  {route.category}
                </span>
              )}
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}

/**
 * App — top-level component with routing and providers.
 */
export function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/blotter/orders" element={<BlotterPage Widget={OrdersBlotter} />} />
        <Route path="/blotter/fills" element={<BlotterPage Widget={FillsBlotter} />} />
        <Route path="/blotter/:type" element={<BlotterPage Widget={SimpleBlotter} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProvider>
  );
}
