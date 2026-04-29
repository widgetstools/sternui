import { useEffect } from 'react';

/**
 * Show the browser's "are you sure?" prompt when the user tries to
 * close / reload the tab while their active profile has unsaved edits.
 *
 * The `returnValue` string is ignored by every modern browser (they show
 * a generic message) but it's required for the prompt to appear at all.
 *
 * Extracted verbatim from `MarketsGrid.Host` during Phase C-3.
 */
export function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
