import type { AppConfigRow } from '@starui/shared-types';

/**
 * Thrown by storage when a conditional update's `expectedUpdatedTime`
 * doesn't match the row's current `updatedTime` (Decision 12.5 /
 * Session 6). Routes catch this and return HTTP 412 Precondition Failed
 * with the current row in the body.
 */
export class OptimisticLockMismatchError extends Error {
  constructor(public readonly currentRow: AppConfigRow) {
    super(
      `Configuration ${currentRow.configId} was modified concurrently ` +
        `(expected updatedTime did not match current ${currentRow.updatedTime}).`,
    );
    this.name = 'OptimisticLockMismatchError';
  }
}
