import { OptimisticLockError } from '@starui/config-service';

/**
 * Tiny adapter that wraps an auth-table update to enforce optimistic
 * locking on the client side (Decision 12.5).
 *
 * The four auth-table CRUD shapes — `apps.update`, `userProfiles.update`,
 * `roles.update`, `permissions.update` — don't take an
 * `expectedUpdatedTime` option today (only `updateConfig` does). Until
 * that lands the editor compares the row's `updatedTime` field against
 * the value captured at edit-start; on divergence the editor throws
 * `EditorOptimisticLockError` so the drawer's catch path stays uniform
 * with the upstream `OptimisticLockError` from configurations.
 */

/** Local mirror of `OptimisticLockError` for the auth-table row shapes. */
export class EditorOptimisticLockError<TRow> extends Error {
  constructor(public readonly currentRow: TRow | undefined) {
    super('Row changed since edit began');
    this.name = 'EditorOptimisticLockError';
  }
}

/** True when `e` is either the upstream or the editor-local lock error. */
export function isOptimisticLockError(e: unknown): boolean {
  return (
    e instanceof EditorOptimisticLockError || e instanceof OptimisticLockError
  );
}

export interface OptimisticGuardOptions<TRow extends { updatedTime?: string }> {
  expectedUpdatedTime: string | undefined;
  fetchCurrent: () => Promise<TRow | undefined>;
}

export async function guardOptimisticUpdate<
  TRow extends { updatedTime?: string },
>(options: OptimisticGuardOptions<TRow>): Promise<void> {
  if (options.expectedUpdatedTime === undefined) return;
  const current = await options.fetchCurrent();
  if (!current) return;
  if ((current.updatedTime ?? undefined) === options.expectedUpdatedTime) return;
  throw new EditorOptimisticLockError<TRow>(current);
}
