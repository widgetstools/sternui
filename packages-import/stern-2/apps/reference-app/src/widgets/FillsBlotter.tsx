import React from 'react';
import { SimpleBlotter } from '@stern/widgets';

/**
 * FillsBlotter — a SimpleBlotter configured for fills data.
 */
export const FillsBlotter: React.FC<{ configId: string }> = ({ configId }) => (
  <SimpleBlotter configId={configId} />
);
