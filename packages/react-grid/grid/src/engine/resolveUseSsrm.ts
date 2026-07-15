/**
 * Resolve whether MarketsGrid should use the SSRM engine.
 * `useSSRM` wins when both it and `rowModel` are set.
 */

export type MarketsGridRowModel = 'client' | 'server';

export function resolveUseSsrm(opts: {
  useSSRM?: boolean;
  rowModel?: MarketsGridRowModel;
}): boolean {
  if (opts.useSSRM !== undefined) return Boolean(opts.useSSRM);
  return opts.rowModel === 'server';
}
