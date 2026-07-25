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
