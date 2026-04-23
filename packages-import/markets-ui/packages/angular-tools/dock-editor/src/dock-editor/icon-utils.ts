/**
 * Icon utilities for the Angular dock editor.
 *
 * Supports two icon sources:
 * 1. Lucide icons via Iconify CDN — iconId format: "lucide:icon-name"
 * 2. Custom market icons from @markets/icons-svg — iconId format: "mkt:icon-name"
 */

import { marketIconToDataUrl } from "@markets/icons-svg/all-icons";

const DARK_COLOR  = '#ffffff';
const LIGHT_COLOR = '#1a1a2e';
const ICON_HEIGHT = 24;
const DEFAULT_ICON_ID = 'lucide:file-text';

/**
 * Build an SVG URL for the given icon ID and colour.
 *
 * - "lucide:home"   → Iconify CDN URL
 * - "mkt:bond"      → inline data URL from @markets/icons-svg
 */
export function iconIdToSvgUrl(iconId: string, color = DARK_COLOR): string {
  const [prefix, name] = iconId.split(':');
  if (!prefix || !name) return '';

  // Custom market icons
  if (prefix === 'mkt') {
    return marketIconToDataUrl(name, color);
  }

  // Iconify CDN icons
  return `https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(color)}&height=${ICON_HEIGHT}`;
}

/**
 * Get both dark-theme and light-theme URLs for an icon.
 */
export function iconIdToThemedUrls(iconId: string): { dark: string; light: string } {
  return {
    dark:  iconIdToSvgUrl(iconId, DARK_COLOR),
    light: iconIdToSvgUrl(iconId, LIGHT_COLOR),
  };
}

/**
 * Parse an Iconify CDN URL to extract the icon ID.
 */
export function parseIconUrl(iconUrl: string | undefined): { iconId: string } {
  if (!iconUrl) return { iconId: DEFAULT_ICON_ID };
  const match = iconUrl.match(/api\.iconify\.design\/([^/]+)\/([^.?]+)/);
  if (match) {
    return { iconId: `${match[1]}:${match[2]}` };
  }
  return { iconId: DEFAULT_ICON_ID };
}
