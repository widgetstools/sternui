// ─── useConfigService ──────────────────────────────────────────────
//
// Read-only access to the value carried by `<ConfigServiceProvider>`.
// Throws when called outside a Provider so a missing wiring fails
// fast at the call site instead of yielding a silent `null`.

import { useContext } from 'react';

import { ConfigServiceContext } from './configServiceContext';
import type { ConfigServiceContextValue } from './types';

export function useConfigService(): ConfigServiceContextValue {
  const ctx = useContext(ConfigServiceContext);
  if (!ctx) {
    throw new Error(
      'useConfigService must be used within <ConfigServiceProvider>',
    );
  }
  return ctx;
}
