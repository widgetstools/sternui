/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useReducer, useEffect, useCallback, useRef, useState } from "react";
import {
  loadRegistryConfig,
  saveRegistryConfig,
  clearRegistryConfig,
  IAB_REGISTRY_CONFIG_UPDATE,
  generateTemplateConfigId,
  migrateRegistryToV2,
  readHostEnv,
  REGISTRY_CONFIG_VERSION,
  type RegistryEditorConfig,
  type RegistryEntry,
  type HostEnv,
} from "@marketsui/openfin-platform";

// ─── Action Types ────────────────────────────────────────────────────

type RegistryAction =
  | { type: "SET_ENTRIES"; entries: RegistryEntry[] }
  | { type: "ADD_ENTRY"; entry: RegistryEntry }
  | { type: "UPDATE_ENTRY"; id: string; entry: RegistryEntry }
  | { type: "REMOVE_ENTRY"; id: string }
  | { type: "SET_DIRTY"; dirty: boolean }
  | { type: "SET_LOADING"; loading: boolean };

interface RegistryState {
  entries: RegistryEntry[];
  isDirty: boolean;
  isLoading: boolean;
}

const initialState: RegistryState = {
  entries: [],
  isDirty: false,
  isLoading: true,
};

function registryReducer(state: RegistryState, action: RegistryAction): RegistryState {
  switch (action.type) {
    case "SET_ENTRIES":
      return { ...state, entries: action.entries, isDirty: false, isLoading: false };
    case "ADD_ENTRY":
      return { ...state, entries: [...state.entries, action.entry], isDirty: true };
    case "UPDATE_ENTRY":
      return {
        ...state,
        entries: state.entries.map((e) => (e.id === action.id ? action.entry : e)),
        isDirty: true,
      };
    case "REMOVE_ENTRY":
      return {
        ...state,
        entries: state.entries.filter((e) => e.id !== action.id),
        isDirty: true,
      };
    case "SET_DIRTY":
      return { ...state, isDirty: action.dirty };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────

export interface UseRegistryEditorReturn {
  entries: RegistryEntry[];
  isDirty: boolean;
  isLoading: boolean;
  hostEnv: HostEnv;
  dispatch: React.Dispatch<RegistryAction>;
  save: () => Promise<void>;
  reset: () => Promise<void>;
  testComponent: (entry: RegistryEntry) => Promise<void>;
}

export function useRegistryEditor(): UseRegistryEditorReturn {
  const [state, dispatch] = useReducer(registryReducer, initialState);
  const [hostEnv, setHostEnv] = useState<HostEnv>({ appId: '', configServiceUrl: '' });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load host env + initial config on mount. The v1→v2 migrator runs
  // here so no downstream code ever sees a v1-shaped entry.
  useEffect(() => {
    (async () => {
      try {
        const env = await readHostEnv();
        setHostEnv(env);

        const saved = await loadRegistryConfig();
        const migrated = migrateRegistryToV2(saved as RegistryEditorConfig | null, env);
        dispatch({ type: "SET_ENTRIES", entries: migrated.entries });
      } catch (err) {
        console.error("Failed to load registry config:", err);
        dispatch({ type: "SET_ENTRIES", entries: [] });
      }
    })();
  }, []);

  const buildConfig = useCallback((): RegistryEditorConfig => {
    return {
      version: REGISTRY_CONFIG_VERSION,
      entries: stateRef.current.entries,
    };
  }, []);

  const publishConfig = useCallback(async (config: RegistryEditorConfig) => {
    try {
      if (typeof fin !== "undefined") {
        await fin.InterApplicationBus.publish(IAB_REGISTRY_CONFIG_UPDATE, config);
      }
    } catch (err) {
      console.warn("Failed to publish registry config update:", err);
    }
  }, []);

  const save = useCallback(async () => {
    const config = buildConfig();
    await saveRegistryConfig(config);
    await publishConfig(config);
    dispatch({ type: "SET_DIRTY", dirty: false });
    console.log("Registry config saved.");
  }, [buildConfig, publishConfig]);

  const reset = useCallback(async () => {
    await clearRegistryConfig();
    dispatch({ type: "SET_ENTRIES", entries: [] });
  }, []);

  const testComponent = useCallback(async (entry: RegistryEntry) => {
    try {
      const openFinApi = (window as any).fin;
      if (typeof openFinApi === "undefined") {
        window.open(entry.hostUrl, "_blank");
        return;
      }

      const instanceId = crypto.randomUUID();
      const templateId = entry.configId || generateTemplateConfigId(
        entry.componentType,
        entry.componentSubType,
      );

      const platform = openFinApi.Platform.getCurrentSync();
      await platform.createView({
        url: entry.hostUrl,
        customData: {
          instanceId,
          templateId,
          componentType: entry.componentType,
          componentSubType: entry.componentSubType,
          // v2: forward the appId + configServiceUrl the component will
          // target. For usesHostConfig === true this equals hostEnv; for
          // external entries it equals the entry's own values.
          appId: entry.appId,
          configServiceUrl: entry.configServiceUrl,
        },
      });
    } catch (err) {
      console.warn("Failed to launch test component:", err);
    }
  }, []);

  return {
    entries: state.entries,
    isDirty: state.isDirty,
    isLoading: state.isLoading,
    hostEnv,
    dispatch,
    save,
    reset,
    testComponent,
  };
}
