/**
 * @starui/workspace-setup-react — public surface.
 *
 * The 3-pane WorkspaceSetup editor, the ImportConfig utility window,
 * plus the registry/dock primitives that power them. Hosted in OpenFin
 * child windows by the markets-ui-react-reference shell.
 *
 * The hook + helper exports below (`useDockEditor`, `useRegistryEditor`,
 * `iconIdToSvgUrl`, `parseIconUrl`, `ICON_OPTIONS`, etc.) are kept
 * public for downstream callers that need to compose dock / registry
 * state outside the bundled WorkspaceSetup shell.
 */

export { WorkspaceSetup } from "./WorkspaceSetup";
export { default as ImportConfig } from "./ImportConfig";

// Dock + registry composition hooks.
export { useDockEditor } from "./hooks/useDockEditor";
export { useRegistryEditor } from "./registry/useRegistryEditor";

// Icon helpers used by dock-toolbar configuration.
export { iconIdToSvgUrl, parseIconUrl, iconIdToThemedUrls } from "./components/dock-editor/iconUtils";
export { ICON_OPTIONS, DEFAULT_ICON, findIconByName } from "./components/dock-editor/icons";
export type { IconOption } from "./components/dock-editor/icons";
