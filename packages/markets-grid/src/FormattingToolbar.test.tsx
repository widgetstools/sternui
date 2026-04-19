/**
 * Integration tests for FormattingToolbar.
 *
 * These mount the toolbar inside a <GridProvider> with a minimal fake
 * GridApi so the component's real code paths run end-to-end:
 *
 *   user clicks button → toolbar handler → delegating helper → pure
 *   reducer → setModuleState → store update → assertion reads back
 *
 * The reducers already have 63 unit tests in core
 * (formattingActions.test.ts + snapshotTemplate.test.ts). The point of
 * THESE tests is to verify the PLUMBING — that every button is wired to
 * the correct reducer with the correct args. Together they cover the
 * refactor end-to-end and make the upcoming "drop the store prop"
 * commits safe.
 */
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import {
  columnCustomizationModule,
  columnTemplatesModule,
  GridPlatform,
  GridProvider,
  type ColumnCustomizationState,
  type ColumnTemplatesState,
} from '@grid-customizer/core';
import { FormattingToolbar } from './FormattingToolbar';

// ─── Fake GridApi harness ─────────────────────────────────────────────

interface FakeCol {
  id: string;
  headerName?: string;
  cellDataType?: string;
}

/**
 * Build a `GridApi`-shaped object that the toolbar's two read sites
 * (`useActiveColumns` via ApiHub + the inline `core.getGridApi()` calls
 * for colLabel / pickerDataType / saveAsTemplate) both recognise.
 *
 * - `getColumns()` + `getColumn(id)` expose the column list for
 *   headerName / cellDataType lookups.
 * - `getCellRanges()` returns a synthetic range with exactly the colIds
 *   we want the toolbar to treat as "active". Used by `useActiveColumns`.
 * - `addEventListener` / `removeEventListener` store subscriptions and
 *   expose a `fireEvent(name)` helper so tests can simulate AG-Grid
 *   emitting cellFocused / cellSelectionChanged / etc.
 */
function makeFakeApi(cols: FakeCol[], activeColIds: string[]) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const toColumn = (c: FakeCol): Column =>
    ({
      getColId: () => c.id,
      getColDef: () => ({ headerName: c.headerName, cellDataType: c.cellDataType }),
    }) as Column;

  const api: Partial<GridApi> = {
    getColumns: () => cols.map(toColumn),
    getColumn: ((id: string) => {
      const c = cols.find((x) => x.id === id);
      return c ? toColumn(c) : null;
    }) as GridApi['getColumn'],
    getCellRanges: () =>
      activeColIds.length === 0
        ? null
        : ([
            { columns: activeColIds.map((id) => toColumn({ id })) },
          ] as unknown as ReturnType<GridApi['getCellRanges']>),
    getFocusedCell: () => null,
    addEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    }) as unknown as GridApi['addEventListener'],
    removeEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      listeners.get(evt)?.delete(fn);
    }) as unknown as GridApi['removeEventListener'],
  };
  return {
    api: api as GridApi,
    fireEvent(evt: string) {
      for (const fn of Array.from(listeners.get(evt) ?? [])) fn();
    },
    setActive(next: string[]) {
      activeColIds = next;
    },
  };
}

function makePlatform() {
  return new GridPlatform({
    gridId: 'test-grid',
    modules: [columnTemplatesModule, columnCustomizationModule],
  });
}

function mountToolbar({
  platform,
  api,
}: {
  platform: GridPlatform;
  api: GridApi;
}) {
  // FormattingToolbar is fully context-driven as of step 7 — it takes
  // NO props. Every dependency (live GridApi, module stores, ApiHub)
  // flows through `useGridPlatform()`.
  platform.onGridReady(api);
  return render(
    <GridProvider platform={platform}>
      <FormattingToolbar />
    </GridProvider>,
  );
}

const COLS: FakeCol[] = [
  { id: 'price', headerName: 'Price', cellDataType: 'numeric' },
  { id: 'quantity', headerName: 'Quantity', cellDataType: 'numeric' },
];

function getCustState(platform: GridPlatform) {
  return platform.store.getModuleState<ColumnCustomizationState>('column-customization');
}

function getAssignment(platform: GridPlatform, colId: string) {
  return getCustState(platform).assignments[colId];
}

function getTplState(platform: GridPlatform) {
  return platform.store.getModuleState<ColumnTemplatesState>('column-templates');
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('FormattingToolbar — typography', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('Bold button writes typography.bold on the active column', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    // useActiveColumns() starts empty; the onReady fires synchronously
    // once the api is live, but React may batch — wait for the button
    // to render in its enabled state.
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    act(() => {
      fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' }));
    });

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.typography?.bold).toBe(true);
  });

  it('Bold is idempotent-toggle: second click clears it', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });
    const bold = () => screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement;

    await waitFor(() => expect(bold().disabled).toBe(false));
    act(() => fireEvent.mouseDown(bold()));
    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.typography?.bold).toBe(true);

    // Second click clears.
    act(() => fireEvent.mouseDown(bold()));
    // Every override has been un-set → the assignment collapses to `{ colId }`.
    expect(getAssignment(platform, 'price')).toEqual({ colId: 'price' });
  });

  it('Italic button writes typography.italic', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Italic' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Italic' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.typography?.italic).toBe(true);
  });

  it('Underline button writes typography.underline', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Underline' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Underline' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.typography?.underline).toBe(true);
  });

  it('writes to multiple columns when more than one is in the active range', async () => {
    const fake = makeFakeApi(COLS, ['price', 'quantity']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.typography?.bold).toBe(true);
    expect(getAssignment(platform, 'quantity')?.cellStyleOverrides?.typography?.bold).toBe(true);
  });
});

describe('FormattingToolbar — alignment', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it.each(['Left', 'Center', 'Right'] as const)(
    '"%s" alignment button writes alignment.horizontal',
    async (label) => {
      const fake = makeFakeApi(COLS, ['price']);
      mountToolbar({ platform, api: fake.api });

      await waitFor(() =>
        expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(false),
      );
      act(() => fireEvent.mouseDown(screen.getByRole('button', { name: label })));

      expect(
        getAssignment(platform, 'price')?.cellStyleOverrides?.alignment?.horizontal,
      ).toBe(label.toLowerCase());
    },
  );

  it('clicking the active alignment again clears it', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Center' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Center' })));
    expect(
      getAssignment(platform, 'price')?.cellStyleOverrides?.alignment?.horizontal,
    ).toBe('center');

    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Center' })));
    expect(getAssignment(platform, 'price')).toEqual({ colId: 'price' });
  });
});

describe('FormattingToolbar — target switcher', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('defaults to target="cell" — writes land in cellStyleOverrides', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.typography?.bold).toBe(true);
    expect(getAssignment(platform, 'price')?.headerStyleOverrides).toBeUndefined();
  });

  it('switching to target="header" routes writes into headerStyleOverrides', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // Open the target switcher popover and pick header.
    const toggle = screen.getByTestId('formatting-target-toggle');
    act(() => fireEvent.click(toggle));
    const headerOpt = await screen.findByTestId('formatting-target-header');
    act(() => fireEvent.click(headerOpt));

    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides).toBeUndefined();
    expect(getAssignment(platform, 'price')?.headerStyleOverrides?.typography?.bold).toBe(true);
  });
});

describe('FormattingToolbar — templates', () => {
  let platform: GridPlatform;
  beforeEach(() => {
    platform = makePlatform();
    // Seed a template so the templates picker has something to show.
    platform.store.setModuleState<ColumnTemplatesState>('column-templates', () => ({
      templates: {
        'tpl-red': {
          id: 'tpl-red',
          name: 'Red text',
          cellStyleOverrides: { colors: { text: '#ff0000' } },
          createdAt: 1,
          updatedAt: 1,
        },
      },
      typeDefaults: {},
    }));
  });

  it('picking a template sets templateIds on active columns', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // Click the templates icon-button to open the popover, then click
    // the row for the seeded `tpl-red` template. Replaces the old
    // `<select>` change-event flow; functional contract (dispatching
    // `applyTemplateToColumnsReducer`) is identical.
    act(() => fireEvent.click(screen.getByTestId('templates-menu-trigger')));
    const item = await screen.findByTestId('templates-menu-item-tpl-red');
    act(() => fireEvent.click(item));

    expect(getAssignment(platform, 'price')?.templateIds).toEqual(['tpl-red']);
  });

  it('save-as-template inserts a new ColumnTemplate when the column has style', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // Lay down some style on `price` first.
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));
    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.typography?.bold).toBe(true);

    // Open the "Save as template" popover, then type + hit Save.
    // Open the popover via click (Radix Trigger listens on click — TBtn's
    // onMouseDown.preventDefault intentionally does NOT interfere).
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save as template' })));
    const input = await screen.findByTestId('save-tpl-input');
    act(() => fireEvent.change(input, { target: { value: 'Bold Style' } }));
    act(() => fireEvent.click(screen.getByTestId('save-tpl-btn')));

    const templates = getTplState(platform).templates;
    // Original `tpl-red` + the new one.
    expect(Object.keys(templates).length).toBe(2);
    const saved = Object.values(templates).find((t) => t.name === 'Bold Style');
    expect(saved).toBeDefined();
    expect(saved!.cellStyleOverrides?.typography?.bold).toBe(true);
    expect(saved!.description).toBe('Saved from price');
  });

  it('save-as-template is a no-op when the column has no overrides', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // Open the popover via click (Radix Trigger listens on click — TBtn's
    // onMouseDown.preventDefault intentionally does NOT interfere).
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Save as template' })));
    const input = await screen.findByTestId('save-tpl-input');
    act(() => fireEvent.change(input, { target: { value: 'Empty' } }));
    act(() => fireEvent.click(screen.getByTestId('save-tpl-btn')));

    // Template count is unchanged — still just the seed `tpl-red`.
    expect(Object.keys(getTplState(platform).templates)).toEqual(['tpl-red']);
  });
});

describe('FormattingToolbar — disabled state', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('Bold button is disabled when no column is active', async () => {
    const fake = makeFakeApi(COLS, []);
    mountToolbar({ platform, api: fake.api });

    // The toolbar re-computes once the api is ready and still finds
    // no active columns → buttons are disabled.
    await waitFor(() => {
      const b = screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
    });
  });
});
