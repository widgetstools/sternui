/**
 * ProviderComponent
 *
 * The OpenFin platform provider window — Angular equivalent of the
 * React Provider.tsx. Calls initWorkspace() from @markets/openfin-workspace
 * to register the dock, set up custom actions, and initialise the
 * config service.
 *
 * In production, set platform.autoShow: false in manifest.fin.json
 * to keep this window hidden.
 */

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { initWorkspace } from '@markets/openfin-workspace';

@Component({
  selector: 'app-provider',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col flex-1 gap-5">
      <header>
        <h1 class="text-xl font-bold">OpenFin Platform Window (Angular)</h1>
        <p class="text-sm text-muted-foreground">Workspace platform window</p>
      </header>

      <main class="p-4 rounded border" style="background: hsl(var(--card)); border-color: hsl(var(--border));">
        <h2 class="text-base font-semibold mb-1">Platform Provider</h2>
        <p class="text-sm text-muted-foreground mb-2">This window initializes the platform</p>
        <p class="text-sm">
          The window would usually be hidden. Set the platform.autoShow flag to false in
          manifest.fin.json to hide it on startup.
        </p>
        <p class="mt-2 text-sm font-medium">{{ message() }}</p>
      </main>
    </div>
  `,
})
export class ProviderComponent implements OnInit {
  protected readonly message = signal('');

  ngOnInit(): void {
    try {
      initWorkspace({
        // The icon shown at the left end of the dock bar.
        dockIcon: 'http://localhost:4200/dock-provider.png',

        // Theme toggle icons default to built-in sun/moon SVGs.

        // Progress callback — updates the status message shown above.
        onProgress: (msg) => this.message.set(msg),

        // User roles — controls which system buttons appear in the dock.
        roles: ['admin', 'developer'],

        // Home and Store are disabled for this reference app.
        components: {
          home: false,
          store: false,
        },
      });
    } catch (err) {
      console.error('Failed to initialize workspace platform:', err);
    }
  }
}
