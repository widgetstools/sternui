/**
 * The fixed "Tools" menu for the custom dock (Session 6).
 *
 * Parity with `buildClassicSystemTools` / `buildSystemContentMenuEntries`
 * in `openfin-platform/dock.ts` — the same nine system actions, in the same
 * order. The difference: here each entry carries a `lucide-react` component
 * (rendered natively in the React tree, theme-coloured via `currentColor`)
 * instead of a pre-baked data-URL SVG. Action ids come from the
 * side-effect-free `/config` subpath, so this module never drags in
 * `@openfin/*`.
 */

import {
  Settings,
  Database,
  FolderSearch,
  RefreshCw,
  Code2,
  Bug,
  Download,
  Upload,
  Eye,
  type LucideIcon,
} from "lucide-react";
import {
  ACTION_OPEN_WORKSPACE_SETUP,
  ACTION_OPEN_DATA_PROVIDERS,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_RELOAD_DOCK,
  ACTION_SHOW_DEVTOOLS,
  ACTION_INSPECT_SHARED_WORKER,
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
  ACTION_TOGGLE_PROVIDER,
} from "@starui/openfin-platform/config";

export interface SystemToolItem {
  id: string;
  label: string;
  actionId: string;
  Icon: LucideIcon;
}

export const SYSTEM_TOOLS: SystemToolItem[] = [
  { id: "tool-workspace-setup", label: "Workspace Setup", actionId: ACTION_OPEN_WORKSPACE_SETUP, Icon: Settings },
  { id: "tool-data-providers", label: "Data Providers", actionId: ACTION_OPEN_DATA_PROVIDERS, Icon: Database },
  { id: "tool-config-browser", label: "Config Browser", actionId: ACTION_OPEN_CONFIG_BROWSER, Icon: FolderSearch },
  { id: "tool-reload-dock", label: "Reload Dock", actionId: ACTION_RELOAD_DOCK, Icon: RefreshCw },
  { id: "tool-devtools", label: "Developer Tools", actionId: ACTION_SHOW_DEVTOOLS, Icon: Code2 },
  { id: "tool-inspect-shared-worker", label: "Inspect Shared Worker", actionId: ACTION_INSPECT_SHARED_WORKER, Icon: Bug },
  { id: "tool-export-config", label: "Export Config", actionId: ACTION_EXPORT_CONFIG, Icon: Download },
  { id: "tool-import-config", label: "Import Config", actionId: ACTION_IMPORT_CONFIG, Icon: Upload },
  { id: "tool-toggle-provider", label: "Show/Hide Provider", actionId: ACTION_TOGGLE_PROVIDER, Icon: Eye },
];
