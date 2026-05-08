/**
 * @starui/dock-editor — legacy barrel.
 *
 * The standalone Dock Editor panel (`DockEditorPanel`) and its
 * `injectEditorStyles` helper are the only public surface remaining.
 * `WorkspaceSetup`, `ImportConfig`, and the `useDockEditor` hook all
 * relocated to `@starui/workspace-setup-react`. This entire package
 * is deleted in Task 5 once the markets-ui-react-reference shell
 * stops referencing `@starui/dock-editor`.
 */

export { DockEditorPanel } from './DockEditor';
export { injectEditorStyles } from './components/dock-editor/editorStyles';
