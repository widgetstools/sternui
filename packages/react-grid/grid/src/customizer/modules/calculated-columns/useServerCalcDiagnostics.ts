import { useEffect, useState } from 'react';
import type { ServerCalcDiagnostic } from '../../../engine/serverEngineHolder.js';
import { useGridPlatform } from '../../hooks/GridProvider';

/**
 * What a server-side engine made of ONE authored expression, for the author.
 *
 * ## Why the author could not see this until now
 *
 * The planner deliberately holds NO copy of the engine's refusal list. It
 * parses; everything that parses is planned; the ENGINE refuses by name and
 * retains the reason. That decision is right and stands — a second copy of the
 * refusal list in `@starui/grid` is a second thing to keep in step, and this
 * package takes no dependency on the engine packages at all.
 *
 * The recorded COST of it was that an author saw "unsupported" only for a PARSE
 * error. Everything the engine refused — a cross-row `SUM([px])`, `NOW()`, a
 * function outside the set in `calcOps.ts`, a `.old`/`.new` ref — arrived as a
 * blank column and a diagnostic nobody was looking at. `console.warn` in a
 * SharedWorker reaches no console anywhere, so there was nowhere to look.
 *
 * This closes it without duplicating anything: the reasons are read BACK from
 * the engine that produced them, through the `ssrmCalcDiagnostics` seam on the
 * grid context, alongside the two expression seams already there.
 */

/** Only the shape this hook reads. Structural, so it names no engine. */
interface DiagnosticsContext {
  ssrmCalcDiagnostics?(): Promise<ServerCalcDiagnostic[]>;
}

/**
 * Read the engine's diagnostics for one column, refreshed while the editor is
 * open.
 *
 * Polled rather than pushed, and on a slow timer: an expression is republished
 * only when the author stops typing, the engine answers from a retained array
 * rather than by recompiling, and a panel that is closed costs nothing because
 * the effect is not mounted. A push channel would be a new protocol message for
 * a value nobody reads more than a few times per edit.
 *
 * @param colId  the column being edited; undefined clears
 */
export function useServerCalcDiagnostics(
  colId: string | undefined,
  intervalMs = 1_500,
): ServerCalcDiagnostic[] {
  const platform = useGridPlatform();
  const [diagnostics, setDiagnostics] = useState<ServerCalcDiagnostic[]>([]);

  useEffect(() => {
    if (!colId) {
      setDiagnostics([]);
      return;
    }
    let cancelled = false;

    const read = async (): Promise<void> => {
      let context: DiagnosticsContext | undefined;
      try {
        const api = platform.api.api;
        if (!api) return;
        context = api.getGridOption('context') as DiagnosticsContext | undefined;
      } catch {
        // The grid is being torn down. A diagnostics strip must never be the
        // reason an editor throws.
        return;
      }
      // CSRM, or a server engine with no such list — see the seam's doc. Both
      // render nothing, which is not the same claim as "no problems found", and
      // is the only honest one available here.
      if (!context?.ssrmCalcDiagnostics) return;
      try {
        const all = await context.ssrmCalcDiagnostics();
        if (cancelled) return;
        setDiagnostics(all.filter((d) => d.colId === colId));
      } catch {
        /* a failed read leaves the last answer standing */
      }
    };

    void read();
    const timer = setInterval(() => void read(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [platform, colId, intervalMs]);

  return diagnostics;
}
