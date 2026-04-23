/**
 * OpenfinProviderComponent — platform provider loaded at /platform/provider.
 *
 * The provider window stays hidden at all times in OpenFin.
 * The Dock Editor is a separate fin.Window at /dock-editor that communicates
 * with this provider via IAB:
 *   stern:dock-editor:request-config → provider responds with current menu items
 *   stern:dock-editor:apply          → provider applies updated menu items to dock
 *
 * Mirrors the React OpenfinProvider.tsx exactly.
 */

import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { bootstrapPlatform, buildUrl, createMenuItem, type DockMenuItem } from '@stern/openfin-platform';
import { DockConfiguratorComponent } from '@stern/angular';
import * as dock from './openfinDock';

declare const fin: any;

type Status = 'initializing' | 'ready' | 'error' | 'no-openfin';

function getDefaultMenuItems(): DockMenuItem[] {
  return [
    createMenuItem({ id: 'orders-blotter',    caption: 'Orders Blotter',    url: '/blotter/orders',    openMode: 'view', order: 0 }),
    createMenuItem({ id: 'fills-blotter',     caption: 'Fills Blotter',     url: '/blotter/fills',     openMode: 'view', order: 1 }),
    createMenuItem({ id: 'positions-blotter', caption: 'Positions Blotter', url: '/blotter/positions', openMode: 'view', order: 2 }),
  ];
}

@Component({
  selector: 'stern-openfin-provider',
  standalone: true,
  imports: [CommonModule, DockConfiguratorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Browser preview mode (no OpenFin) — shows DockConfigurator preview -->
    <ng-container *ngIf="status === 'no-openfin'">
      <div class="h-screen w-screen flex flex-col bg-background text-foreground">
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card text-xs text-muted-foreground">
          <span>Stern Reference Platform (Angular)</span>
          <span class="flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
            Preview Mode
          </span>
        </div>
        <div class="flex-1 overflow-hidden">
          <stern-dock-configurator
            [initialItems]="menuItems"
            [onApply]="noopApply"
          ></stern-dock-configurator>
        </div>
      </div>
    </ng-container>

    <!-- OpenFin mode — provider window is always hidden; shows spinner while initializing -->
    <ng-container *ngIf="status !== 'no-openfin'">
      <div class="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <div class="text-center">
          <div *ngIf="status === 'error'; else spinner"
            class="h-12 w-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <span class="text-destructive text-lg">!</span>
          </div>
          <ng-template #spinner>
            <div class="h-12 w-12 mx-auto mb-4 rounded-full border-[3px] border-muted border-t-primary animate-spin"></div>
          </ng-template>
          <h1 class="text-lg font-semibold mb-1">Stern Reference Platform</h1>
          <p class="text-sm text-muted-foreground">
            {{ status === 'error' ? 'Initialization failed' : 'Initializing...' }}
          </p>
        </div>
      </div>
    </ng-container>
  `,
})
export class OpenfinProviderComponent implements OnInit {
  status: Status = 'initializing';
  menuItems: DockMenuItem[] = getDefaultMenuItems();
  readonly noopApply = async () => {};

  private initialized = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (typeof window === 'undefined') return;

    if (!(window as any).fin) {
      this.status = 'no-openfin';
      this.cdr.markForCheck();
      return;
    }

    if (this.initialized) return;
    this.initialized = true;

    bootstrapPlatform({
      dock: { icon: buildUrl('/star.png'), title: 'Stern Reference Platform' },
      dockActions: dock,
      registrations: [
        { configType: 'GRID', configSubType: 'ORDERS',    url: '/blotter/orders',    width: 1200, height: 700, label: 'Orders Blotter' },
        { configType: 'GRID', configSubType: 'FILLS',     url: '/blotter/fills',     width: 1200, height: 700, label: 'Fills Blotter' },
        { configType: 'GRID', configSubType: 'POSITIONS', url: '/blotter/positions', width: 1200, height: 700, label: 'Positions Blotter' },
      ],
      onReady: () => {
        this.status = 'ready';
        this.cdr.markForCheck();
      },
    }).catch((err: unknown) => {
      console.error('[Provider] bootstrapPlatform failed', err);
      this.status = 'error';
      this.cdr.markForCheck();
    });
  }
}
