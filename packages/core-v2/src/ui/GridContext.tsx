import { createContext, useContext, type ReactNode } from 'react';
import type { GridCore } from '../core/GridCore';
import type { GridStore } from '../store/createGridStore';

/**
 * Context that lets v2 module SettingsPanel components reach the live grid
 * store + core without prop-drilling through the SettingsSheet.
 *
 * Mirrors v1's `GridCustomizerContext` but is built on v2 types — the v2
 * SettingsPanel API (`{ gridId }: SettingsPanelProps`) intentionally hides
 * the store/core, so panels grab them via these hooks at render time.
 */
interface GridContextValue {
  store: GridStore;
  core: GridCore;
}

const Ctx = createContext<GridContextValue | null>(null);

export function GridProvider({
  store,
  core,
  children,
}: GridContextValue & { children: ReactNode }) {
  return <Ctx.Provider value={{ store, core }}>{children}</Ctx.Provider>;
}

export function useGridStore(): GridStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGridStore must be used within <GridProvider>');
  return ctx.store;
}

export function useGridCore(): GridCore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGridCore must be used within <GridProvider>');
  return ctx.core;
}
