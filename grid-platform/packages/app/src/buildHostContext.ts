import { MemoryAdapter, type StorageAdapter } from '@stargrid/engine';
import {
  createGridHostContext,
  type ConfigPort,
  type DataPort,
  type GridHostContext,
  type RuntimePort,
  type StoragePort,
} from '@stargrid/host';
import { createConfigPort } from '@stargrid/host-config';
import {
  createMarketsGridLocalStorageStorage,
  type StorageAdapterFactory,
} from '@stargrid/grid';
import type { StarGridHostScope } from './types.js';

function adapterAsStoragePort(adapter: StorageAdapter): StoragePort {
  return adapter as unknown as StoragePort;
}

export function storageFactoryForPersistence(
  persistence: 'memory' | 'localStorage' | 'config',
  configStorageFactory?: StorageAdapterFactory,
): StorageAdapterFactory {
  if (persistence === 'config') {
    if (!configStorageFactory) {
      throw new Error(
        '[StarGridApp] persistence="config" requires an initialized ConfigManager ' +
          'via createConfigServiceStorage().',
      );
    }
    return configStorageFactory;
  }
  if (persistence === 'localStorage') {
    return createMarketsGridLocalStorageStorage();
  }
  return () => new MemoryAdapter();
}

export function buildGridHostContext(
  runtime: RuntimePort,
  storageFactory: StorageAdapterFactory,
  scope: StarGridHostScope,
  opts?: { data?: DataPort; config?: ConfigPort },
): GridHostContext {
  const identity = runtime.resolveIdentity();
  const instanceId = scope.instanceId ?? scope.gridId;
  const storage = adapterAsStoragePort(
    storageFactory({
      gridId: scope.gridId,
      instanceId,
      appId: identity.appId,
      userId: identity.userId,
    }),
  );
  return createGridHostContext({
    runtime,
    storage,
    ...(opts?.data !== undefined ? { data: opts.data } : {}),
    ...(opts?.config !== undefined ? { config: opts.config } : {}),
  });
}
