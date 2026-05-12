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
   * provider operates under. Optional so producers (e.g. demo apps
   * that build a HostEnv manually for `encodeHostEnvForQueryString`)
   * don't have to know about the field — `readHostEnv()` always
   * resolves it to a string (empty when the parent didn't forward it).
   */
  userId?: string;
  configServiceUrl: string;
}

/**
 * Canonical user id. Single-user-pinned everywhere — see
 * `LOGGED_IN_USER_ID` in `@starui/runtime-port` (this constant must
 * match it, kept as a literal here to avoid pulling runtime-port into
 * openfin-platform's dep graph). The codebase intentionally does NOT
 * auto-generate user ids ("dev-user-001"-style randoms) and
 * customData / URL `userId` overrides are ignored at every resolution
 * site so persistence always lands under the same `(appId, userId)`
 * scope. Replace this literal the day SSO is wired in.
 */
export const DEFAULT_USER_ID = 'dev1';

/**
 * Canonical app id. Single-app-pinned alongside `DEFAULT_USER_ID` so
 * every persistence site lands under the same `(appId, userId)` scope.
 * customData / URL `appId` overrides are ignored at every resolution
 * site for the same reason userId overrides are: cross-machine imports
 * and legacy rows otherwise diverge the appId between the runtime
 * caller and the realign sweep, breaking the strict-equality ownership
 * check in `isLayoutSetRow`. Replace this literal when multi-app
 * support actually lands (until then, treating it as a constant
 * eliminates a whole class of "row exists but invisible" bugs).
 */
export const DEFAULT_APP_ID = 'TestApp';

const DEV_FALLBACK: HostEnv = {
  appId: DEFAULT_APP_ID,
  userId: DEFAULT_USER_ID,
  configServiceUrl: 'http://localhost:0000',
};

/**
 * Read `customData.{appId, configServiceUrl}` from the OpenFin window
 * that hosts the editor. Falls back to dev defaults out of OpenFin.
 *
 * NEVER throws — the editor's job is to render even in degraded envs.
 * If host env is genuinely missing in OpenFin, the returned object
 * carries empty strings (for appId / configServiceUrl) and `DEFAULT_USER_ID`
 * for userId, and the editor's UI can detect + surface the missing
 * appId/url case via `isHostEnvMissing()`.
 *
 * Resolution priority:
 *   1. OpenFin `fin.me.customData.{appId, configServiceUrl}` — real
 *      launches inside a workspace window. Empty / missing `userId`
 *      falls through to `DEFAULT_USER_ID` so we never persist rows
 *      under an empty-string userId.
 *   2. URL query param `?hostEnv=<base64(json)>` — used by popups spawned
 *      from non-OpenFin demo apps that need to pass host identity
 *      without a framework. Same userId fallback as path (1).
 *   3. DEV_FALLBACK — only applies when nothing else is available.
 */
export async function readHostEnv(): Promise<HostEnv> {
  // 1. OpenFin — customData wins for configServiceUrl. appId / userId
  //    are pinned to DEFAULT_APP_ID / DEFAULT_USER_ID; customData
  //    overrides for those two are intentionally ignored.
  if (typeof fin !== 'undefined') {
    try {
      const opts = await fin.me.getOptions();
      const cd = opts?.customData;
      const configServiceUrl = typeof cd?.configServiceUrl === 'string' ? cd.configServiceUrl : '';
      return { appId: DEFAULT_APP_ID, userId: DEFAULT_USER_ID, configServiceUrl };
    } catch {
      return { appId: DEFAULT_APP_ID, userId: DEFAULT_USER_ID, configServiceUrl: '' };
    }
  }

  // 2. Query string override — for standalone-browser popups spawned
  //    by a parent demo/dev app. Shape:
  //      ?hostEnv=<base64(JSON.stringify({ configServiceUrl }))>
  //    appId / userId are pinned and not honoured from the query.
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
    // appId / userId are pinned — decoded values for them are
    // intentionally ignored (same reason as the OpenFin path).
    const configServiceUrl = typeof decoded.configServiceUrl === 'string' ? decoded.configServiceUrl : '';
    if (!configServiceUrl) return null;
    return { appId: DEFAULT_APP_ID, userId: DEFAULT_USER_ID, configServiceUrl };
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
