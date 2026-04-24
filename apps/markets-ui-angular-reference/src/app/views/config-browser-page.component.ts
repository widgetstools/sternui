/**
 * ConfigBrowserPageComponent
 *
 * Thin wrapper that renders the ConfigBrowserComponent from
 * the @marketsui/angular-config-browser package.
 * This is loaded at the /config-browser route.
 */

import { Component } from '@angular/core';
import { ConfigBrowserComponent } from '@marketsui/angular-config-browser';

@Component({
  selector: 'app-config-browser-page',
  standalone: true,
  imports: [ConfigBrowserComponent],
  template: `<mkt-config-browser />`,
})
export class ConfigBrowserPageComponent {}
