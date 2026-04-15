import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createGridStore } from './createGridStore';
import { useModuleState } from './useModuleState';
import type { Module } from '../core/types';

interface CounterState { value: number }

const counter: Module<CounterState> = {
  id: 'counter',
  name: 'counter',
  schemaVersion: 1,
  priority: 100,
  getInitialState: () => ({ value: 0 }),
  serialize: (s) => s,
  deserialize: (raw) => (raw as CounterState) ?? { value: 0 },
};

function Counter({ store }: { store: ReturnType<typeof createGridStore> }) {
  const [state, setState] = useModuleState<CounterState>(store, 'counter');
  return (
    <div>
      <span data-testid="value">{state.value}</span>
      <button onClick={() => setState((p) => ({ value: p.value + 1 }))}>inc</button>
    </div>
  );
}

describe('useModuleState', () => {
  it('renders the initial slice', () => {
    const store = createGridStore({ gridId: 'g1', modules: [counter] });
    render(<Counter store={store} />);
    expect(screen.getByTestId('value').textContent).toBe('0');
  });

  it('re-renders when the slice changes via the returned setter', () => {
    const store = createGridStore({ gridId: 'g1', modules: [counter] });
    render(<Counter store={store} />);
    act(() => screen.getByText('inc').click());
    expect(screen.getByTestId('value').textContent).toBe('1');
  });

  it('re-renders when the slice changes via direct store mutation', () => {
    // Verifies useSyncExternalStore wiring: external setState must trigger
    // the React render, not just internally-routed updates.
    const store = createGridStore({ gridId: 'g1', modules: [counter] });
    render(<Counter store={store} />);
    act(() => store.setModuleState<CounterState>('counter', () => ({ value: 42 })));
    expect(screen.getByTestId('value').textContent).toBe('42');
  });

  it('does not re-render when an unrelated module changes', () => {
    let renderCount = 0;
    const other: Module<CounterState> = { ...counter, id: 'other' };
    const store = createGridStore({ gridId: 'g1', modules: [counter, other] });

    function Tracking() {
      renderCount++;
      const [state] = useModuleState<CounterState>(store, 'counter');
      return <span>{state.value}</span>;
    }
    render(<Tracking />);
    const baseline = renderCount;

    act(() => store.setModuleState<CounterState>('other', () => ({ value: 99 })));
    expect(renderCount).toBe(baseline);

    act(() => store.setModuleState<CounterState>('counter', () => ({ value: 1 })));
    expect(renderCount).toBe(baseline + 1);
  });
});
