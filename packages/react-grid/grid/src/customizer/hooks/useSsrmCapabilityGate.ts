import { useMemo } from 'react';
import {
  isSsrmCapabilityEnabled,
  ssrmCapabilityTooltip,
} from '../../engine/ssrmCapabilities.js';
import type { SsrmCapabilityId } from '../../engine/types.js';
import { useGridEngineKind } from './GridProvider';

export function useSsrmCapabilityGate(id: SsrmCapabilityId): {
  enabled: boolean;
  tooltip?: string;
} {
  const engineKind = useGridEngineKind();
  return useMemo(() => {
    if (engineKind === 'csrm') {
      return { enabled: true };
    }
    if (isSsrmCapabilityEnabled(id)) {
      return { enabled: true };
    }
    return { enabled: false, tooltip: ssrmCapabilityTooltip(id) };
  }, [engineKind, id]);
}
