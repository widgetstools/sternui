/**
 * useDataPlaneResolve — returns a stable callback that substitutes
 * `{{providerId.key}}` tokens against the configured AppData providers.
 *
 * Round-trips through the worker, so cross-provider templates work
 * even when the caller doesn't have direct subscriptions to the
 * referenced keys. Tokens that don't resolve are left as-is in the
 * output — callers can decide whether that's a hard failure.
 *
 * Common consumer: the StompDataProvider configurator's Connection tab
 * preview, which renders the substituted `requestMessage` /
 * `requestBody` so the user can see the live values their template
 * will be sent with.
 */
import { useCallback } from 'react';
import { useDataPlaneClient } from './context';

export interface UseResolveResult {
  resolve: (template: string) => Promise<string>;
}

export function useDataPlaneResolve(): UseResolveResult {
  const client = useDataPlaneClient();

  const resolve = useCallback(
    (template: string) => client.resolve(template),
    [client],
  );

  return { resolve };
}
