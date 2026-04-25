/**
 * React context wiring for `@marketsui/data-plane`.
 *
 * Consumers mount a `<DataPlaneProvider client={...}>` once near the
 * top of the app, then everything below can use the hooks without
 * passing the client around explicitly. The provider accepts either
 * a pre-built `DataPlaneClient` or the full `connect()` arguments —
 * if arguments are passed, the provider constructs the client on
 * mount and tears it down on unmount, matching React's ownership
 * story.
 *
 * Why not a singleton hook? Because tests + demos want to construct
 * their own clients (often with `connectInPage(router)`). A context
 * keeps that flexible without changing any consumer code.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  DataPlaneClient,
  connect,
  type ConnectOpts,
  type ConnectedClient,
} from '@marketsui/data-plane/client';

interface ContextValue {
  client: DataPlaneClient;
}

const DataPlaneContext = createContext<ContextValue | null>(null);

export interface DataPlaneProviderProps {
  children: ReactNode;
  /**
   * Use an externally-owned client. Lifetime is the caller's
   * responsibility — the provider won't call `close()` on it.
   */
  client?: DataPlaneClient;
  /**
   * If `client` is not provided, these args are passed to `connect()`
   * to build one. The resulting client is owned by the provider and
   * torn down on unmount.
   */
  connect?: ConnectOpts;
}

export function DataPlaneProvider({ children, client, connect: connectArgs }: DataPlaneProviderProps) {
  const ownedRef = useRef<ConnectedClient | null>(null);

  const value = useMemo<ContextValue | null>(() => {
    if (client) return { client };
    if (connectArgs) {
      if (!ownedRef.current) ownedRef.current = connect(connectArgs);
      return { client: ownedRef.current.client };
    }
    return null;
  }, [client, connectArgs]);

  useEffect(() => {
    return () => {
      if (ownedRef.current) {
        ownedRef.current.close();
        ownedRef.current = null;
      }
    };
  }, []);

  if (!value) {
    throw new Error(
      '<DataPlaneProvider> requires either a `client` or `connect` prop',
    );
  }

  return <DataPlaneContext.Provider value={value}>{children}</DataPlaneContext.Provider>;
}

/**
 * Accesses the ambient DataPlaneClient. Throws if no provider is
 * mounted above (the alternative — returning null — would force every
 * consumer to null-check and typically indicates a mount-order bug
 * the developer would rather see immediately).
 */
export function useDataPlaneClient(): DataPlaneClient {
  const ctx = useContext(DataPlaneContext);
  if (!ctx) {
    throw new Error(
      'useDataPlaneClient() must be called inside <DataPlaneProvider>',
    );
  }
  return ctx.client;
}
