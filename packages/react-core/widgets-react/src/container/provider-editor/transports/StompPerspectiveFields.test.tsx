import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

// This package has no global auto-cleanup, so mounted trees would otherwise
// accumulate and every getBy* would find duplicates from earlier tests.
afterEach(cleanup);
import type { StompPerspectiveProviderConfig } from '@starui/shared-types';
import { StompPerspectiveFields } from './StompPerspectiveFields.js';

const cfg = (over: Partial<StompPerspectiveProviderConfig> = {}) =>
  ({
    providerType: 'stomp-perspective',
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: '/snapshot/positions/T1',
    keyColumn: 'positionId',
    ...over,
  }) as StompPerspectiveProviderConfig;

describe('StompPerspectiveFields', () => {
  it('reuses the STOMP wire fields rather than duplicating them', () => {
    // One editor to keep in step with the transport.
    render(<StompPerspectiveFields cfg={cfg()} onChange={() => {}} />);
    expect(screen.getByDisplayValue('ws://localhost:8081')).toBeTruthy();
    expect(screen.getByDisplayValue('/snapshot/positions/T1')).toBeTruthy();
  });

  it('edits the table name', () => {
    const onChange = vi.fn();
    render(<StompPerspectiveFields cfg={cfg()} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('defaults to the provider id'), {
      target: { value: 'blotter' },
    });
    expect(onChange).toHaveBeenCalledWith({ tableName: 'blotter' });
  });

  it('parses the integer-column list, tolerating spaces and a trailing comma', () => {
    const onChange = vi.fn();
    render(<StompPerspectiveFields cfg={cfg()} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('couponFrequency, lotSize'), {
      target: { value: ' couponFrequency , lotSize, ' },
    });
    expect(onChange).toHaveBeenCalledWith({ integerColumns: ['couponFrequency', 'lotSize'] });
  });

  it('warns when the key column is composite, which cannot index a Table', () => {
    // Rather than silently serving the push path with no explanation.
    render(
      <StompPerspectiveFields cfg={cfg({ keyColumn: ['bookId', 'positionId'] })} onChange={() => {}} />,
    );
    expect(screen.getByText(/Key Column is composite/)).toBeTruthy();
  });

  it('does not warn for a single key column', () => {
    render(<StompPerspectiveFields cfg={cfg()} onChange={() => {}} />);
    expect(screen.queryByText(/Key Column is composite/)).toBeNull();
  });

  it('treats date inference as on unless explicitly disabled', () => {
    const { rerender } = render(<StompPerspectiveFields cfg={cfg()} onChange={() => {}} />);
    expect(screen.getByText('ISO strings → date / datetime')).toBeTruthy();

    rerender(<StompPerspectiveFields cfg={cfg({ inferDates: false })} onChange={() => {}} />);
    expect(screen.getByText('keep as text')).toBeTruthy();
  });
});
