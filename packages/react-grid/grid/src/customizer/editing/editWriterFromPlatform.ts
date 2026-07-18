import type { EditGridWriter } from '@wellsfargo-starui/engine';

type Tx = { add?: unknown[]; update?: unknown[]; remove?: unknown[] };

type ApiLike = {
  getRowNode?: (id: string) => { data?: unknown } | null | undefined;
  // Parameter types must be *wider* than GridApi so GridPlatform is assignable.
  applyTransactionAsync?: (tx: { update?: unknown[] }) => unknown;
};

type PlatformLike = {
  api: { api: ApiLike | null };
  applyDataTransaction?: (tx: Tx) => void;
};

/**
 * Build an {@link EditGridWriter} that prefers the host data-transaction
 * router (SSRM Perspective + RowChangeBus) when `platform.applyDataTransaction`
 * is present.
 */
export function editWriterFromPlatform(platform: PlatformLike): EditGridWriter | null {
  const api = platform.api.api;
  if (!api?.getRowNode) return null;

  return {
    getRowNode(id: string) {
      const node = api.getRowNode?.(id);
      if (!node) return undefined;
      const data = node.data;
      return {
        data:
          data && typeof data === 'object'
            ? (data as Record<string, unknown>)
            : undefined,
      };
    },
    async applyTransactionAsync(tx: { update: Record<string, unknown>[] }) {
      if (platform.applyDataTransaction) {
        platform.applyDataTransaction(tx);
        return;
      }
      await Promise.resolve(api.applyTransactionAsync?.(tx));
    },
  };
}
