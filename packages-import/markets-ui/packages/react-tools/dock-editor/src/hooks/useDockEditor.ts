/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any; // OpenFin global — available at runtime in OpenFin windows

import { useReducer, useEffect, useCallback, useRef } from "react";
import {
  loadDockConfig,
  saveDockConfig,
  clearDockConfig,
  IAB_DOCK_CONFIG_UPDATE,
  type DockEditorConfig,
  type DockButtonConfig,
  type DockActionButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
} from "@markets/openfin-workspace";

// ─── Action Types ────────────────────────────────────────────────────

type EditorAction =
  | { type: "SET_BUTTONS"; buttons: DockButtonConfig[] }
  | { type: "ADD_BUTTON"; button: DockButtonConfig }
  | { type: "UPDATE_BUTTON"; id: string; button: DockButtonConfig }
  | { type: "REMOVE_BUTTON"; id: string }
  | { type: "REORDER_BUTTONS"; fromIndex: number; toIndex: number }
  | { type: "ADD_MENU_ITEM"; buttonId: string; item: DockMenuItemConfig; parentItemId?: string }
  | { type: "UPDATE_MENU_ITEM"; buttonId: string; itemId: string; item: DockMenuItemConfig; parentItemId?: string }
  | { type: "REMOVE_MENU_ITEM"; buttonId: string; itemId: string; parentItemId?: string }
  | { type: "REORDER_MENU_ITEMS"; buttonId: string; fromIndex: number; toIndex: number; parentItemId?: string }
  | { type: "SET_DIRTY"; dirty: boolean }
  | { type: "SET_LOADING"; loading: boolean };

// ─── State ───────────────────────────────────────────────────────────

interface EditorState {
  buttons: DockButtonConfig[];
  isDirty: boolean;
  isLoading: boolean;
}

const initialState: EditorState = {
  buttons: [],
  isDirty: false,
  isLoading: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────

function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...list];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

function updateMenuItemsRecursive(
  items: DockMenuItemConfig[],
  targetId: string,
  updater: (items: DockMenuItemConfig[]) => DockMenuItemConfig[],
  parentItemId?: string,
): DockMenuItemConfig[] {
  if (!parentItemId) {
    return updater(items);
  }
  return items.map((item) => {
    if (item.id === parentItemId) {
      return { ...item, options: updater(item.options ?? []) };
    }
    if (item.options?.length) {
      return {
        ...item,
        options: updateMenuItemsRecursive(item.options, targetId, updater, parentItemId),
      };
    }
    return item;
  });
}

// ─── Reducer ─────────────────────────────────────────────────────────

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_BUTTONS":
      return { ...state, buttons: action.buttons, isDirty: false, isLoading: false };

    case "ADD_BUTTON":
      return { ...state, buttons: [...state.buttons, action.button], isDirty: true };

    case "UPDATE_BUTTON":
      return {
        ...state,
        buttons: state.buttons.map((b) => (b.id === action.id ? action.button : b)),
        isDirty: true,
      };

    case "REMOVE_BUTTON":
      return {
        ...state,
        buttons: state.buttons.filter((b) => b.id !== action.id),
        isDirty: true,
      };

    case "REORDER_BUTTONS":
      return {
        ...state,
        buttons: reorder(state.buttons, action.fromIndex, action.toIndex),
        isDirty: true,
      };

    case "ADD_MENU_ITEM": {
      return {
        ...state,
        buttons: state.buttons.map((b) => {
          if (b.id !== action.buttonId || b.type !== "DropdownButton") return b;
          const dropdown = b as DockDropdownButtonConfig;
          const newOptions = action.parentItemId
            ? updateMenuItemsRecursive(
                dropdown.options,
                action.item.id,
                (items) => [...items, action.item],
                action.parentItemId,
              )
            : [...dropdown.options, action.item];
          return { ...dropdown, options: newOptions };
        }),
        isDirty: true,
      };
    }

    case "UPDATE_MENU_ITEM": {
      return {
        ...state,
        buttons: state.buttons.map((b) => {
          if (b.id !== action.buttonId || b.type !== "DropdownButton") return b;
          const dropdown = b as DockDropdownButtonConfig;
          const updater = (items: DockMenuItemConfig[]) =>
            items.map((i) => (i.id === action.itemId ? action.item : i));
          const newOptions = action.parentItemId
            ? updateMenuItemsRecursive(dropdown.options, action.itemId, updater, action.parentItemId)
            : updater(dropdown.options);
          return { ...dropdown, options: newOptions };
        }),
        isDirty: true,
      };
    }

    case "REMOVE_MENU_ITEM": {
      return {
        ...state,
        buttons: state.buttons.map((b) => {
          if (b.id !== action.buttonId || b.type !== "DropdownButton") return b;
          const dropdown = b as DockDropdownButtonConfig;
          const updater = (items: DockMenuItemConfig[]) =>
            items.filter((i) => i.id !== action.itemId);
          const newOptions = action.parentItemId
            ? updateMenuItemsRecursive(dropdown.options, action.itemId, updater, action.parentItemId)
            : updater(dropdown.options);
          return { ...dropdown, options: newOptions };
        }),
        isDirty: true,
      };
    }

    case "REORDER_MENU_ITEMS": {
      return {
        ...state,
        buttons: state.buttons.map((b) => {
          if (b.id !== action.buttonId || b.type !== "DropdownButton") return b;
          const dropdown = b as DockDropdownButtonConfig;
          const updater = (items: DockMenuItemConfig[]) =>
            reorder(items, action.fromIndex, action.toIndex);
          const newOptions = action.parentItemId
            ? updateMenuItemsRecursive(dropdown.options, "", updater, action.parentItemId)
            : updater(dropdown.options);
          return { ...dropdown, options: newOptions };
        }),
        isDirty: true,
      };
    }

    case "SET_DIRTY":
      return { ...state, isDirty: action.dirty };

    case "SET_LOADING":
      return { ...state, isLoading: action.loading };

    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────

export interface UseDockEditorReturn {
  /** Current button definitions */
  buttons: DockButtonConfig[];
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Dispatch raw actions */
  dispatch: React.Dispatch<EditorAction>;
  /** Save current config to IndexedDB and notify the dock */
  save: () => Promise<void>;
  /** Clear saved config and reload defaults */
  reset: () => Promise<void>;
  /** Publish current config to dock for live preview without saving */
  preview: () => Promise<void>;
}

// Version number embedded in every saved config.
// If the config format ever changes in a breaking way, bump this number
// so old configs can be migrated or ignored.
const CONFIG_VERSION = 1;

export function useDockEditor(): UseDockEditorReturn {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  // stateRef gives useCallback functions access to the latest state
  // without listing `state` as a dependency (which would recreate every
  // callback on every render). This is a standard React pattern for
  // "reading current state inside a stable callback".
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load initial config from IndexedDB on first render.
  // The empty dependency array [] means this runs once, on mount.
  useEffect(() => {
    async function loadInitialConfig() {
      try {
        const saved = await loadDockConfig();
        if (saved) {
          dispatch({ type: "SET_BUTTONS", buttons: saved.buttons });
        } else {
          // No saved config yet — start with an empty list
          dispatch({ type: "SET_BUTTONS", buttons: [] });
        }
      } catch (err) {
        console.error("Failed to load dock config:", err);
        dispatch({ type: "SET_BUTTONS", buttons: [] });
      }
    }
    loadInitialConfig();
  }, []);

  // Build a saveable DockEditorConfig snapshot from the current state
  const buildConfig = useCallback((): DockEditorConfig => {
    return {
      version: CONFIG_VERSION,
      buttons: stateRef.current.buttons,
      updatedAt: new Date().toISOString(),
    };
  }, []);

  // Publish config via InterApplicationBus (for live updates)
  const publishConfig = useCallback(async (config: DockEditorConfig) => {
    try {
      if (typeof fin !== "undefined") {
        await fin.InterApplicationBus.publish(IAB_DOCK_CONFIG_UPDATE, config);
      }
    } catch (err) {
      console.warn("Failed to publish dock config update:", err);
    }
  }, []);

  const save = useCallback(async () => {
    const config = buildConfig();
    await saveDockConfig(config);
    await publishConfig(config);
    dispatch({ type: "SET_DIRTY", dirty: false });
    console.log("Dock config saved.");
  }, [buildConfig, publishConfig]);

  const reset = useCallback(async () => {
    await clearDockConfig();
    dispatch({ type: "SET_BUTTONS", buttons: [] });
    // Publish empty config so dock reverts to defaults
    try {
      if (typeof fin !== "undefined") {
        await fin.InterApplicationBus.publish("dock-config-reset", {});
      }
    } catch (err) {
      console.warn("Failed to publish dock config reset:", err);
    }
  }, []);

  const preview = useCallback(async () => {
    const config = buildConfig();
    await publishConfig(config);
  }, [buildConfig, publishConfig]);

  return {
    buttons: state.buttons,
    isDirty: state.isDirty,
    isLoading: state.isLoading,
    dispatch,
    save,
    reset,
    preview,
  };
}
