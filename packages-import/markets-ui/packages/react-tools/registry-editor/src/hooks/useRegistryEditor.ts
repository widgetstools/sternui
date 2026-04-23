/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useReducer, useEffect, useCallback, useRef } from "react";
import {
  loadRegistryConfig,
  saveRegistryConfig,
  clearRegistryConfig,
  IAB_REGISTRY_CONFIG_UPDATE,
  generateTemplateConfigId,
  type RegistryEditorConfig,
  type RegistryEntry,
} from "@markets/openfin-workspace";

// ─── Action Types ────────────────────────────────────────────────────

type RegistryAction =
  | { type: "SET_ENTRIES"; entries: RegistryEntry[] }
  | { type: "ADD_ENTRY"; entry: RegistryEntry }
  | { type: "UPDATE_ENTRY"; id: string; entry: RegistryEntry }
  | { type: "REMOVE_ENTRY"; id: string }
  | { type: "SET_DIRTY"; dirty: boolean }
  | { type: "SET_LOADING"; loading: boolean };

// ─── State ───────────────────────────────────────────────────────────

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

// ─── Reducer ─────────────────────────────────────────────────────────

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
  dispatch: React.Dispatch<RegistryAction>;
  save: () => Promise<void>;
  reset: () => Promise<void>;
  testComponent: (entry: RegistryEntry) => Promise<void>;
}

const CONFIG_VERSION = 1;

export function useRegistryEditor(): UseRegistryEditorReturn {
  const [state, dispatch] = useReducer(registryReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load initial config from IndexedDB on mount
  useEffect(() => {
    async function loadInitialConfig() {
      try {
        const saved = await loadRegistryConfig();
        if (saved) {
          dispatch({ type: "SET_ENTRIES", entries: saved.entries });
        } else {
          dispatch({ type: "SET_ENTRIES", entries: [] });
        }
      } catch (err) {
        console.error("Failed to load registry config:", err);
        dispatch({ type: "SET_ENTRIES", entries: [] });
      }
    }
    loadInitialConfig();
  }, []);

  const buildConfig = useCallback((): RegistryEditorConfig => {
    return {
      version: CONFIG_VERSION,
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
        // Outside OpenFin — open in a new browser tab
        window.open(entry.hostUrl, "_blank");
        return;
      }

      // Pass customData so the component-host can resolve identity.
      // The launched view reads this via readCustomData() to load its config.
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
    dispatch,
    save,
    reset,
    testComponent,
  };
}
