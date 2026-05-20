import { DataProviderConfigStore } from '@starui/host-data/runtime';
import type { DataProviderConfig } from '@starui/types';
import { LOGGED_IN_USER_ID } from '@starui/types';
import { dataServices } from './dataServices';
import { positionsProviderDraft } from './providers/positionsStomp';

const configStore = new DataProviderConfigStore(dataServices.configManager);

export async function ensureStompProvider(): Promise<string> {
  const existing = (await configStore.list(LOGGED_IN_USER_ID, { subtype: 'stomp' }))
    .find((p: DataProviderConfig) => p.name === positionsProviderDraft.name);

  if (existing?.providerId) return existing.providerId;

  const saved = await configStore.save(positionsProviderDraft, LOGGED_IN_USER_ID);
  if (!saved.providerId) throw new Error('Provider save did not return providerId');
  return saved.providerId;
}
