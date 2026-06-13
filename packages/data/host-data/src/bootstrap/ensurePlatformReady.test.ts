import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_PLATFORM_BOOTSTRAP,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import {
  _resetEnsurePlatformReadyForTests,
  ensureConfigReady,
  ensurePlatformReady,
} from './ensurePlatformReady.js';
import { isSeedIdentityCached } from '@starui/host-config';
import { _resetEnsureDataServicesHubForTests } from '../hub/ensureDataServicesHub.js';
import { isPlatformWarm, markPlatformWarm } from './platformWarmSession.js';
import { runAppDataBootstrap } from './appDataBootstrap.js';

vi.mock('./appDataBootstrap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./appDataBootstrap.js')>();
  return {
    ...actual,
    runAppDataBootstrap: vi.fn((...args: unknown[]) => actual.runAppDataBootstrap(...args)),
  };
});

const createConfigManagerMock = vi.fn();
const ensureDataServicesHubMock = vi.fn();

vi.mock('@starui/host-config', () => ({
  createConfigManager: (...args: unknown[]) => createConfigManagerMock(...args),
  isSeedIdentityCached: vi.fn(() => false),
}));

vi.mock('../hub/ensureDataServicesHub.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hub/ensureDataServicesHub.js')>();
  return {
    ...actual,
    ensureDataServicesHub: (...args: unknown[]) => ensureDataServicesHubMock(...args),
    // jsdom has no SharedWorker — warm-up must stay a no-op in tests.
    warmHubConnection: vi.fn(),
  };
});

describe('ensurePlatformReady', () => {
  beforeEach(() => {
    vi.mocked(isSeedIdentityCached).mockReturnValue(false);
    createConfigManagerMock.mockImplementation((opts: unknown) => ({
      _opts: opts,
      init: vi.fn().mockResolvedValue(undefined),
      onConfigChanged: vi.fn(() => () => {}),
    }));
    ensureDataServicesHubMock.mockImplementation(() =>
      Promise.resolve({
        client: {
          stop: vi.fn(),
          invalidateConfig: vi.fn().mockResolvedValue(undefined),
        },
        appData: {},
        configManager: {},
        ready: Promise.resolve(),
        dispose: vi.fn(),
        getProvider: vi.fn(),
        stopProvider: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    _resetEnsurePlatformReadyForTests();
    _resetEnsureDataServicesHubForTests();
    vi.clearAllMocks();
  });

  it('connects the data hub without opening a main-thread ConfigManager', async () => {
    const bundle = await ensurePlatformReady(DEV_PLATFORM_BOOTSTRAP, {
      workerScriptUrl: '/worker.mjs',
    });

    expect(createConfigManagerMock).not.toHaveBeenCalled();
    expect(ensureDataServicesHubMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'TestApp',
        userId: 'dev1',
        workerScriptUrl: '/worker.mjs',
      }),
    );
    expect(ensureDataServicesHubMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ mainThreadConfigManager: expect.anything() }),
    );
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
    expect(createConfigManagerMock).not.toHaveBeenCalled();
    expect(ensureDataServicesHubMock).toHaveBeenCalledTimes(1);
  });

  it('passes REST URL to the hub worker bootstrap payload', async () => {
    await ensurePlatformReady(
      {
        appId: 'RestApp',
        userId: 'dev1',
        useRest: true,
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      },
      { workerScriptUrl: '/worker.mjs' },
    );

    expect(createConfigManagerMock).not.toHaveBeenCalled();
    expect(ensureDataServicesHubMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'RestApp',
        useRest: true,
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

  it('does not consult seed identity or platform warm state (worker owns config)', async () => {
    vi.mocked(isSeedIdentityCached).mockReturnValue(true);
    markPlatformWarm('TestApp');

    await ensurePlatformReady(
      { ...DEV_PLATFORM_BOOTSTRAP, seedConfigUrl: '/seed.json' },
      { workerScriptUrl: '/worker.mjs' },
    );

    expect(createConfigManagerMock).not.toHaveBeenCalled();
    expect(ensureDataServicesHubMock).toHaveBeenCalledTimes(1);
  });

  it('marks the platform warm after full bootstrap completes', async () => {
    expect(isPlatformWarm('TestApp')).toBe(false);
    await ensurePlatformReady(DEV_PLATFORM_BOOTSTRAP, { workerScriptUrl: '/worker.mjs' });
    expect(isPlatformWarm('TestApp')).toBe(true);
  });

  it('runs appDataBootstrap hooks when manifest and registry are supplied', async () => {
    const hooks = { 'session-context': vi.fn() };
    await ensurePlatformReady(
      {
        ...DEV_PLATFORM_BOOTSTRAP,
        appDataBootstrap: { onHubReady: ['session-context'], runPolicy: 'always' },
      },
      { workerScriptUrl: '/worker.mjs', appDataBootstrapHooks: hooks },
    );

    expect(runAppDataBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({ onHubReady: ['session-context'] }),
        registry: hooks,
        appId: 'TestApp',
        userId: 'dev1',
      }),
    );
  });
});

describe('ensureConfigReady', () => {
  beforeEach(() => {
    vi.mocked(isSeedIdentityCached).mockReturnValue(false);
    createConfigManagerMock.mockImplementation((opts: unknown) => ({
      _opts: opts,
      init: vi.fn().mockResolvedValue(undefined),
      onConfigChanged: vi.fn(() => () => {}),
    }));
    ensureDataServicesHubMock.mockImplementation(() =>
      Promise.resolve({
        client: { stop: vi.fn(), invalidateConfig: vi.fn().mockResolvedValue(undefined) },
        appData: {},
        configManager: {},
        ready: Promise.resolve(),
        dispose: vi.fn(),
        getProvider: vi.fn(),
        stopProvider: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    _resetEnsurePlatformReadyForTests();
    _resetEnsureDataServicesHubForTests();
    vi.clearAllMocks();
  });

  it('inits a ConfigManager without touching the hub', async () => {
    const { configManager } = await ensureConfigReady(DEV_PLATFORM_BOOTSTRAP);

    expect(configManager).toBeDefined();
    expect(createConfigManagerMock).toHaveBeenCalledTimes(1);
    expect(ensureDataServicesHubMock).not.toHaveBeenCalled();
  });

  it('does not pass config-only ConfigManager into full platform bootstrap', async () => {
    await ensureConfigReady(DEV_PLATFORM_BOOTSTRAP);
    await ensurePlatformReady(DEV_PLATFORM_BOOTSTRAP, { workerScriptUrl: '/worker.mjs' });

    expect(createConfigManagerMock).toHaveBeenCalledTimes(1);
    expect(ensureDataServicesHubMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ mainThreadConfigManager: expect.anything() }),
    );
  });

  it('throws PlatformBootstrapConfigError for invalid config', async () => {
    await expect(
      ensureConfigReady({ appId: '', userId: 'dev1' }),
    ).rejects.toBeInstanceOf(PlatformBootstrapConfigError);
  });
});
