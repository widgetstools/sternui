/**
 * WorkspaceSetupPageComponent
 *
 * Thin wrapper that renders the WorkspaceSetupComponent from
 * @marketsui/angular-dock-editor at the /workspace-setup route.
 * Mirrors the dock-editor-page / registry-editor-page wrapper pattern.
 */

import { Component } from '@angular/core';
import { WorkspaceSetupComponent } from '@marketsui/angular-dock-editor';

@Component({
  selector: 'app-workspace-setup-page',
  standalone: true,
  imports: [WorkspaceSetupComponent],
  template: `<mkt-workspace-setup />`,
})
export class WorkspaceSetupPageComponent {}
