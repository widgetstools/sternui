/**
 * Registry editor — read the host app's launch env from OpenFin
 * `customData`. Used to pre-fill the `appId` + `configServiceUrl`
 * fields on new registry entries and to lock them when
 * `usesHostConfig === true`.
 *
 * Dev-mode fallback: when `fin` is undefined (vite browser tab,
 * storybook, tests), returns sensible defaults so the editor can
 * still boot without crashing. In that case validations that depend
 * on hostEnv equality may be too lenient — that's the expected
 * trade-off for being able to develop the editor out of OpenFin.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

export interface HostEnv {
  appId: string;
  configServiceUrl: string;
}

const DEV_FALLBACK: HostEnv = {
  appId: 'dev-host',
  configServiceUrl: 'http://localhost:0000',
};

/**
 * Read `customData.{appId, configServiceUrl}` from the OpenFin window
 * that hosts the editor. Falls back to dev defaults out of OpenFin.
 *
 * NEVER throws — the editor's job is to render even in degraded envs.
 * If host env is genuinely missing in OpenFin, the returned object
 * carries empty strings and the editor's UI can detect + surface that
 * case via `isHostEnvMissing()`.
 */
export async function readHostEnv(): Promise<HostEnv> {
  if (typeof fin === 'undefined') return DEV_FALLBACK;

  try {
    const opts = await fin.me.getOptions();
    const cd = opts?.customData;
    const appId = typeof cd?.appId === 'string' ? cd.appId : '';
    const configServiceUrl = typeof cd?.configServiceUrl === 'string' ? cd.configServiceUrl : '';
    return { appId, configServiceUrl };
  } catch {
    return { appId: '', configServiceUrl: '' };
  }
}

/** True when readHostEnv returned empty fields inside a real OpenFin
 *  context — the editor should surface a "host manifest not configured"
 *  warning banner when this is true. */
export function isHostEnvMissing(env: HostEnv): boolean {
  return !env.appId || !env.configServiceUrl;
}
