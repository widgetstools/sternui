/**
 * HomeComponent — root landing page rendered at `/`.
 * Angular equivalent of the React app's `App.tsx`.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule],
  template: `
    <div class="flex flex-col flex-1 gap-5 p-6">
      <header class="flex flex-row justify-between items-center">
        <div class="flex flex-col">
          <h1 class="text-xl font-bold">OpenFin Angular</h1>
          <p class="text-sm text-muted-foreground">
            Example demonstrating running an Angular app in an OpenFin workspace
          </p>
        </div>
      </header>

      <main class="flex flex-col gap-2.5">
        <p-card header="Getting Started" subheader="Launch this application in the OpenFin container">
          <p>To launch this application in the OpenFin container, run the following command:</p>
          <pre class="mt-2 rounded-md bg-muted p-3 font-mono text-sm">npm run client</pre>
        </p-card>

        <p-card header="Blotters" subheader="Hosted MarketsGrid instances">
          <div class="flex flex-col gap-2">
            <p class="text-sm text-muted-foreground m-0">
              MarketsGrid is not yet wired into the Angular reference app —
              an &#64;marketsui/angular-markets-grid adapter is needed to host it.
              The React reference app at <code class="font-mono">/blotters/marketsgrid</code>
              shows the equivalent feature.
            </p>
          </div>
        </p-card>
      </main>
    </div>
  `,
})
export class HomeComponent {}
