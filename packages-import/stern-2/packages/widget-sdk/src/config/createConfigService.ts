import type { ConfigService } from '@stern/shared-types';
import { IndexedDBConfigService } from './IndexedDBConfigService.js';
import { RestConfigService } from './RestConfigService.js';

export interface CreateConfigServiceOptions {
  mode: 'indexeddb' | 'rest';
  appId: string;
  userId: string;
  /** IndexedDB only — database name (default: 'marketsui') */
  dbName?: string;
  /** REST only — base URL e.g. 'http://localhost:3001/api/v1' */
  baseUrl?: string;
}

export function createConfigService(opts: CreateConfigServiceOptions): ConfigService {
  if (opts.mode === 'rest') {
    if (!opts.baseUrl) throw new Error('createConfigService: baseUrl required for rest mode');
    return new RestConfigService(opts.baseUrl, opts.appId, opts.userId);
  }
  return new IndexedDBConfigService(opts.appId, opts.userId, opts.dbName ?? 'marketsui');
}
