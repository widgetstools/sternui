import { useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Input,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@starui/ui';

/**
 * List grid for the editor screens. Delivers Decision 12.6's user-facing
 * benefit (filter / sort / paginate, click-to-edit) on shadcn primitives
 * — same look-and-feel as the rest of the editor surface.
 *
 * Decision 12.6 also promotes "eat our own dog food" via `MarketsGrid`.
 * That swap is queued as a follow-up because adding the AG-Grid stack
 * to this engine-agnostic package brings a heavy peer-dep tail and a
 * separate test-mocking story; the user-visible behavior delivered here
 * (filter row, sortable headers, page nav) matches the MarketsGrid
 * outcome.
 */

export interface EditorTableColumn<TRow> {
  /** Stable key — used as React key + sort key. */
  key: string;
  /** Header label. */
  header: string;
  /** Cell renderer. Receives the row; default is `String(row[key])`. */
  cell?: (row: TRow) => ReactNode;
  /** Value used for sort / filter when non-string. Defaults to `String(cell())`. */
  sortValue?: (row: TRow) => string | number;
  /** Disable sort on this column. */
  notSortable?: boolean;
  /** Width for the header (e.g. `'12rem'`, `'auto'`). */
  width?: string;
  /** Tailwind alignment class (e.g. `'text-right'`). */
  align?: 'left' | 'right' | 'center';
  /** When true, the column is hidden from filter targeting. */
  excludeFromFilter?: boolean;
}

export interface EditorDataTableProps<TRow> {
  rows: readonly TRow[];
  columns: ReadonlyArray<EditorTableColumn<TRow>>;
  /** Stable id per row — used as React key and as the test-id seed. */
  rowKey: (row: TRow) => string;
  /** Click → open the edit drawer. Optional — row stays read-only when omitted. */
  onEditRow?: (row: TRow) => void;
  /** Empty-state copy. */
  emptyMessage?: string;
  /**
   * Test-id seed — e.g. `'role'` produces:
   *  - `role-row-{key}` per row
   *  - `role-edit-{key}` per edit button
   *  - `role-filter`, `role-page-size`, `role-page-prev`, `role-page-next`,
   *    `role-sort-{column}` for control surfaces.
   */
  testIdPrefix?: string;
  /** Hide the filter row. Defaults to false. */
  hideFilter?: boolean;
  /** Page size options. Defaults to `[10, 25, 50]`. */
  pageSizeOptions?: readonly number[];
  /** Initial page size. Defaults to first option. */
  defaultPageSize?: number;
}

interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

function readSortValue<TRow>(
  col: EditorTableColumn<TRow>,
  row: TRow,
): string | number {
  if (col.sortValue) return col.sortValue(row);
  const node = col.cell ? col.cell(row) : (row as Record<string, unknown>)[col.key];
  return typeof node === 'number' ? node : String(node ?? '');
}

function readFilterableText<TRow>(
  col: EditorTableColumn<TRow>,
  row: TRow,
): string {
  if (col.excludeFromFilter) return '';
  return String(readSortValue(col, row)).toLowerCase();
}

function alignClass(align: EditorTableColumn<unknown>['align']): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return '';
}

export function EditorDataTable<TRow>({
  rows,
  columns,
  rowKey,
  onEditRow,
  emptyMessage = 'No items.',
  testIdPrefix,
  hideFilter,
  pageSizeOptions = [10, 25, 50],
  defaultPageSize,
}: EditorDataTableProps<TRow>) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(
    defaultPageSize ?? pageSizeOptions[0] ?? 10,
  );

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle.length === 0) return rows;
    return rows.filter((row) =>
      columns.some((col) => readFilterableText(col, row).includes(needle)),
    );
  }, [rows, columns, filter]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col || col.notSortable) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = readSortValue(col, a);
      const bv = readSortValue(col, b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return copy;
  }, [filtered, sort, columns]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIdx = (safePage - 1) * pageSize;
  const visible = sorted.slice(startIdx, startIdx + pageSize);

  function toggleSort(key: string, sortable: boolean) {
    if (!sortable) return;
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  }

  return (
    <div className="flex flex-col">
      {hideFilter ? null : (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
          <Input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Filter…"
            className="h-8 w-64"
            data-testid={
              testIdPrefix ? `${testIdPrefix}-filter` : undefined
            }
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {total} {total === 1 ? 'row' : 'rows'}
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger
                className="h-8 w-24"
                data-testid={
                  testIdPrefix ? `${testIdPrefix}-page-size` : undefined
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const sortable = !col.notSortable;
              const active = sort?.key === col.key;
              const arrow = active ? (sort?.direction === 'asc' ? '↑' : '↓') : '';
              return (
                <TableHead
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={alignClass(col.align)}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key, sortable)}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                      data-testid={
                        testIdPrefix
                          ? `${testIdPrefix}-sort-${col.key}`
                          : undefined
                      }
                    >
                      {col.header}
                      {arrow ? (
                        <span className="text-xs text-muted-foreground">
                          {arrow}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
            {onEditRow ? <TableHead className="w-24" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (onEditRow ? 1 : 0)}
                className="text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => {
              const key = rowKey(row);
              return (
                <TableRow
                  key={key}
                  data-testid={
                    testIdPrefix ? `${testIdPrefix}-row-${key}` : undefined
                  }
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={alignClass(col.align)}>
                      {col.cell
                        ? col.cell(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </TableCell>
                  ))}
                  {onEditRow ? (
                    <TableCell>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="px-0"
                        onClick={() => onEditRow(row)}
                        data-testid={
                          testIdPrefix ? `${testIdPrefix}-edit-${key}` : undefined
                        }
                      >
                        Edit
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {pageCount > 1 ? (
        <div className="flex items-center justify-end px-3 py-2 border-t border-border">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  data-testid={
                    testIdPrefix ? `${testIdPrefix}-page-prev` : undefined
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive>
                  {safePage}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <span className="px-2 text-xs text-muted-foreground">
                  / {pageCount}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.min(pageCount, p + 1));
                  }}
                  data-testid={
                    testIdPrefix ? `${testIdPrefix}-page-next` : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </div>
  );
}
