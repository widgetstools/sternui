import { createContext, useContext, type ReactNode } from 'react';
import type { GridPlatform } from '@wellsfargo-starui/engine';
import type { GridEngineKind } from '../../engine/types.js';

interface GridContextValue {
  platform: GridPlatform;
  engineKind: GridEngineKind;
}

const Ctx = createContext<GridContextValue | null>(null);

export function GridProvider({
  platform,
  engineKind = 'csrm',
  children,
}: {
  platform: GridPlatform;
  engineKind?: GridEngineKind;
  children: ReactNode;
}) {
  return (
    <Ctx.Provider value={{ platform, engineKind }}>
      {children}
    </Ctx.Provider>
  );
}

/** Access the active `GridPlatform`. Panels + hooks go through this. */
export function useGridPlatform(): GridPlatform {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGridPlatform() must be used inside <GridProvider>');
  return ctx.platform;
}

/** `'ssrm'` when MarketsGrid runs with `useSSRM`; otherwise `'csrm'`. */
export function useGridEngineKind(): GridEngineKind {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGridEngineKind() must be used inside <GridProvider>');
  return ctx.engineKind;
}

/**
 * Variant that returns `null` instead of throwing when no provider is present.
 * Use for optional widgets that may render outside the grid (e.g. toolbar
 * decorations rendered by host shells before the grid mounts).
 */
export function useOptionalGridPlatform(): GridPlatform | null {
  return useContext(Ctx)?.platform ?? null;
}
