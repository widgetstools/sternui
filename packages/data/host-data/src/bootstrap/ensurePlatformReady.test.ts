import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_PLATFORM_BOOTSTRAP,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import {
  _resetEnsurePlatformReadyForTests,
  ensurePlatformReady,
} from './ensurePlatformReady.js';
import { isSeedIdentityCached } from '@starui/host-config';
import { _resetEnsureDataServicesHubForTests } from '../hub/ensureDataServicesHub.js';
import { runAppDataBootstrap } from './appDataBootstrap.js';
import { markPlatformWarm } from './platformWarmSession.js';

vi.mock('./appDataBootstrap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./appDataBootstrap.js')>();
  return {
    ...actual,
    runAppDataBootstrap: vi.fn((...args: unknown[]) => actual.runAppDataBootstrap(...args)),
  };
});

const createConfigManagerMock = vi.fn();
const ensureDataServicesHubMock = vi.fn();
const probeWorkerHubReadyMock = vi.fn();

vi.mock('@starui/host-config', () => ({
  createConfigManager: (...args: unknown[]) => createConfigManagerMock(...args),
  isSeedIdentityCached: vi.fn(() => false),
}));

vi.mock('../hub/probeWorkerHub.js', () => ({
  probeWorkerHubReady: (...args: unknown[]) => probeWorkerHubReadyMock(...args),
}));

vi.mock('../hub/ensureDataServicesHub.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hub/ensureDataServicesHub.js')>();
  return {
    ...actual,
    ensureDataServicesHub: (...args: unknown[]) => ensureDataServicesHubMock(...args),
  };
});

describe('ensurePlatformReady', () => {
  beforeEach(() => {
    vi.mocked(isSeedIdentityCached).mockReturnValue(false);
    probeWorkerHubReadyMock.mockResolvedValue(false);
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
    expect(ensureDataServicesHubMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'TestApp',
        userId: 'dev1',
        workerScriptUrl: '/worker.mjs',
        mainThreadConfigManager: expect.objectContaining({ _opts: expect.any(Object) }),
      }),
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
    expect(createConfigManagerMock).toHaveBeenCalledTimes(1);
    expect(ensureDataServicesHubMock).toHaveBeenCalledTimes(1);
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

  it('uses attach bootstrap when platform is warm and worker catalog is ready', async () => {
    vi.mocked(isSeedIdentityCached).mockReturnValue(true);
    probeWorkerHubReadyMock.mockResolvedValue(true);
    markPlatformWarm('TestApp');

    const initMock = vi.fn().mockResolvedValue(undefined);
    createConfigManagerMock.mockImplementation((opts: unknown) => ({
      _opts: opts,
      init: initMock,
      onConfigChanged: vi.fn(() => () => {}),
    }));

    await ensurePlatformReady(
      { ...DEV_PLATFORM_BOOTSTRAP, seedConfigUrl: '/seed.json' },
      { workerScriptUrl: '/worker.mjs' },
    );

    expect(createConfigManagerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        seedConfigUrl: undefined,
        seedConfigReload: undefined,
      }),
    );
    expect(initMock).toHaveBeenCalledWith({ mode: 'attach' });
    expect(probeWorkerHubReadyMock).toHaveBeenCalled();
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
