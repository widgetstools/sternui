/**
 * Default Icon Mapping for Dock Menu Items
 *
 * Provides default icons for menu items that don't have custom icons specified.
 * Icons are selected based on menu item caption keywords.
 * Each icon category has both light and dark theme variants.
 */

import { buildUrl } from './urlHelper.js';
import type { DockMenuItem } from '../types/dockConfig.js';

interface IconCategory {
  baseName: string;
  keywords: string[];
}

const ICON_CATEGORIES: IconCategory[] = [
  { baseName: 'blotter', keywords: ['blotter', 'trades', 'orders', 'positions', 'executions', 'fills'] },
  { baseName: 'chart', keywords: ['chart', 'graph', 'analytics', 'analysis', 'market data', 'prices'] },
  { baseName: 'watchlist', keywords: ['watchlist', 'watch list', 'symbols', 'quotes', 'tickers'] },
  { baseName: 'report', keywords: ['report', 'reports', 'statement', 'summary', 'pnl', 'p&l'] },
  { baseName: 'data', keywords: ['data', 'database', 'table', 'grid', 'list'] },
  { baseName: 'dashboard', keywords: ['dashboard', 'overview', 'home', 'main'] },
  { baseName: 'settings', keywords: ['settings', 'config', 'configuration', 'preferences', 'options'] },
  { baseName: 'user', keywords: ['user', 'profile', 'account', 'admin'] },
  { baseName: 'tools', keywords: ['tools', 'utilities', 'developer', 'debug'] },
  { baseName: 'calculator', keywords: ['calculator', 'calc', 'calculate', 'pricing'] },
  { baseName: 'calendar', keywords: ['calendar', 'schedule', 'events', 'dates'] },
  { baseName: 'notification', keywords: ['notification', 'notifications', 'alerts', 'messages'] },
  { baseName: 'mail', keywords: ['mail', 'email', 'message', 'inbox'] },
  { baseName: 'document', keywords: ['document', 'documents', 'files', 'file'] },
  { baseName: 'folder', keywords: ['folder', 'directory', 'workspace', 'project'] },
  { baseName: 'window', keywords: ['window', 'view', 'panel'] },
  { baseName: 'app', keywords: ['app', 'application', 'program'] },
];

const DEFAULT_BASE_NAME = 'default';

/**
 * Get the appropriate default icon for a menu item based on caption keywords.
 */
export function getDefaultMenuIcon(
  menuItem: DockMenuItem,
  theme: 'light' | 'dark' = 'light',
  _level: number = 0
): string {
  if (menuItem.icon) {
    return buildUrl(menuItem.icon);
  }

  const caption = menuItem.caption.toLowerCase();

  for (const category of ICON_CATEGORIES) {
    for (const keyword of category.keywords) {
      if (caption.includes(keyword)) {
        return buildUrl(`/icons/${category.baseName}-${theme}.svg`);
      }
    }
  }

  if (menuItem.children && menuItem.children.length > 0) {
    return buildUrl(`/icons/folder-${theme}.svg`);
  }

  return buildUrl(`/icons/${DEFAULT_BASE_NAME}-${theme}.svg`);
}
