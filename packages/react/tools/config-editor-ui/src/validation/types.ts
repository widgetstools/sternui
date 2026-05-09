/**
 * Shared validation primitives for the four list editors. Validators
 * are pure: they take the candidate row (and any cross-table rows they
 * need) and return a list of `ValidationError`s. The drawer save flow
 * blocks when any error has `severity: 'error'`; warnings are surfaced
 * but allow the save (or delete) to proceed — see Decision 12.4 in
 * `config-manager-redesign.md`.
 */

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationError {
  /** Stable identifier — handy for tests and for surfacing per-field hints. */
  code: string;
  /** Human-readable description shown in the drawer / confirm dialog. */
  message: string;
  /** Field name when the error is bound to a single input. */
  field?: string;
  /** Defaults to `'error'`. Warnings inform but do not block. */
  severity?: ValidationSeverity;
}

/** True when at least one entry blocks the action. */
export function hasBlockingError(errors: readonly ValidationError[]): boolean {
  return errors.some((e) => (e.severity ?? 'error') === 'error');
}

/** Concatenate error messages on separate lines for drawer surfaces. */
export function formatErrors(errors: readonly ValidationError[]): string {
  return errors.map((e) => e.message).join('\n');
}
