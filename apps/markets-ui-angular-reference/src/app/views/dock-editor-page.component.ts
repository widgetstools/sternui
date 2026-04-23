/**
 * DockEditorPageComponent
 *
 * Thin wrapper that renders the DockEditorComponent from
 * the @marketsui/angular-dock-editor package.
 * This is loaded at the /dock-editor route.
 */

import { Component } from '@angular/core';
import { DockEditorComponent } from '@marketsui/angular-dock-editor';

@Component({
  selector: 'app-dock-editor-page',
  standalone: true,
  imports: [DockEditorComponent],
  template: `<mkt-dock-editor />`,
})
export class DockEditorPageComponent {}
