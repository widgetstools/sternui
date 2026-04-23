/**
 * RegistryEditorPageComponent
 *
 * Thin wrapper that renders the RegistryEditorComponent from
 * the @markets/angular-registry-editor package.
 * This is loaded at the /registry-editor route.
 */

import { Component } from '@angular/core';
import { RegistryEditorComponent } from '@markets/angular-registry-editor';

@Component({
  selector: 'app-registry-editor-page',
  standalone: true,
  imports: [RegistryEditorComponent],
  template: `<mkt-registry-editor />`,
})
export class RegistryEditorPageComponent {}
