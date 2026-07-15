import { useMemo } from 'react';
import { useModuleState } from '../customizer/hooks/useModuleState.js';
import {
  INITIAL_TOOLBAR_DATE_SETTINGS,
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from '../customizer/modules/toolbar-date-settings/state.js';
import { compileRowExclusionKeepExpression } from './ssrmRowExclusion.js';

/**
 * Live Perspective keep expression for SSRM row-exclusion (compiled from
 * toolbar-date-settings DSL). Empty / unsupported → undefined (no keep filter).
 * Must run under GridProvider.
 */
export function useSsrmRowKeepExpression(): string | undefined {
  const [state] = useModuleState<ToolbarDateSettingsState>(TOOLBAR_DATE_SETTINGS_MODULE_ID);
  const expr =
    (state ?? INITIAL_TOOLBAR_DATE_SETTINGS).rowExclusionExpression ?? '';
  return useMemo(() => {
    const trimmed = expr.trim();
    if (!trimmed) return undefined;
    const compiled = compileRowExclusionKeepExpression(trimmed);
    return compiled.ok ? compiled.keepExpression : undefined;
  }, [expr]);
}
