/**
 * Resolve which row engine MarketsGrid should mount.
 *
 * Three exist now:
 *   - `client`      — CSRM, the whole book in this window
 *   - `server`      — CustomSSRMGrid, main-thread RowMirror
 *   - `perspective` — a Table held once in a worker; this window reads only
 *                     the blocks its viewport asks for
 *
 * `useSSRM` is the older boolean form and still wins when both are set, so
 * existing call sites keep their behaviour. It cannot express `perspective`,
 * which is only reachable through `rowModel`.
 */

export type MarketsGridRowModel = 'client' | 'server' | 'perspective';

export function resolveUseSsrm(opts: {
  useSSRM?: boolean;
  rowModel?: MarketsGridRowModel;
}): boolean {
  if (opts.useSSRM !== undefined) return Boolean(opts.useSSRM);
  return opts.rowModel === 'server';
}

/** True when MarketsGrid should mount the Perspective surface. */
export function resolvePerspective(opts: {
  useSSRM?: boolean;
  rowModel?: MarketsGridRowModel;
}): boolean {
  // `useSSRM` is about the CustomSSRMGrid engine and says nothing about this
  // one, so it must not veto an explicit `rowModel: 'perspective'`.
  return opts.rowModel === 'perspective';
}
