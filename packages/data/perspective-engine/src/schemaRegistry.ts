/**
 * Per-provider table metadata — schema and index column inferred from
 * incoming rows when a Perspective table is first created.
 */

export type SchemaType = 'string' | 'integer' | 'float' | 'boolean' | 'date';

export interface ProviderTableMeta {
  readonly providerId: string;
  readonly schema: Record<string, SchemaType>;
  readonly indexColumn: string;
}

const registry = new Map<string, ProviderTableMeta>();

function inferType(value: unknown): SchemaType {
  if (value == null) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'float';
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    const asNum = Number(value);
    if (value !== '' && Number.isFinite(asNum)) {
      return Number.isInteger(asNum) ? 'integer' : 'float';
    }
    return 'string';
  }
  return 'string';
}

export function inferSchemaFromRows(
  rows: Record<string, unknown>[],
  indexColumn?: string,
): { schema: Record<string, SchemaType>; indexColumn: string } {
  const schema: Record<string, SchemaType> = {};
  const sample = rows.find((r) => r && Object.keys(r).length > 0) ?? rows[0];
  if (sample) {
    for (const [key, value] of Object.entries(sample)) {
      schema[key] = inferType(value);
    }
  }
  const resolvedIndex =
    indexColumn && indexColumn in schema
      ? indexColumn
      : indexColumn
        ? indexColumn
        : 'id' in schema
          ? 'id'
          : Object.keys(schema)[0] ?? '__row_id';
  if (!(resolvedIndex in schema)) {
    schema[resolvedIndex] = 'string';
  }
  return { schema, indexColumn: resolvedIndex };
}

export function registerProviderTableMeta(meta: ProviderTableMeta): void {
  registry.set(meta.providerId, meta);
}

export function getProviderTableMeta(providerId: string): ProviderTableMeta | undefined {
  return registry.get(providerId);
}

export function getSchema(providerId: string): Record<string, SchemaType> {
  return registry.get(providerId)?.schema ?? {};
}

export function getIndexColumn(providerId: string): string {
  return registry.get(providerId)?.indexColumn ?? 'id';
}

export function getStringColumns(providerId: string): string[] {
  const schema = getSchema(providerId);
  return Object.entries(schema)
    .filter(([, t]) => t === 'string')
    .map(([k]) => k);
}

export function getLeafColumns(providerId: string): string[] {
  return Object.keys(getSchema(providerId)).sort();
}

export function clearProviderTableMeta(providerId: string): void {
  registry.delete(providerId);
}
