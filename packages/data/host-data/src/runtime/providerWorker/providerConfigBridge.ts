/**
 * Config resolution helpers for provider SharedWorkers / façade (ADR Phase 4b).
 *
 * Prefer Config SW {@link ConfigClient} over embedding a second Dexie writer
 * on the hot path. The provider worker still may hydrate a local catalog
 * via ConfigManager at boot (dual with Config SW until single-writer).
 */

import type { ProviderConfig } from '@starui/types';
import type { ConfigClient } from '../configWorker/ConfigClient.js';

/**
 * Resolve provider cfg from the Config SharedWorker.
 * Returns null when the id is missing (caller should status:error).
 */
export async function resolveProviderConfigFromConfigClient(
  client: ConfigClient,
  providerId: string,
): Promise<ProviderConfig | null> {
  return client.getProviderConfig(providerId);
}
