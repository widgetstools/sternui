/**
 * DockEditorComponent — rendered in a standalone fin.Window at /dock-editor.
 * Communicates with the platform provider via IAB:
 *   - subscribes to 'stern:dock-editor:config' to receive current items
 *   - publishes 'stern:dock-editor:request-config' to request them
 *   - publishes 'stern:dock-editor:apply' when user applies changes
 *
 * Mirrors the React DockEditorWindow.tsx exactly.
 */

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DockMenuItem } from '@marketsui/openfin-platform-stern';
import { DockConfiguratorComponent } from '@marketsui/angular';

declare const fin: any;

@Component({
  selector: 'stern-dock-editor',
  standalone: true,
  imports: [CommonModule, DockConfiguratorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Loading state -->
    <div *ngIf="items === null" class="h-screen w-screen flex items-center justify-center bg-background text-foreground">
      <div class="text-center">
        <div class="h-8 w-8 mx-auto mb-3 rounded-full border-[3px] border-muted border-t-primary animate-spin"></div>
        <p class="text-sm text-muted-foreground">Loading dock configuration...</p>
      </div>
    </div>

    <!-- Dock configurator -->
    <div *ngIf="items !== null" class="h-screen w-screen flex flex-col bg-background text-foreground">
      <stern-dock-configurator
        [initialItems]="items!"
        [onApply]="handleApply"
      ></stern-dock-configurator>
    </div>
  `,
})
export class DockEditorComponent implements OnInit, OnDestroy {
  items: DockMenuItem[] | null = null;

  private received = false;
  private configListener?: (sender: unknown, data: { menuItems: DockMenuItem[] }) => void;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!(window as any).fin) {
      this.items = [];
      this.cdr.markForCheck();
      return;
    }

    this.configListener = (_sender, data) => {
      if (!this.received) {
        this.received = true;
        this.items = Array.isArray(data.menuItems) ? data.menuItems : [];
        this.cdr.markForCheck();
      }
    };

    const setup = async () => {
      // Subscribe before publishing the request to avoid a race condition.
      await fin.InterApplicationBus.subscribe(
        { uuid: fin.me.uuid },
        'stern:dock-editor:config',
        this.configListener,
      );
      await fin.InterApplicationBus.publish('stern:dock-editor:request-config', {});
    };

    setup().catch(console.error);
  }

  ngOnDestroy(): void {
    if ((window as any).fin && this.configListener) {
      fin.InterApplicationBus
        .unsubscribe({ uuid: fin.me.uuid }, 'stern:dock-editor:config', this.configListener)
        .catch(() => {});
    }
  }

  readonly handleApply = async (newItems: DockMenuItem[]): Promise<void> => {
    if ((window as any).fin) {
      await fin.InterApplicationBus.publish('stern:dock-editor:apply', { menuItems: newItems });
    }
  };
}
