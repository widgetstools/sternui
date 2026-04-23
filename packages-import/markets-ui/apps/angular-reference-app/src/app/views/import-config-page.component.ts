/**
 * ImportConfigPageComponent
 *
 * Thin wrapper that renders the ImportConfigComponent from
 * the @markets/angular-dock-editor package.
 * This is loaded at the /import-config route.
 */

import { Component } from '@angular/core';
import { ImportConfigComponent } from '@markets/angular-dock-editor';

@Component({
  selector: 'app-import-config-page',
  standalone: true,
  imports: [ImportConfigComponent],
  template: `<mkt-import-config />`,
})
export class ImportConfigPageComponent {}
