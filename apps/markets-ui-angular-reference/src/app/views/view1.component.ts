/**
 * View1Component — sample view with FDC3 broadcasting + OpenFin Notifications.
 * Angular equivalent of the React View1.
 */

import {
  Component,
  signal,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import * as Notifications from '@openfin/notifications';

declare const fin: any;

@Component({
  selector: 'app-view1',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, CardModule],
  template: `
    <div class="flex flex-col flex-1 gap-5 p-6">
      <header class="flex flex-row justify-between items-center">
        <div class="flex flex-col">
          <h1 class="text-xl font-bold">OpenFin Angular View 1</h1>
          <p class="text-sm text-muted-foreground">Angular app view in an OpenFin workspace</p>
        </div>
      </header>

      <main>
        <p-card header="Workspace Features" subheader="Notifications and FDC3 broadcasting">
          <div class="flex flex-col gap-2 items-start">
            <p-button label="Show Notification" (onClick)="showNotification()" />
            <p-button
              label="Broadcast FDC3 Context"
              severity="secondary"
              (onClick)="broadcastFDC3Context()"
            />
            <p-button
              label="Broadcast FDC3 Context on App Channel"
              [outlined]="true"
              (onClick)="broadcastFDC3ContextAppChannel()"
            />
            <p
              *ngIf="notificationActionMessage()"
              class="text-sm text-muted-foreground m-0"
            >
              Notification action: {{ notificationActionMessage() }}
            </p>
          </div>
        </p-card>
      </main>
    </div>
  `,
})
export class View1Component implements OnInit, OnDestroy {
  readonly notificationActionMessage = signal('');

  private notificationHandler:
    | ((event: Notifications.NotificationActionEvent) => void)
    | undefined;

  async ngOnInit(): Promise<void> {
    try {
      await Notifications.register();
      this.notificationHandler = (event: Notifications.NotificationActionEvent) => {
        const data = event.result['customData'];
        console.log('Notification clicked:', data);
        this.notificationActionMessage.set(String(data ?? ''));
      };
      Notifications.addEventListener('notification-action', this.notificationHandler);
    } catch (err) {
      console.warn('Notifications registration failed:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.notificationHandler) {
      Notifications.removeEventListener('notification-action', this.notificationHandler);
      this.notificationHandler = undefined;
    }
  }

  async showNotification(): Promise<void> {
    if (typeof fin === 'undefined') return;
    await Notifications.create({
      platform: fin.me.identity.uuid,
      title: 'Simple Notification',
      body: 'This is a simple notification',
      toast: 'transient',
      buttons: [
        {
          title: 'Click me',
          type: 'button',
          cta: true,
          onClick: {
            customData: 'custom notification data',
          },
        },
      ],
    });
  }

  async broadcastFDC3Context(): Promise<void> {
    const fdc3 = (window as any).fdc3;
    if (!fdc3) return;
    await fdc3.broadcast({
      type: 'fdc3.instrument',
      name: 'Microsoft Corporation',
      id: { ticker: 'MSFT' },
    });
  }

  async broadcastFDC3ContextAppChannel(): Promise<void> {
    const fdc3 = (window as any).fdc3;
    if (!fdc3) return;
    const appChannel = await fdc3.getOrCreateChannel('CUSTOM-APP-CHANNEL');
    await appChannel.broadcast({
      type: 'fdc3.instrument',
      name: 'Apple Inc.',
      id: { ticker: 'AAPL' },
    });
  }
}
