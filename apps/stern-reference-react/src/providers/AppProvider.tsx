import React from 'react';
import { WidgetHost, BrowserAdapter, WidgetRegistry } from '@marketsui/widget-sdk';
import { BlotterProvider, dataProviderConfigService } from '@marketsui/widgets-react';
import type { IBlotterDataProvider, IActionRegistry } from '@marketsui/widgets-react';
import { MockDataProvider } from '../data/MockDataProvider.js';
import { widgetRegistry } from '../registry/widgetRegistry.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_URL = `${API_BASE_URL}/api/v1`;
const USER_ID = 'default-user';

// Configure the data provider config service with the resolved API URL
dataProviderConfigService.configure({ apiUrl: API_BASE_URL });

/**
 * Create the platform adapter — uses BrowserAdapter for development,
 * can be swapped to OpenFinAdapter for OpenFin deployment.
 */
const platform = new BrowserAdapter(API_URL);

/**
 * Default mock data provider for development.
 * In production, replace with STOMP or REST implementations.
 */
const mockDataProvider: IBlotterDataProvider = new MockDataProvider();

/**
 * Default action registry — extend with custom actions.
 */
const actionRegistry: IActionRegistry = {
  execute(actionId: string, context: Record<string, unknown>) {
    console.log(`[ActionRegistry] Execute: ${actionId}`, context);
  },
  getAvailableActions() {
    return [
      { id: 'export-csv', label: 'Export CSV' },
      { id: 'refresh-data', label: 'Refresh Data' },
    ];
  },
};

export interface AppProviderProps {
  children: React.ReactNode;
}

/**
 * AppProvider — composition layer that wires WidgetHost + BlotterProvider.
 * This is the thin glue layer between the framework packages and the app.
 */
export function AppProvider({ children }: AppProviderProps) {
  return (
    <WidgetHost
      apiUrl={API_URL}
      userId={USER_ID}
      platform={platform}
      registry={widgetRegistry}
    >
      <BlotterProvider
        dataProvider={mockDataProvider}
        actionRegistry={actionRegistry}
      >
        {children}
      </BlotterProvider>
    </WidgetHost>
  );
}
