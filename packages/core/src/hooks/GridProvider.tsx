import { createContext, useContext, type ReactNode } from 'react';
import type { GridPlatform } from '../platform/GridPlatform';

const Ctx = createContext<GridPlatform | null>(null);

export function GridProvider({
  platform,
  children,
}: {
  platform: GridPlatform;
  children: ReactNode;
}) {
  return <Ctx.Provider value={platform}>{children}</Ctx.Provider>;
}

/** Access the active `GridPlatform`. Panels + hooks go through this. */
export function useGridPlatform(): GridPlatform {
  const p = useContext(Ctx);
  if (!p) throw new Error('useGridPlatform() must be used inside <GridProvider>');
  return p;
}
