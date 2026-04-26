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
  /**
   * The signed-in user id under which this child window should persist
   * its data. Forwarded by the parent provider via `customData.userId`
   * so child editors save to the same `(appId, userId)` scope the
   * provider operates under. Empty string when the parent didn't
   * forward it (e.g. legacy launchers, dev sandbox).
   */
  userId: string;
  configServiceUrl: string;
}

const DEV_FALLBACK: HostEnv = {
  appId: 'dev-host',
  userId: 'dev-user',
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
 *
 * Resolution priority:
 *   1. OpenFin `fin.me.customData.{appId, configServiceUrl}` — real
 *      launches inside a workspace window
 *   2. URL query param `?hostEnv=<base64(json)>` — used by popups spawned
 *      from non-OpenFin demo apps that need to pass host identity
 *      without a framework
 *   3. DEV_FALLBACK — only applies when nothing else is available
 */
export async function readHostEnv(): Promise<HostEnv> {
  // 1. OpenFin — customData wins
  if (typeof fin !== 'undefined') {
    try {
      const opts = await fin.me.getOptions();
      const cd = opts?.customData;
      const appId = typeof cd?.appId === 'string' ? cd.appId : '';
      const userId = typeof cd?.userId === 'string' ? cd.userId : '';
      const configServiceUrl = typeof cd?.configServiceUrl === 'string' ? cd.configServiceUrl : '';
      return { appId, userId, configServiceUrl };
    } catch {
      return { appId: '', userId: '', configServiceUrl: '' };
    }
  }

  // 2. Query string override — for standalone-browser popups spawned
  //    by a parent demo/dev app. Shape:
  //      ?hostEnv=<base64(JSON.stringify({ appId, configServiceUrl }))>
  //    Base64 keeps the URL tidy and forgiving of special chars.
  const qsEnv = readHostEnvFromQueryString();
  if (qsEnv) return qsEnv;

  // 3. Dev fallback
  return DEV_FALLBACK;
}

function readHostEnvFromQueryString(): HostEnv | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = new URLSearchParams(window.location.search).get('hostEnv');
    if (!raw) return null;
    const decoded = JSON.parse(atob(raw)) as Partial<HostEnv>;
    const appId = typeof decoded.appId === 'string' ? decoded.appId : '';
    const userId = typeof decoded.userId === 'string' ? decoded.userId : '';
    const configServiceUrl = typeof decoded.configServiceUrl === 'string' ? decoded.configServiceUrl : '';
    if (!appId && !userId && !configServiceUrl) return null;
    return { appId, userId, configServiceUrl };
  } catch {
    return null;
  }
}

/**
 * Helper — encode a HostEnv for use as the `?hostEnv=` query-string
 * override. Symmetric with the decoder inside `readHostEnv`.
 */
export function encodeHostEnvForQueryString(env: HostEnv): string {
  return btoa(JSON.stringify(env));
}

/** True when readHostEnv returned empty fields inside a real OpenFin
 *  context — the editor should surface a "host manifest not configured"
 *  warning banner when this is true. */
export function isHostEnvMissing(env: HostEnv): boolean {
  return !env.appId || !env.configServiceUrl;
}
