import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface WidgetEntry {
  id: string;
  label: string;
  route: string;
  description: string;
  category: string;
}

const WIDGET_ROUTES: WidgetEntry[] = [
  {
    id: 'orders-blotter',
    label: 'Orders Blotter',
    route: '/blotter/orders',
    description: 'Real-time orders blotter with mock streaming data',
    category: 'Trading',
  },
  {
    id: 'fills-blotter',
    label: 'Fills Blotter',
    route: '/blotter/fills',
    description: 'Historical and real-time fills view',
    category: 'Trading',
  },
  {
    id: 'positions-blotter',
    label: 'Positions Blotter',
    route: '/blotter/positions',
    description: 'Portfolio positions view',
    category: 'Portfolio',
  },
];

@Component({
  selector: 'stern-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-background p-8">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-2xl font-bold mb-1">Stern Trading Platform</h1>
        <p class="text-sm text-muted-foreground mb-1">Angular Reference Application</p>
        <p class="text-muted-foreground mb-8">Select a widget to launch</p>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <a
            *ngFor="let route of widgetRoutes"
            [routerLink]="route.route"
            [queryParams]="{ id: route.id }"
            class="block p-4 rounded-lg border border-border bg-card hover:bg-accent transition-colors"
          >
            <h3 class="font-semibold mb-1">{{ route.label }}</h3>
            <p class="text-sm text-muted-foreground">{{ route.description }}</p>
            <span class="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
              {{ route.category }}
            </span>
          </a>
        </div>

        <div class="mt-8 pt-6 border-t border-border">
          <h2 class="text-lg font-semibold mb-4">Administration</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <a routerLink="/dataproviders"
              class="block p-4 rounded-lg border border-border bg-card hover:bg-accent transition-colors">
              <h3 class="font-semibold mb-1">Data Providers</h3>
              <p class="text-sm text-muted-foreground">
                Configure STOMP, REST, WebSocket, and Mock data sources
              </p>
              <span class="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                Configuration
              </span>
            </a>
            <a routerLink="/platform/provider"
              class="block p-4 rounded-lg border border-border bg-card hover:bg-accent transition-colors">
              <h3 class="font-semibold mb-1">Dock Configurator (Preview)</h3>
              <p class="text-sm text-muted-foreground">
                Edit the OpenFin dock menu in browser preview mode
              </p>
              <span class="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                OpenFin
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HomeComponent {
  readonly widgetRoutes = WIDGET_ROUTES;
}
