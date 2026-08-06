import { describe, expect, it, vi } from 'vitest';
import { withServerSetFilterValues } from './serverSetFilterValues.js';

/** Drive the `values` callback AG would call and capture what it is handed. */
async function resolveValues(def: Record<string, unknown>): Promise<unknown[]> {
  const params = (def.filterParams ?? {}) as {
    values?: (p: { success(v: unknown[]): void }) => void;
  };
  return new Promise((resolve) => {
    params.values!({ success: resolve });
  });
}

describe('withServerSetFilterValues', () => {
  it('attaches an async values provider keyed on the column', async () => {
    const getValues = vi.fn(async (colId: string) => [`${colId}-a`, `${colId}-b`]);
    const [region] = withServerSetFilterValues(
      [{ field: 'region', filter: true }],
      getValues,
    ) as Record<string, unknown>[];

    await expect(resolveValues(region)).resolves.toEqual(['region-a', 'region-b']);
    expect(getValues).toHaveBeenCalledWith('region');
  });

  it('resolves EMPTY when the engine has no honest list', async () => {
    // Null means past the cardinality ceiling, or the read failed. A partial
    // list would render as the whole domain and its Select All would silently
    // exclude the rest.
    const [def] = withServerSetFilterValues(
      [{ field: 'positionId', filter: true }],
      async () => null,
    ) as Record<string, unknown>[];

    await expect(resolveValues(def)).resolves.toEqual([]);
  });

  it('resolves EMPTY rather than hanging when the provider rejects', async () => {
    // AG shows a perpetual loading spinner if `success` is never called.
    const [def] = withServerSetFilterValues(
      [{ field: 'region', filter: true }],
      async () => {
        throw new Error('engine busy');
      },
    ) as Record<string, unknown>[];

    await expect(resolveValues(def)).resolves.toEqual([]);
  });

  it('sets suppressClearModelOnRefreshValues — a refresh must not wipe a selection', () => {
    const [def] = withServerSetFilterValues(
      [{ field: 'region' }],
      async () => [],
    ) as Record<string, unknown>[];
    const params = def.filterParams as Record<string, unknown>;
    expect(params.suppressClearModelOnRefreshValues).toBe(true);
  });

  it('never overwrites a values list the caller already supplied', () => {
    // An explicit list is a deliberate choice — a fixed domain, a curated
    // subset — and outranks whatever the book happens to contain.
    const explicit = ['Only', 'These'];
    const [def] = withServerSetFilterValues(
      [{ field: 'region', filterParams: { values: explicit } }],
      async () => ['from-the-book'],
    ) as Record<string, unknown>[];

    expect((def.filterParams as Record<string, unknown>).values).toBe(explicit);
  });

  it('walks column-group children', async () => {
    const [group] = withServerSetFilterValues(
      [{ headerName: 'Risk', children: [{ field: 'dv01' }, { field: 'cs01' }] }],
      async (colId) => [colId],
    ) as Record<string, unknown>[];

    const kids = group.children as Record<string, unknown>[];
    await expect(resolveValues(kids[0])).resolves.toEqual(['dv01']);
    await expect(resolveValues(kids[1])).resolves.toEqual(['cs01']);
  });

  it('falls back to colId when there is no field', async () => {
    const [def] = withServerSetFilterValues(
      [{ colId: 'computed' }],
      async (colId) => [colId],
    ) as Record<string, unknown>[];
    await expect(resolveValues(def)).resolves.toEqual(['computed']);
  });

  it('leaves a def with no column identity untouched', () => {
    const bare = { headerName: 'Spacer' };
    expect(withServerSetFilterValues([bare], async () => [])[0]).toBe(bare);
  });

  it('preserves every other colDef key', () => {
    const [def] = withServerSetFilterValues(
      [{ field: 'pnl', headerName: 'P&L', width: 120, filterParams: { debounceMs: 5 } }],
      async () => [],
    ) as Record<string, unknown>[];

    expect(def.headerName).toBe('P&L');
    expect(def.width).toBe(120);
    expect((def.filterParams as Record<string, unknown>).debounceMs).toBe(5);
  });

  it('does not mutate the input defs', () => {
    const input = [{ field: 'region' }] as Record<string, unknown>[];
    withServerSetFilterValues(input, async () => []);
    expect(input[0].filterParams).toBeUndefined();
  });
});
