/**
 * StompSsrmFields — the dedicated SSRM editor surface renders exactly
 * the pull-plane fields and shows `validateStompSsrmConfig` issues
 * inline (blank keyColumn being the canonical case: a fresh draft is
 * born invalid and the editor must say so, not hide it).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    // Push-plane vocabulary must not leak into the SSRM editor.
    expect(screen.queryByText(/throttle/i)).toBeNull();
    expect(screen.queryByText(/conflat/i)).toBeNull();
    expect(screen.queryByText(/wire format/i)).toBeNull();
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
});
