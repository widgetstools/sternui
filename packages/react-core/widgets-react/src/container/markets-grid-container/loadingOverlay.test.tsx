/**
 * MarketsGridLoadingOverlay — subtitle wording per data plane. Pull mode
 * must not claim rows are being fetched into the window (the dataset lives
 * in the worker-hosted shared table; the window only reads viewports).
 */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketsGridLoadingOverlay } from './LoadingOverlay.js';

describe('MarketsGridLoadingOverlay', () => {
  it('push + rowCount → snapshot buffering wording', () => {
    render(<MarketsGridLoadingOverlay rowCount={1234} />);
    expect(
      screen.getByText('Buffering snapshot · 1,234 rows received'),
    ).toBeTruthy();
  });

  it('pull + rowCount → shared-table wording, no "received into this window" claim', () => {
    render(<MarketsGridLoadingOverlay rowCount={1234} dataPlane="pull" />);
    expect(
      screen.getByText('Loading shared data table · 1,234 rows'),
    ).toBeTruthy();
  });

  it('pull without a count → connecting to the shared table', () => {
    render(<MarketsGridLoadingOverlay dataPlane="pull" />);
    expect(
      screen.getByText('Connecting to the shared data table…'),
    ).toBeTruthy();
  });

  it('an explicit message always wins', () => {
    render(
      <MarketsGridLoadingOverlay
        rowCount={5}
        dataPlane="pull"
        message="Re-syncing shared data table…"
      />,
    );
    expect(screen.getByText('Re-syncing shared data table…')).toBeTruthy();
  });
});
