/**
 * @markets/angular-dock-editor
 *
 * Angular standalone components for editing the OpenFin dock configuration.
 * Angular equivalent of @markets/dock-editor (the React version).
 *
 * Usage in an Angular app:
 *
 *   import { DockEditorComponent } from '@markets/angular-dock-editor';
 *
 *   // In your route config:
 *   { path: 'dock-editor', component: DockEditorComponent }
 */

export { DockEditorComponent } from './dock-editor/dock-editor.component';
export { DockEditorService   } from './dock-editor/dock-editor.service';
export { ImportConfigComponent } from './import-config/import-config.component';

// Form types (useful for host apps that extend the editor)
export type { ItemFormData } from './dock-editor/item-form/item-form.component';
export type { TreeItemData } from './dock-editor/tree-item/tree-item.component';

// Icon utilities
export { iconIdToSvgUrl, iconIdToThemedUrls } from './dock-editor/icon-utils';
