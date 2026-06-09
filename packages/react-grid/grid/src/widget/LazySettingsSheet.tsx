import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  type ForwardedRef,
  type ReactElement,
} from 'react';
import type { SettingsSheetHandle, SettingsSheetProps } from './SettingsSheet';

const LazySettingsSheetInner = lazy(async () => {
  const mod = await import('./SettingsSheet');
  return { default: mod.SettingsSheet };
});

export type LazySettingsSheetProps = SettingsSheetProps;

/**
 * Lazy-loaded settings sheet — defers ~475 LOC of JSX plus
 * `grid-chrome.css` until the user first opens settings.
 */
export const LazySettingsSheet = forwardRef<SettingsSheetHandle, LazySettingsSheetProps>(
  function LazySettingsSheet(props, ref) {
    const { open } = props;

    // Preload on idle when settings button is visible so first open is fast.
    useEffect(() => {
      if (open) return;
      if (typeof requestIdleCallback === 'function') {
        const id = requestIdleCallback(() => { void import('./SettingsSheet'); });
        return () => cancelIdleCallback(id);
      }
      const t = setTimeout(() => { void import('./SettingsSheet'); }, 2000);
      return () => clearTimeout(t);
    }, [open]);

    return (
      <Suspense fallback={null}>
        <LazySettingsSheetInner ref={ref} {...props} />
      </Suspense>
    );
  },
) as (props: LazySettingsSheetProps & { ref?: ForwardedRef<SettingsSheetHandle> }) => ReactElement;
