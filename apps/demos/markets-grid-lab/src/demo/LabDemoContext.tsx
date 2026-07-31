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
 * No engine flag. This lab is the CLIENT-SIDE row model, end to end.
 *
 * It used to carry a `useSSRM` toggle that defaulted to ON, which meant the
 * "CSRM lab" was in fact running CustomSSRMGrid unless someone flipped it —
 * so it was not the client-side control anyone reading it assumed. The
 * server-side engines have labs of their own (`perspective-ssrm-lab`), and a
 * control that can silently be something else is worse than no control.
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
