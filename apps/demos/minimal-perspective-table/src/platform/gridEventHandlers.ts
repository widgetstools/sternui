import type { MarketsGridEventHandlerRegistry } from '@starui/grid';

export const gridEventHandlers: MarketsGridEventHandlerRegistry = {
  'log-profile-saved': (payload) => {
    // eslint-disable-next-line no-console
    console.log('[perspective-blotter] profile saved', payload);
  },
  'alert-provider-error': (payload, ctx) => {
    const statusPayload = payload as { status?: string; error?: string; providerId?: string | null };
    if (statusPayload.status !== 'error' && !statusPayload.error) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[perspective-blotter] provider error grid=${ctx.gridId} provider=${statusPayload.providerId ?? '—'}:`,
      statusPayload.error ?? statusPayload.status,
    );
  },
};
