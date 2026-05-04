/**
 * Tests for `MultiTextFloatingFilter` — the custom React floating
 * filter that bypasses AG-Grid 35.2.x's broken
 * `agMultiColumnFloatingFilter` wrapper for nested-field columns.
 *
 * We can't render this inside a real AG-Grid here (jsdom + AG-Grid
 * Enterprise are too heavy for unit tests). Instead we drive the
 * component with a hand-rolled fake `IFloatingFilterParams` and
 * assert:
 *   - the input is owned by the component (typing updates it
 *     immediately, regardless of model state)
 *   - on input change, we reach into `parentFilterInstance` and call
 *     `setModel` on the FIRST child filter
 *   - empty string clears the child model (`setModel(null)`)
 *   - non-empty types a `text/contains` model
 *   - `onParentModelChanged` (exposed via the imperative ref) syncs
 *     external model updates BACK into the input
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import type { IFloatingFilter } from 'ag-grid-community';
import { MultiTextFloatingFilter } from './MultiTextFloatingFilter';

interface FakeMultiFilter {
  setModel: ReturnType<typeof vi.fn>;
  getModel: ReturnType<typeof vi.fn>;
}

/**
 * Build a fake `IFloatingFilterParams` whose parentFilterInstance
 * exposes a multi-filter with `setModel` + `getModel`. By default the
 * multi-filter has no current model (returns null) — pass an
 * `initialModel` to seed it (e.g. tests that exercise the
 * preserve-second-child path).
 */
function makeFakeParams(opts?: { initialModel?: unknown }) {
  const parent: FakeMultiFilter = {
    setModel: vi.fn(),
    getModel: vi.fn(() => opts?.initialModel ?? null),
  };
  const parentFilterInstance = vi.fn((cb: (instance: unknown) => void) => cb(parent));
  const api = { onFilterChanged: vi.fn() };
  return { parent, parentFilterInstance, api };
}

describe('MultiTextFloatingFilter', () => {
  afterEach(cleanup);

  it('starts empty — model state is read via onParentModelChanged, not on first render', () => {
    const fake = makeFakeParams();
    render(
      <MultiTextFloatingFilter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance: fake.parentFilterInstance, api: fake.api } as any)}
      />,
    );
    const input = screen.getByTestId('gc-multi-text-floating-filter').querySelector('input');
    expect(input).not.toBeNull();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('typing updates the input AND calls setModel on the parent multi-filter with the full multi-shape', () => {
    const fake = makeFakeParams();
    render(
      <MultiTextFloatingFilter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance: fake.parentFilterInstance, api: fake.api } as any)}
      />,
    );
    const input = screen
      .getByTestId('gc-multi-text-floating-filter')
      .querySelector('input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'abc' } });

    expect(input.value).toBe('abc');
    // Going through the parent's setModel — not the child's — is
    // critical: child setModel doesn't invalidate the multi-filter's
    // aggregated `getModel()` cache, so AG-Grid would filter rows
    // against the stale shape.
    expect(fake.parent.setModel).toHaveBeenCalledTimes(1);
    expect(fake.parent.setModel).toHaveBeenCalledWith({
      filterType: 'multi',
      filterModels: [
        { filterType: 'text', type: 'contains', filter: 'abc' },
        null,
      ],
    });
    expect(fake.api.onFilterChanged).toHaveBeenCalled();
  });

  it('backspace-to-empty drops the entry entirely (setModel(null)) — the regression we are fixing', () => {
    const fake = makeFakeParams();
    render(
      <MultiTextFloatingFilter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance: fake.parentFilterInstance, api: fake.api } as any)}
      />,
    );
    const input = screen
      .getByTestId('gc-multi-text-floating-filter')
      .querySelector('input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'a' } });
    fake.parent.setModel.mockClear();
    fireEvent.change(input, { target: { value: '' } });

    expect(input.value).toBe('');
    // Both children null ⇒ collapse the entire multi-filter to
    // null, dropping the column from the filter model. Same shape
    // the built-in floating filter produces on full clear.
    expect(fake.parent.setModel).toHaveBeenCalledWith(null);
  });

  it('preserves the SECOND child (set filter) current model when the user only types in the text floater', () => {
    // Seed the parent with an existing set-filter selection. Typing
    // in our floating text input must NOT clobber it.
    const setSelection = {
      filterType: 'set',
      values: ['EUR', 'USD'],
    };
    const fake = makeFakeParams({
      initialModel: {
        filterType: 'multi',
        filterModels: [null, setSelection],
      },
    });
    render(
      <MultiTextFloatingFilter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance: fake.parentFilterInstance, api: fake.api } as any)}
      />,
    );
    const input = screen
      .getByTestId('gc-multi-text-floating-filter')
      .querySelector('input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'a' } });

    expect(fake.parent.setModel).toHaveBeenLastCalledWith({
      filterType: 'multi',
      filterModels: [
        { filterType: 'text', type: 'contains', filter: 'a' },
        setSelection,
      ],
    });
  });

  it('subsequent typing after backspace re-applies a fresh model (no stale resurrection)', () => {
    const fake = makeFakeParams();
    render(
      <MultiTextFloatingFilter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance: fake.parentFilterInstance, api: fake.api } as any)}
      />,
    );
    const input = screen
      .getByTestId('gc-multi-text-floating-filter')
      .querySelector('input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: 'xy' } });

    expect(input.value).toBe('xy');
    const calls = fake.parent.setModel.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toMatchObject({
      filterType: 'multi',
      filterModels: [{ filter: 'abc' }, null],
    });
    expect(calls[1][0]).toBeNull();
    expect(calls[2][0]).toMatchObject({
      filterType: 'multi',
      filterModels: [{ filter: 'xy' }, null],
    });
  });

  it('onParentModelChanged (via imperative ref) syncs the input from the parent model', () => {
    const fake = makeFakeParams();
    const ref = createRef<IFloatingFilter>();
    render(
      <MultiTextFloatingFilter
        ref={ref}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance: fake.parentFilterInstance, api: fake.api } as any)}
      />,
    );
    const input = screen
      .getByTestId('gc-multi-text-floating-filter')
      .querySelector('input') as HTMLInputElement;

    expect(ref.current).not.toBeNull();
    // Simulate the user editing the popup multi-filter directly —
    // AG-Grid would invoke onParentModelChanged with the new model.
    // Wrap in act() so React flushes the state update before we
    // assert (otherwise the input still reads the previous value).
    act(() => {
      ref.current!.onParentModelChanged(
        {
          filterType: 'multi',
          filterModels: [
            { filterType: 'text', type: 'contains', filter: 'fromPopup' },
            null,
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        undefined as any,
      );
    });

    expect(input.value).toBe('fromPopup');
  });

  it('onParentModelChanged with empty model resets the input', () => {
    const fake = makeFakeParams();
    const ref = createRef<IFloatingFilter>();
    render(
      <MultiTextFloatingFilter
        ref={ref}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance: fake.parentFilterInstance, api: fake.api } as any)}
      />,
    );
    const input = screen
      .getByTestId('gc-multi-text-floating-filter')
      .querySelector('input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'manual' } });
    expect(input.value).toBe('manual');

    // External clear (e.g. user clicked Clear in the popup, or
    // someone called api.setFilterModel(null)).
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref.current!.onParentModelChanged(null, undefined as any);
    });
    expect(input.value).toBe('');
  });

  it('handles a parent without setModel gracefully (no crash, input still owned by user)', () => {
    // Simulate AG-Grid handing us a parent that doesn't expose
    // setModel (mid-teardown / future API drift). The component must
    // not throw — at worst it skips the model write and leaves the
    // input value owned by the user.
    const parentFilterInstance = vi.fn((cb: (instance: unknown) => void) => cb({}));
    const api = { onFilterChanged: vi.fn() };
    render(
      <MultiTextFloatingFilter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance, api } as any)}
      />,
    );
    const input = screen
      .getByTestId('gc-multi-text-floating-filter')
      .querySelector('input') as HTMLInputElement;

    expect(() => fireEvent.change(input, { target: { value: 'x' } })).not.toThrow();
    expect(input.value).toBe('x');
    expect(api.onFilterChanged).not.toHaveBeenCalled();
  });

  it('awaits setModel when it returns a Promise, then fires onFilterChanged', async () => {
    // AG-Grid 35's IMultiFilter.setModel returns a Promise. We need
    // to wait for it before calling onFilterChanged so the row model
    // doesn't see the OLD aggregated state.
    const setModelPromise = Promise.resolve();
    const parent = {
      setModel: vi.fn(() => setModelPromise),
      getModel: vi.fn(() => null),
    };
    const parentFilterInstance = vi.fn((cb: (instance: unknown) => void) => cb(parent));
    const api = { onFilterChanged: vi.fn() };
    render(
      <MultiTextFloatingFilter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ parentFilterInstance, api } as any)}
      />,
    );
    const input = screen
      .getByTestId('gc-multi-text-floating-filter')
      .querySelector('input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'p' } });
    // setModel returned a Promise — onFilterChanged should fire
    // AFTER the Promise resolves, not synchronously.
    expect(api.onFilterChanged).not.toHaveBeenCalled();
    await setModelPromise;
    // Flush microtask queue so the .then() callback runs before we
    // assert.
    await Promise.resolve();
    expect(api.onFilterChanged).toHaveBeenCalledTimes(1);
  });
});
