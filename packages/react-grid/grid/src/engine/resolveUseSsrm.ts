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

/** Which surface the host mounts — `'pending'` mounts none at all. */
export type GridSurfaceChoice = 'perspective' | 'pending' | 'ssrm' | 'csrm';

/**
 * Pick the surface, given the row model and whether the worker-held Table has
 * attached yet.
 *
 * The rule that matters is `'pending'`, and it exists because **exactly one
 * grid may mount per `GridPlatform`, ever**. Attaching to the Table is async,
 * so `rowModel: 'perspective'` used to fall through to the CSRM surface for
 * the first few hundred milliseconds. That stand-in grid fired `onGridReady`
 * (attaching the api and activating every module) and then unmounted when the
 * Table arrived — and its `onGridPreDestroyed` called `platform.destroy()`,
 * which is permanent. The real grid's `onGridReady` then landed on a destroyed
 * platform, where `GridPlatform.onGridReady` returns immediately.
 *
 * The result was a grid that looked healthy — grouping, sorting, the context
 * menu and density all talk to AG Grid directly — while every platform-driven
 * feature was silently dead: the formatting toolbar, the auto-formatter, the
 * saved-filter "+" button, and profile save/restore.
 *
 * `null` vs `undefined` carries the distinction: `usePerspectiveTable` returns
 * `null` while attaching, and `undefined` means the caller is not using this
 * seam at all.
 */
export function resolveGridSurface(opts: {
  rowModel?: MarketsGridRowModel;
  useSSRM?: boolean;
  /** `null` = attaching; `undefined` = not using the Perspective seam. */
  perspectiveTable?: unknown;
}): GridSurfaceChoice {
  if (resolvePerspective({ rowModel: opts.rowModel })) {
    if (opts.perspectiveTable) return 'perspective';
    if (opts.perspectiveTable === null) return 'pending';
  }
  return resolveUseSsrm({ useSSRM: opts.useSSRM, rowModel: opts.rowModel })
    ? 'ssrm'
    : 'csrm';
}
