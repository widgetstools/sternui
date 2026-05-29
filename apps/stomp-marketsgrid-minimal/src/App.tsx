import { useEffect, useState } from 'react';
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { useDataServices, useUserIdFromContext } from '@starui/host-data-react/runtime';
import { getPlatform } from './bootstrap.js';
import { stompProviderDraft } from './stompProvider.js';

/**
 * 1. Seed a STOMP provider row in the hub catalog (programmatic, no UI).
 * 2. Mount HostedMarketsGrid with `defaultLiveProviderId` — hub attach, no cfg prop.
 */
export function App() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'stomp' });
      const existing = rows.find((p) => p.name === stompProviderDraft.name);
      const id =
        existing?.providerId ??
        (await configStore.save(stompProviderDraft, userId)).providerId;
      if (!cancelled && id) setProviderId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  if (!providerId) return null;

  return (
    <HostedMarketsGrid
      gridId="stomp-blotter"
      componentName="STOMP Positions"
      defaultInstanceId="stomp-blotter"
      defaultLiveProviderId={providerId}
      withStorage
      configManager={getPlatform().configManager}
    />
  );
}
