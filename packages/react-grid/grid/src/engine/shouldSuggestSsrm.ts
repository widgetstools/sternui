/** Pure visibility for the suggest-SSRM banner. */
export function shouldSuggestSsrm(opts: {
  useSSRM: boolean;
  rowCount: number;
  threshold?: number;
  dismissed?: boolean;
}): boolean {
  if (opts.useSSRM) return false;
  if (opts.dismissed) return false;
  if (opts.threshold == null || opts.threshold <= 0) return false;
  return opts.rowCount >= opts.threshold;
}
