/**
 * Re-export the shared `--de-*` token alias bridge from the dock-editor
 * package. The Config Browser uses the same design-system token block
 * as the dock / registry editors, so consumers need only import from
 * one place.
 */
export { injectEditorStyles } from "@marketsui/dock-editor";
