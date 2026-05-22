/**
 * Config Browser — inspect and edit persisted ConfigManager rows (Dexie / optional REST).
 *
 * Opened from the dock: Tools → Config Browser (`ACTION_OPEN_CONFIG_BROWSER`).
 * Route: `/config-browser` — DataServicesProvider only (no StarGridApp shell).
 */
import { ConfigBrowserPanel } from '@starui/config-browser';

export default function ConfigBrowserView() {
  return <ConfigBrowserPanel />;
}
