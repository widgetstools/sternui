import { describe, it, expect } from 'vitest';
import { toolbarVisibilityModule, type ToolbarVisibilityState } from './index';

describe('toolbarVisibilityModule', () => {
  describe('contract', () => {
    it('declares the expected id, priority, and is hidden from the settings nav', () => {
      expect(toolbarVisibilityModule.id).toBe('toolbar-visibility');
      expect(toolbarVisibilityModule.name).toBe('Toolbar Visibility');
      // Last-priority tier (1000) — pure UI state, no transforms or grid hooks.
      expect(toolbarVisibilityModule.priority).toBe(1000);
      expect(toolbarVisibilityModule.SettingsPanel).toBeUndefined();
    });
  });

  describe('getInitialState', () => {
    it('returns an empty visibility map', () => {
      expect(toolbarVisibilityModule.getInitialState()).toEqual({ visible: {} });
    });

    it('returns a fresh object on each call (defensive copy)', () => {
      const a = toolbarVisibilityModule.getInitialState();
      const b = toolbarVisibilityModule.getInitialState();
      a.visible.style = true;
      expect(b.visible).toEqual({});
    });
  });

  describe('serialize', () => {
    it('returns the state as-is', () => {
      const state: ToolbarVisibilityState = {
        visible: { style: true, data: false, foo: true },
      };
      expect(toolbarVisibilityModule.serialize(state)).toEqual(state);
    });
  });

  describe('deserialize', () => {
    it('returns empty visibility when input is undefined', () => {
      expect(toolbarVisibilityModule.deserialize(undefined)).toEqual({ visible: {} });
    });

    it('returns empty visibility when input is null', () => {
      expect(toolbarVisibilityModule.deserialize(null)).toEqual({ visible: {} });
    });

    it('returns empty visibility when `visible` is missing entirely', () => {
      expect(toolbarVisibilityModule.deserialize({})).toEqual({ visible: {} });
    });

    it('round-trips a populated visibility map', () => {
      const visible = { style: true, data: false };
      expect(toolbarVisibilityModule.deserialize({ visible })).toEqual({ visible });
    });

    it('tolerates a non-object `visible` payload by falling back to {}', () => {
      // Spreading null/undefined into {} yields {} — the module's deserialize
      // uses `...(d.visible ?? {})` so corrupted profile data won't throw.
      expect(toolbarVisibilityModule.deserialize({ visible: null })).toEqual({ visible: {} });
      expect(toolbarVisibilityModule.deserialize({ visible: undefined })).toEqual({ visible: {} });
    });

    it('produces an independent map — caller mutation does not leak', () => {
      const input = { visible: { style: true } };
      const a = toolbarVisibilityModule.deserialize(input);
      a.visible.style = false;
      a.visible.data = true;
      const b = toolbarVisibilityModule.deserialize(input);
      expect(b.visible).toEqual({ style: true });
    });

    it('ignores unknown extra keys', () => {
      const result = toolbarVisibilityModule.deserialize({
        visible: { style: true },
        legacyKey: 'ignored',
      } as unknown);
      expect(result).toEqual({ visible: { style: true } });
    });
  });

  describe('serialize / deserialize round-trip via JSON', () => {
    it('survives the full profile persistence path', () => {
      const initial: ToolbarVisibilityState = { visible: { style: true, data: false } };
      const wire = JSON.parse(JSON.stringify(toolbarVisibilityModule.serialize(initial)));
      expect(toolbarVisibilityModule.deserialize(wire)).toEqual(initial);
    });
  });
});
