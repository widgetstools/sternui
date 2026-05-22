/**
 * Console trace for profile resolution / load / persist.
 *
 * Filter DevTools console with `[profiles:trace]`.
 * Set `localStorage.setItem('starui.profileTrace', '0')` to silence.
 */
const PREFIX = '[profiles:trace]';

export function isProfileTraceEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const v = localStorage.getItem('starui.profileTrace');
    return v !== '0' && v !== 'false';
  } catch {
    return true;
  }
}

export function traceProfile(
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (!isProfileTraceEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    // eslint-disable-next-line no-console
    console.log(PREFIX, phase, detail);
  } else {
    // eslint-disable-next-line no-console
    console.log(PREFIX, phase);
  }
}
