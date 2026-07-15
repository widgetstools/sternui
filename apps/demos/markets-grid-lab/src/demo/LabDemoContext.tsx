import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LabStreamHandle } from './types';

interface LabDemoContextValue {
  handle: LabStreamHandle | null;
  register: (next: LabStreamHandle | null) => void;
  useSSRM: boolean;
  setUseSSRM: (next: boolean) => void;
}

const LabDemoContext = createContext<LabDemoContextValue | null>(null);

export function LabDemoProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<LabStreamHandle | null>(null);
  const [useSSRM, setUseSSRM] = useState(false);
  const register = useCallback((next: LabStreamHandle | null) => {
    setHandle(next);
  }, []);
  const value = useMemo(
    () => ({ handle, register, useSSRM, setUseSSRM }),
    [handle, register, useSSRM],
  );
  return <LabDemoContext.Provider value={value}>{children}</LabDemoContext.Provider>;
}

export function useLabDemoRegistry() {
  const ctx = useContext(LabDemoContext);
  if (!ctx) throw new Error('useLabDemoRegistry requires LabDemoProvider');
  return ctx;
}
