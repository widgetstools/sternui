import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LabStreamHandle } from './types';

/**
 * No `useSSRM` here, unlike the CSRM lab.
 *
 * That lab carries an engine flag so a tab can remount between the client-side
 * and server-side row models. This app is Perspective end to end — the engine
 * is a property of the app, not of a toggle — so the flag is gone rather than
 * pinned to a constant, and a tab has nothing to read that could put it on the
 * wrong surface. To compare engines, run the CSRM lab beside this one.
 */
interface LabDemoContextValue {
  handle: LabStreamHandle | null;
  register: (next: LabStreamHandle | null) => void;
}

const LabDemoContext = createContext<LabDemoContextValue | null>(null);

export function LabDemoProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<LabStreamHandle | null>(null);
  const register = useCallback((next: LabStreamHandle | null) => {
    setHandle(next);
  }, []);
  const value = useMemo(() => ({ handle, register }), [handle, register]);
  return <LabDemoContext.Provider value={value}>{children}</LabDemoContext.Provider>;
}

export function useLabDemoRegistry() {
  const ctx = useContext(LabDemoContext);
  if (!ctx) throw new Error('useLabDemoRegistry requires LabDemoProvider');
  return ctx;
}
