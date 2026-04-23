import React from 'react';
import { SimpleBlotter } from '@stern/widgets';
import type { SimpleBlotterProps, BlotterSlots, BlotterSlotContext } from '@stern/widgets';

/**
 * OrdersBlotter — an extended SimpleBlotter with custom header and footer slots.
 * Demonstrates the composition pattern for creating specialized widget variants.
 */

const orderSlots: BlotterSlots = {
  header: ({ widget }: BlotterSlotContext) => (
    <div className="px-3 py-1 text-xs font-medium text-muted-foreground border-b border-border bg-card/50">
      Orders — {widget.config?.name || 'Untitled'}
      {widget.configSource === 'inherited' && widget.inheritedFrom && (
        <span className="ml-2 italic text-muted-foreground/70">
          (inherited from {widget.inheritedFrom})
        </span>
      )}
    </div>
  ),
  footer: ({ selectedRows }: BlotterSlotContext) => (
    <div className="px-3 py-1 text-xs text-muted-foreground border-t border-border bg-card/50 flex justify-between">
      <span>{selectedRows.length} selected</span>
    </div>
  ),
};

export const OrdersBlotter: React.FC<{ configId: string }> = ({ configId }) => (
  <SimpleBlotter configId={configId} slots={orderSlots} />
);
