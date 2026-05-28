import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_PLATFORM_BOOTSTRAP,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import {
  _resetEnsurePlatformReadyForTests,
  ensurePlatformReady,
} from './ensurePlatformReady.js';
import { _resetEnsureDataServicesHubForTests } from '../hub/ensureDataServicesHub.js';

const createConfigManagerMock = vi.fn();
const bootstrapWithWorkerAssetMock = vi.fn();

vi.mock('@starui/host-config', () => ({
  createConfigManager: (...args: unknown[]) => createConfigManagerMock(...args),
}));

vi.mock('../runtime/bootstrap/bootstrapWithWorkerAsset.js', () => ({
  bootstrapDataServicesWithWorkerAsset: (...args: unknown[]) =>
    bootstrapWithWorkerAssetMock(...args),
}));

describe('ensurePlatformReady', () => {
  beforeEach(() => {
    createConfigManagerMock.mockImplementation((opts: unknown) => ({
      _opts: opts,
      init: vi.fn().mockResolvedValue(undefined),
    }));
    bootstrapWithWorkerAssetMock.mockImplementation(() => ({
      client: { stop: vi.fn() },
      appData: {},
      configManager: {},
      ready: Promise.resolve(),
      dispose: vi.fn(),
    }));
  });

  afterEach(() => {
    _resetEnsurePlatformReadyForTests();
    _resetEnsureDataServicesHubForTests();
    vi.clearAllMocks();
  });

  it('creates ConfigManager with appId and userId then bootstraps hub', async () => {
    const bundle = await ensurePlatformReady(DEV_PLATFORM_BOOTSTRAP, {
      workerScriptUrl: '/worker.mjs',
    });

    expect(createConfigManagerMock).toHaveBeenCalledWith({
      appId: 'TestApp',
      identity: { userId: 'dev1', displayName: 'dev1' },
      configServiceRestUrl: undefined,
      seedConfigUrl: undefined,
    });
    expect(bootstrapWithWorkerAssetMock).toHaveBeenCalledWith('/worker.mjs', {
      appName: 'TestApp',
      userId: 'dev1',
      configServiceRestUrl: undefined,
      mainThreadConfigManager: expect.objectContaining({ _opts: expect.any(Object) }),
    });
    expect(bundle.ready).toBeInstanceOf(Promise);
  });

  it('returns the same bundle on double call for the same appId', async () => {
    const first = await ensurePlatformReady(DEV_PLATFORM_BOOTSTRAP, {
      workerScriptUrl: '/worker.mjs',
    });
    const second = await ensurePlatformReady(DEV_PLATFORM_BOOTSTRAP, {
      workerScriptUrl: '/worker.mjs',
    });

    expect(second).toBe(first);
    expect(createConfigManagerMock).toHaveBeenCalledTimes(1);
    expect(bootstrapWithWorkerAssetMock).toHaveBeenCalledTimes(1);
  });

  it('passes REST URL when useRest is true', async () => {
    await ensurePlatformReady(
      {
        appId: 'RestApp',
        userId: 'dev1',
        useRest: true,
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      },
      { workerScriptUrl: '/worker.mjs' },
    );

    expect(createConfigManagerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      }),
    );
    expect(bootstrapWithWorkerAssetMock).toHaveBeenCalledWith(
      '/worker.mjs',
      expect.objectContaining({
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      }),
    );
  });

  it('throws PlatformBootstrapConfigError for invalid config', async () => {
    await expect(
      ensurePlatformReady({ appId: '', userId: 'dev1' }, { workerScriptUrl: '/w.mjs' }),
    ).rejects.toBeInstanceOf(PlatformBootstrapConfigError);
    expect(createConfigManagerMock).not.toHaveBeenCalled();
  });
});
