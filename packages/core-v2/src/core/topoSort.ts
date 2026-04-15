import type { AnyModule } from './types';

/**
 * Order modules so every module appears after all its declared dependencies.
 * Within the same dependency level, modules are stable-sorted by `priority`
 * (lower runs first), then by registration order as a tiebreaker.
 *
 * Throws if:
 *  - a dependency references an unknown module ID
 *  - the graph contains a cycle
 *  - two modules share the same id (caller's responsibility to dedupe — we
 *    only check here as a defensive last line)
 */
export function topoSortModules(modules: readonly AnyModule[]): AnyModule[] {
  const byId = new Map<string, AnyModule>();
  for (const m of modules) {
    if (byId.has(m.id)) {
      throw new Error(`[core-v2] Duplicate module id: "${m.id}"`);
    }
    byId.set(m.id, m);
  }

  // Validate dependencies exist before doing anything else — clearer error
  // than letting the topo loop fail on a missing key later.
  for (const m of modules) {
    for (const dep of m.dependencies ?? []) {
      if (!byId.has(dep)) {
        throw new Error(
          `[core-v2] Module "${m.id}" depends on unknown module "${dep}"`,
        );
      }
    }
  }

  // Kahn's algorithm. `inDegree` = unresolved-dep count.
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // depId -> ids that depend on it
  for (const m of modules) {
    inDegree.set(m.id, m.dependencies?.length ?? 0);
    for (const dep of m.dependencies ?? []) {
      const list = dependents.get(dep);
      if (list) list.push(m.id);
      else dependents.set(dep, [m.id]);
    }
  }

  // Stable starting set: all zero-deg modules in original registration order.
  const ready: AnyModule[] = modules.filter((m) => (inDegree.get(m.id) ?? 0) === 0);
  const result: AnyModule[] = [];

  while (ready.length > 0) {
    // Sort the ready frontier by priority (lower first), preserving relative
    // registration order for ties via a stable sort.
    ready.sort((a, b) => a.priority - b.priority);
    const next = ready.shift()!;
    result.push(next);

    for (const depId of dependents.get(next.id) ?? []) {
      const remaining = (inDegree.get(depId) ?? 0) - 1;
      inDegree.set(depId, remaining);
      if (remaining === 0) {
        const m = byId.get(depId);
        if (m) ready.push(m);
      }
    }
  }

  if (result.length !== modules.length) {
    const unresolved = modules.filter((m) => !result.includes(m)).map((m) => m.id);
    throw new Error(
      `[core-v2] Cyclic module dependencies detected. Involved modules: ${unresolved.join(', ')}`,
    );
  }

  return result;
}
