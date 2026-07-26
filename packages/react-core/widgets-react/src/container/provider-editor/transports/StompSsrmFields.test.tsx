/**
 * StompSsrmFields — the dedicated SSRM editor surface renders exactly
 * the pull-plane fields and shows `validateStompSsrmConfig` issues
 * inline (blank keyColumn being the canonical case: a fresh draft is
 * born invalid and the editor must say so, not hide it).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { StompSsrmProviderConfig } from '@starui/shared-types';
import { StompSsrmFields } from './StompSsrmFields.js';

afterEach(() => {
  cleanup();
});

const VALID: StompSsrmProviderConfig = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/GRID1',
  keyColumn: 'positionId',
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
  ],
};

/** A wider book, so the S1 knobs have declared columns to point at. */
const WEIGHTED: StompSsrmProviderConfig = {
  ...VALID,
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
    { field: 'oas', headerName: 'OAS', cellDataType: 'number' },
    { field: 'dv01', headerName: 'DV01', cellDataType: 'number' },
    { field: 'notional', headerName: 'Notional', cellDataType: 'number' },
    { field: 'bookName', headerName: 'Book', cellDataType: 'text' },
    { field: 'parentId', headerName: 'Parent', cellDataType: 'text' },
  ],
};

describe('StompSsrmFields', () => {
  it('renders the SSRM transport fields and none of the push-plane knobs', () => {
    render(<StompSsrmFields cfg={VALID} onChange={() => {}} />);
    expect(screen.getByTestId('ssrm-websocket-url')).toHaveProperty('value', 'ws://localhost:8081');
    expect(screen.getByTestId('ssrm-listener-topic')).toHaveProperty('value', '/snapshot/positions/GRID1');
    expect(screen.getByTestId('ssrm-key-column')).toHaveProperty('value', 'positionId');
    // Push-plane vocabulary must not leak into the SSRM editor. (The
    // pull plane has its own legit "Wide Sweep Throttle" — the knobs
    // that must never appear are the fan-out ones.)
    expect(screen.queryByText(/fan[- ]?out/i)).toBeNull();
    expect(screen.queryByText(/conflat/i)).toBeNull();
    expect(screen.queryByText(/wire format/i)).toBeNull();
    expect(screen.queryByText(/snapshot chunk/i)).toBeNull();
  });

  it('shows no validation errors for a valid config', () => {
    render(<StompSsrmFields cfg={VALID} onChange={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an inline error for a blank keyColumn', () => {
    render(<StompSsrmFields cfg={{ ...VALID, keyColumn: '' }} onChange={() => {}} />);
    const error = screen.getByTestId('ssrm-key-column-error');
    expect(error.textContent).toMatch(/Key column is required/);
  });

  it('shows an inline error when the keyColumn is not among the column definitions', () => {
    render(<StompSsrmFields cfg={{ ...VALID, keyColumn: 'nope' }} onChange={() => {}} />);
    expect(screen.getByTestId('ssrm-key-column-error').textContent).toMatch(
      /must appear in the column definitions/,
    );
  });

  it('shows inline errors for a malformed URL and an empty topic', () => {
    render(
      <StompSsrmFields
        cfg={{ ...VALID, websocketUrl: 'http://not-ws', listenerTopic: '' }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('ssrm-websocket-url-error').textContent).toMatch(/ws:\/\//);
    expect(screen.getByTestId('ssrm-listener-topic-error').textContent).toMatch(/required/);
  });

  it('propagates edits through onChange patches', () => {
    const onChange = vi.fn();
    render(<StompSsrmFields cfg={VALID} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('ssrm-key-column'), { target: { value: 'cusip' } });
    expect(onChange).toHaveBeenCalledWith({ keyColumn: 'cusip' });
    fireEvent.change(screen.getByTestId('ssrm-websocket-url'), { target: { value: 'wss://prod:443' } });
    expect(onChange).toHaveBeenCalledWith({ websocketUrl: 'wss://prod:443' });
  });

  // ─── P5: the P4b-2 window-side query knobs ─────────────────────────

  it('renders the calc-expression rows and edits patch calcExpressions', () => {
    const onChange = vi.fn();
    render(
      <StompSsrmFields
        cfg={{ ...VALID, calcExpressions: { ppu: '"pnl" / "quantity"' } }}
        onChange={onChange}
      />,
    );
    const card = screen.getByTestId('ssrm-calc-expressions');
    expect(within(card).getByDisplayValue('ppu')).toBeTruthy();
    expect(within(card).getByDisplayValue('"pnl" / "quantity"')).toBeTruthy();

    fireEvent.change(within(card).getByDisplayValue('"pnl" / "quantity"'), {
      target: { value: '"pnl" * 2' },
    });
    expect(onChange).toHaveBeenCalledWith({ calcExpressions: { ppu: '"pnl" * 2' } });
  });

  it('removing the last calc row clears calcExpressions entirely', () => {
    const onChange = vi.fn();
    render(
      <StompSsrmFields cfg={{ ...VALID, calcExpressions: { ppu: '1' } }} onChange={onChange} />,
    );
    const card = screen.getByTestId('ssrm-calc-expressions');
    const buttons = within(card).getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]!); // the row's trash button
    expect(onChange).toHaveBeenCalledWith({ calcExpressions: undefined });
  });

  it('shows inline errors for a colliding calc name and a reserved prefix', () => {
    render(
      <StompSsrmFields
        cfg={{ ...VALID, calcExpressions: { positionId: '1', __ssrmX: '2' } }}
        onChange={() => {}}
      />,
    );
    const error = screen.getByTestId('ssrm-calc-expressions-error');
    expect(error.textContent).toMatch(/collides with a declared column/);
    expect(error.textContent).toMatch(/reserved '__ssrm' prefix/);
  });

  it('renders ordered tree levels; add/edit/remove patch treePathFields', () => {
    const onChange = vi.fn();
    render(
      <StompSsrmFields cfg={{ ...VALID, treePathFields: ['positionId'] }} onChange={onChange} />,
    );
    expect(screen.getByTestId('ssrm-tree-path-level-0')).toHaveProperty('value', 'positionId');

    fireEvent.click(screen.getByTestId('ssrm-tree-path-add'));
    expect(onChange).toHaveBeenCalledWith({ treePathFields: ['positionId', ''] });

    fireEvent.change(screen.getByTestId('ssrm-tree-path-level-0'), {
      target: { value: 'cusip' },
    });
    expect(onChange).toHaveBeenCalledWith({ treePathFields: ['cusip'] });
  });

  it('shows inline errors for duplicate and undeclared tree levels', () => {
    render(
      <StompSsrmFields
        cfg={{ ...VALID, treePathFields: ['positionId', 'positionId', 'nope'] }}
        onChange={() => {}}
      />,
    );
    const error = screen.getByTestId('ssrm-tree-path-fields-error');
    expect(error.textContent).toMatch(/repeated/);
    expect(error.textContent).toMatch(/must appear in the column definitions/);
  });

  // ─── S1: the knobs that were datasource-only arguments ────────────
  //
  // The bar for each is ROUND-TRIP: the card must render what the
  // catalog row holds and patch it back in the shape the row stores.

  it('renders weighted-mean rows and edits patch weightedAggregates', () => {
    const onChange = vi.fn();
    render(
      <StompSsrmFields
        cfg={{ ...WEIGHTED, weightedAggregates: { oas: 'dv01' } }}
        onChange={onChange}
      />,
    );
    const card = screen.getByTestId('ssrm-weighted-aggregates');
    expect(within(card).getByDisplayValue('oas')).toBeTruthy();
    expect(within(card).getByDisplayValue('dv01')).toBeTruthy();

    fireEvent.change(within(card).getByDisplayValue('dv01'), { target: { value: 'notional' } });
    expect(onChange).toHaveBeenCalledWith({ weightedAggregates: { oas: 'notional' } });
  });

  it('removing the last weighted row clears weightedAggregates entirely', () => {
    const onChange = vi.fn();
    render(
      <StompSsrmFields
        cfg={{ ...WEIGHTED, weightedAggregates: { oas: 'dv01' } }}
        onChange={onChange}
      />,
    );
    const card = screen.getByTestId('ssrm-weighted-aggregates');
    const buttons = within(card).getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]!); // the row's trash button
    expect(onChange).toHaveBeenCalledWith({ weightedAggregates: undefined });
  });

  it('shows the refusal inline when a weighted column has no weight', () => {
    render(
      <StompSsrmFields cfg={{ ...WEIGHTED, weightedAggregates: { oas: '' } }} onChange={() => {}} />,
    );
    expect(screen.getByTestId('ssrm-weighted-aggregates-error').textContent).toMatch(
      /never downgraded to a plain average/,
    );
  });

  it('shows inline errors for an undeclared and a non-numeric weight column', () => {
    const { rerender } = render(
      <StompSsrmFields
        cfg={{ ...WEIGHTED, weightedAggregates: { oas: 'notAColumn' } }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('ssrm-weighted-aggregates-error').textContent).toMatch(
      /must appear in the column definitions/,
    );
    rerender(
      <StompSsrmFields
        cfg={{ ...WEIGHTED, weightedAggregates: { oas: 'bookName' } }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('ssrm-weighted-aggregates-error').textContent).toMatch(
      /needs a numeric weight/,
    );
  });

  it('renders the tree parent column and edits patch treeParentField', () => {
    const onChange = vi.fn();
    render(<StompSsrmFields cfg={{ ...WEIGHTED, treeParentField: 'parentId' }} onChange={onChange} />);
    expect(screen.getByTestId('ssrm-tree-parent-field')).toHaveProperty('value', 'parentId');

    fireEvent.change(screen.getByTestId('ssrm-tree-parent-field'), {
      target: { value: 'bookName' },
    });
    expect(onChange).toHaveBeenCalledWith({ treeParentField: 'bookName' });
  });

  it('clearing the tree parent column drops the field rather than storing a blank', () => {
    const onChange = vi.fn();
    render(<StompSsrmFields cfg={{ ...WEIGHTED, treeParentField: 'parentId' }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('ssrm-tree-parent-field'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ treeParentField: undefined });
  });

  it('shows the two-tree-modes conflict under BOTH tree cards', () => {
    render(
      <StompSsrmFields
        cfg={{ ...WEIGHTED, treeParentField: 'parentId', treePathFields: ['bookName'] }}
        onChange={() => {}}
      />,
    );
    // Whichever card the user is looking at has to explain the refusal —
    // a precedence rule applied silently is the thing being prevented.
    expect(screen.getByTestId('ssrm-tree-parent-field-error').textContent).toMatch(/not both/);
    expect(screen.getByTestId('ssrm-tree-path-fields-error').textContent).toMatch(/not both/);
  });

  it('toggles projectDisplayedColumns on and back off', () => {
    const onChange = vi.fn();
    const { rerender } = render(<StompSsrmFields cfg={WEIGHTED} onChange={onChange} />);
    const toggle = screen.getByTestId('ssrm-project-displayed-columns');
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ projectDisplayedColumns: true });

    rerender(
      <StompSsrmFields cfg={{ ...WEIGHTED, projectDisplayedColumns: true }} onChange={onChange} />,
    );
    const on = screen.getByTestId('ssrm-project-displayed-columns');
    expect(on.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(on);
    // Dropped, not stored as `false` — absent and off mean the same
    // thing to the datasource, and the catalog row stays minimal.
    expect(onChange).toHaveBeenCalledWith({ projectDisplayedColumns: undefined });
  });

  it('renders always-projected columns; add/edit/remove patch alwaysProjectColumns', () => {
    const onChange = vi.fn();
    render(
      <StompSsrmFields
        cfg={{ ...WEIGHTED, projectDisplayedColumns: true, alwaysProjectColumns: ['dv01'] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('ssrm-always-project-column-0')).toHaveProperty('value', 'dv01');

    fireEvent.click(screen.getByTestId('ssrm-always-project-add'));
    expect(onChange).toHaveBeenCalledWith({ alwaysProjectColumns: ['dv01', ''] });

    fireEvent.change(screen.getByTestId('ssrm-always-project-column-0'), {
      target: { value: 'notional' },
    });
    expect(onChange).toHaveBeenCalledWith({ alwaysProjectColumns: ['notional'] });
  });

  it('shows an inline error for an undeclared always-projected column', () => {
    render(
      <StompSsrmFields
        cfg={{ ...WEIGHTED, alwaysProjectColumns: ['notAColumn'] }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('ssrm-always-project-columns-error').textContent).toMatch(
      /must appear in the column definitions/,
    );
  });

  it('shows no errors for a row exercising every new knob at once', () => {
    render(
      <StompSsrmFields
        cfg={{
          ...WEIGHTED,
          weightedAggregates: { oas: 'dv01' },
          treeParentField: 'parentId',
          projectDisplayedColumns: true,
          alwaysProjectColumns: ['notional'],
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('wide-gate inputs patch the config and show malformed-value errors', () => {
    const onChange = vi.fn();
    const { rerender } = render(<StompSsrmFields cfg={VALID} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('ssrm-wide-column-threshold'), {
      target: { value: '120' },
    });
    expect(onChange).toHaveBeenCalledWith({ wideColumnThreshold: 120 });
    fireEvent.change(screen.getByTestId('ssrm-sweep-throttle-wide'), {
      target: { value: '2000' },
    });
    expect(onChange).toHaveBeenCalledWith({ sweepThrottleWideMs: 2000 });

    rerender(
      <StompSsrmFields cfg={{ ...VALID, wideColumnThreshold: 0 }} onChange={onChange} />,
    );
    expect(screen.getByTestId('ssrm-wide-gate-error').textContent).toMatch(
      /positive whole number/,
    );
  });
});
