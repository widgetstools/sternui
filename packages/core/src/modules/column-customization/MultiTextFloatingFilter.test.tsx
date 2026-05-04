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

interface FakeChildFilter {
  setModel: ReturnType<typeof vi.fn>;
}

function makeFakeParams() {
  const child: FakeChildFilter = { setModel: vi.fn() };
  const parent = {
    getChildFilterInstance: vi.fn((idx: number) => (idx === 0 ? child : undefined)),
  };
  // parentFilterInstance is documented as a function that takes a
  // callback and invokes it with the parent filter — match that
  // shape exactly so the component's call site is realistic.
  const parentFilterInstance = vi.fn((cb: (instance: unknown) => void) => cb(parent));
  const api = {
    onFilterChanged: vi.fn(),
  };
  // Cast to never — we don't implement every IFloatingFilterParams
  // field; the component only touches `parentFilterInstance` + `api`.
  return { child, parent, parentFilterInstance, api };
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

  it('typing updates the input AND calls setModel on the first child filter', () => {
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
    expect(fake.parent.getChildFilterInstance).toHaveBeenCalledWith(0);
    expect(fake.child.setModel).toHaveBeenCalledTimes(1);
    expect(fake.child.setModel).toHaveBeenCalledWith({
      filterType: 'text',
      type: 'contains',
      filter: 'abc',
    });
    expect(fake.api.onFilterChanged).toHaveBeenCalledTimes(1);
  });

  it('backspace-to-empty calls setModel(null) — the regression we are fixing', () => {
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
    fake.child.setModel.mockClear();
    fireEvent.change(input, { target: { value: '' } });

    expect(input.value).toBe('');
    // setModel(null) — drops the entry from the multi-filter model
    // entirely, which is what the built-in floating filter does on a
    // full clear.
    expect(fake.child.setModel).toHaveBeenCalledWith(null);
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
    const calls = fake.child.setModel.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][0]).toMatchObject({ filter: 'abc' });
    expect(calls[1][0]).toBeNull();
    expect(calls[2][0]).toMatchObject({ filter: 'xy' });
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

  it('handles a missing or undefined first child gracefully (no crash)', () => {
    // Simulate AG-Grid handing us a parent that doesn't expose
    // getChildFilterInstance (e.g. mid-teardown or a future API
    // change). The component must not throw — at worst it skips the
    // model write and leaves the input value owned by the user.
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
});
