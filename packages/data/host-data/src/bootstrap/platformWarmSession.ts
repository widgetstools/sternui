const PLATFORM_WARM_PREFIX = 'starui:platform-warm:';

/** Record that a full platform bootstrap completed for this deployment. */
export function markPlatformWarm(appId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${PLATFORM_WARM_PREFIX}${appId}`, '1');
  } catch {
    /* quota / private mode */
  }
}

/** True when a prior window in this session already ran full bootstrap. */
export function isPlatformWarm(appId: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(`${PLATFORM_WARM_PREFIX}${appId}`) === '1';
  } catch {
    return false;
  }
}

/** Clear warm marker when the SharedWorker is unreachable (worker restart). */
export function clearPlatformWarm(appId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(`${PLATFORM_WARM_PREFIX}${appId}`);
  } catch {
    /* ignore */
  }
}

/** Test-only — clears all warm markers. */
export function _resetPlatformWarmSessionForTests(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PLATFORM_WARM_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}
