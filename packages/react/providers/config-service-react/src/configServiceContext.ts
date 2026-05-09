// Internal: shared React context used by `ConfigServiceProvider` and
// `useConfigService`. Separated from the Provider file so the hook
// module doesn't drag the `react/jsx-runtime` import in via the .tsx.

import { createContext } from 'react';

import type { ConfigServiceContextValue } from './types';

export const ConfigServiceContext =
  createContext<ConfigServiceContextValue | null>(null);
