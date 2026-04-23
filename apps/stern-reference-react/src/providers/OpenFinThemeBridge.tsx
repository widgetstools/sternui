/**
 * OpenFinThemeBridge — renders nothing, just activates the theme sync hook.
 * Must be placed inside ThemeProvider so useTheme() is available.
 */

import { useOpenFinThemeSync } from '../hooks/useOpenFinThemeSync.js';

export function OpenFinThemeBridge() {
  useOpenFinThemeSync();
  return null;
}
