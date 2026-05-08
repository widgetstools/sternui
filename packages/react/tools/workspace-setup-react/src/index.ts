/**
 * @starui/workspace-setup-react — public surface.
 *
 * The 3-pane WorkspaceSetup editor, the ImportConfig utility window,
 * plus the registry/dock primitives that power them. Hosted in OpenFin
 * child windows by the markets-ui-react-reference shell.
 *
 * The hook + helper exports below (`useDockEditor`, `useRegistryEditor`,
 * `iconIdToSvgUrl`, `parseIconUrl`, `ICON_OPTIONS`, etc.) are public so
 * the soon-to-be-deleted `@starui/dock-editor` and `@starui/registry-editor`
 * shims can re-import them while Task 5 finishes the package teardown.
 */

export { WorkspaceSetup } from "./WorkspaceSetup";
export { default as ImportConfig } from "./ImportConfig";

// Hooks consumed by the legacy DockEditor / RegistryEditor panels until Task 5.
export { useDockEditor } from "./hooks/useDockEditor";
export { useRegistryEditor } from "./registry/useRegistryEditor";

// Icon helpers (consumed by the legacy DockEditor panel and its sub-forms).
export { iconIdToSvgUrl, parseIconUrl, iconIdToThemedUrls } from "./components/dock-editor/iconUtils";
export { ICON_OPTIONS, DEFAULT_ICON, findIconByName } from "./components/dock-editor/icons";
export type { IconOption } from "./components/dock-editor/icons";
