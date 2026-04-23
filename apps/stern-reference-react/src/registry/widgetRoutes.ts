import type { WidgetRouteEntry } from '@marketsui/shared-types';

/**
 * Widget routes — defines available widgets for the dock combobox / navigation.
 */
export const widgetRoutes: WidgetRouteEntry[] = [
  {
    id: 'orders-blotter',
    label: 'Orders Blotter',
    route: '/blotter/orders',
    icon: 'table',
    description: 'Real-time orders blotter with STOMP streaming',
    category: 'Trading',
  },
  {
    id: 'fills-blotter',
    label: 'Fills Blotter',
    route: '/blotter/fills',
    icon: 'table',
    description: 'Historical and real-time fills view',
    category: 'Trading',
  },
  {
    id: 'positions-blotter',
    label: 'Positions Blotter',
    route: '/blotter/positions',
    icon: 'table',
    description: 'Portfolio positions view',
    category: 'Portfolio',
  },
];
