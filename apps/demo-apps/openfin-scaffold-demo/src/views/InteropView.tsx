/**
 * Interop sample view — OpenFin Notifications + FDC3 broadcast/listen.
 *
 * Demonstrates view-level APIs declared in `public/views/interop.fin.json`
 * (`fdc3InteropApi: "2.0"`, context group `green`).
 */
import { useEffect, useState } from 'react';
import * as Notifications from '@openfin/notifications';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@starui/ui';

export default function InteropView() {
  const [lastAction, setLastAction] = useState('');

  useEffect(() => {
    let handler: ((event: Notifications.NotificationActionEvent) => void) | undefined;
    Notifications.register()
      .then(() => {
        handler = (event) => {
          const data = String(event.result['customData'] ?? '');
          setLastAction(`Notification: ${data}`);
        };
        Notifications.addEventListener('notification-action', handler);
      })
      .catch((err) => console.warn('[interop] notifications unavailable:', err));

    return () => {
      if (handler) Notifications.removeEventListener('notification-action', handler);
    };
  }, []);

  async function sendNotification() {
    const finApi = (window as unknown as { fin?: { me: { identity: { uuid: string } } } }).fin;
    if (!finApi) return;
    await Notifications.create({
      platform: finApi.me.identity.uuid,
      title: 'Scaffold notification',
      body: 'Click the CTA to post customData back to this view.',
      toast: 'transient',
      buttons: [
        {
          title: 'Acknowledge',
          type: 'button',
          cta: true,
          onClick: { customData: 'ack-from-scaffold' },
        },
      ],
    });
  }

  async function broadcastInstrument() {
    const fdc3Api = (window as unknown as { fdc3?: { broadcast: (ctx: unknown) => Promise<void> } }).fdc3;
    if (!fdc3Api) {
      setLastAction('fdc3 not available (open this view inside OpenFin)');
      return;
    }
    await fdc3Api.broadcast({
      type: 'fdc3.instrument',
      name: 'Microsoft Corporation',
      id: { ticker: 'MSFT' },
    });
    setLastAction('Broadcast fdc3.instrument (MSFT) on default channel');
  }

  return (
    <div className="flex max-w-lg flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Interop demo</CardTitle>
          <CardDescription>Notifications and FDC3 from a workspace view</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button type="button" onClick={() => void sendNotification()}>
            Send notification
          </Button>
          <Button type="button" variant="secondary" onClick={() => void broadcastInstrument()}>
            Broadcast FDC3 instrument
          </Button>
          {lastAction ? (
            <p className="text-xs text-muted-foreground">{lastAction}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
