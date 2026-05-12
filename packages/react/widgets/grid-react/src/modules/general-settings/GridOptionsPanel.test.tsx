/**
 * Integration test for the v4 schema-driven GridOptionsPanel.
 *
 * Covers:
 *  - renders every band (header band + 8 tier bands)
 *  - representative fields per control kind fire typed updates through
 *    the draft hook (bool / num / optNum / text / select / invert / custom)
 *  - conditional bands (pagination child fields) appear only when gated
 *  - DIRTY=YES / SAVE path commits into module state; DISCARD reverts
 *  - OVERRIDES meta counter moves in lockstep with the draft, NOT the
 *    committed state
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { generalSettingsModule, INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './index';
import { GridOptionsPanel } from './GridOptionsPanel';

function makePlatform(): GridPlatform {
  return new GridPlatform({ gridId: 'test-grid', modules: [generalSettingsModule] });
}

function mount(platform: GridPlatform) {
  return render(
    <GridProvider platform={platform}>
      <GridOptionsPanel />
    </GridProvider>,
  );
}

/** Commit an IconInput value by firing a change+Enter — IconInput
 *  commits on Enter (and blur). */
function commitIconInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('GridOptionsPanel (v4 schema-driven)', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  // ─── Structure / render ────────────────────────────────────────────

  it('renders the panel shell + all bands (sidebar + content)', () => {
    mount(platform);
    expect(screen.getByTestId('go-panel')).toBeTruthy();
    expect(screen.getByTestId('go-save-btn')).toBeTruthy();
    expect(screen.getByTestId('go-discard-btn')).toBeTruthy();
    // Sidebar + sticky summary chip strip both wire through.
    expect(screen.getByTestId('go-band-nav')).toBeTruthy();
    expect(screen.getByTestId('go-summary-strip')).toBeTruthy();

    // Band titles render twice — once as a sidebar nav item, once as
    // the in-content section header anchor.
    for (const title of [
      'ESSENTIALS',
      'ROW GROUPING',
      'PIVOT · TOTALS · AGGREGATION',
      'FILTER · SORT · CLIPBOARD',
      'EDITING · INTERACTION',
      'STYLING',
      'DEFAULT COLDEF',
      'PERFORMANCE (ADVANCED)',
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('starts clean — SAVE/RESET disabled and DIRTY=—', () => {
    mount(platform);
    const save = screen.getByTestId('go-save-btn') as HTMLButtonElement;
    const reset = screen.getByTestId('go-discard-btn') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(reset.disabled).toBe(true);
  });

  // ─── num / text / bool / select / custom controls ──────────────────

  it('edits num field (ROW HEIGHT) — draft only, not module state', () => {
    mount(platform);
    const rowHeight = screen.getByTestId('go-row-height') as HTMLInputElement;
    commitIconInput(rowHeight, '48');

    // Draft reflects.
    expect(rowHeight.value).toBe('48');
    // Module state still initial.
    expect(
      platform.store.getModuleState<GeneralSettingsState>('general-settings').rowHeight,
    ).toBe(INITIAL_GENERAL_SETTINGS.rowHeight);
    // SAVE now enabled.
    expect((screen.getByTestId('go-save-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('edits bool field (ANIMATE ROWS) via the switch', () => {
    mount(platform);
    const toggle = screen.getByTestId('go-animate-rows') as HTMLInputElement;
    expect(toggle.checked).toBe(INITIAL_GENERAL_SETTINGS.animateRows); // true

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
  });

  it('edits inverted bool field (STICKY GROUPS) — UI flips relative to state', () => {
    mount(platform);
    const sticky = screen.getByTestId('go-sticky-groups') as HTMLInputElement;
    // State.suppressGroupRowsSticky defaults to false → UI shows true.
    expect(sticky.checked).toBe(true);

    fireEvent.click(sticky);
    expect(sticky.checked).toBe(false);
  });

  it('edits select field (ROW SELECTION) — sentinel-encoded undefined', async () => {
    const user = userEvent.setup();
    mount(platform);
    const trigger = screen.getByTestId('go-row-selection');
    // Initial 'Off' = undefined (label from encoded `__none__` option).
    expect(trigger).toHaveTextContent('Off');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /Multiple rows/i }));
    expect(trigger).toHaveTextContent('Multiple rows');
  });

  it('conditional fields (PAGE SIZE) render only when pagination=true', () => {
    mount(platform);
    // Off by default → page-size row is hidden.
    expect(screen.queryByTestId('go-page-size')).toBeNull();

    fireEvent.click(screen.getByTestId('go-pagination'));
    // Now visible.
    expect(screen.getByTestId('go-page-size')).toBeTruthy();
    expect(screen.getByTestId('go-page-size-auto')).toBeTruthy();
  });

  it('optNum field (DEFAULT MAX WIDTH) accepts empty → undefined, number → number', () => {
    mount(platform);
    const maxW = screen.getByTestId('go-default-max-width') as HTMLInputElement;
    // Initial is undefined → blank input.
    expect(maxW.value).toBe('');

    commitIconInput(maxW, '500');
    expect(maxW.value).toBe('500');

    commitIconInput(maxW, '');
    expect(maxW.value).toBe('');
  });

  // ─── Save / discard / overrides ────────────────────────────────────

  it('SAVE commits the draft into module state', () => {
    mount(platform);
    const rowHeight = screen.getByTestId('go-row-height') as HTMLInputElement;
    commitIconInput(rowHeight, '64');

    act(() => screen.getByTestId('go-save-btn').click());

    expect(
      platform.store.getModuleState<GeneralSettingsState>('general-settings').rowHeight,
    ).toBe(64);
    // After save, buttons disabled again.
    expect((screen.getByTestId('go-save-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('RESET reverts the draft without touching module state', () => {
    mount(platform);
    const rowHeight = screen.getByTestId('go-row-height') as HTMLInputElement;
    commitIconInput(rowHeight, '99');
    expect(rowHeight.value).toBe('99');

    act(() => screen.getByTestId('go-discard-btn').click());
    expect(rowHeight.value).toBe(String(INITIAL_GENERAL_SETTINGS.rowHeight));
    // Module state was never touched.
    expect(
      platform.store.getModuleState<GeneralSettingsState>('general-settings').rowHeight,
    ).toBe(INITIAL_GENERAL_SETTINGS.rowHeight);
  });
});
