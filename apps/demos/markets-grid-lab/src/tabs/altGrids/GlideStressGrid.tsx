import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataEditor, {
  GridCellKind,
  type GridCell,
  type GridColumn,
  type Item,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import type { ColDef } from 'ag-grid-community';
import type { LabRow } from '../../data/types';
import { cellText, toAltFieldColumns } from './altFieldColumns';

export type GlideStressGridProps = {
  rowData: LabRow[];
  columnDefs: ColDef<LabRow>[];
};

/**
 * Glide Data Grid — canvas-backed cells; strong paint throughput for wide/tall books.
 */
export function GlideStressGrid({ rowData, columnDefs }: GlideStressGridProps) {
  const fields = useMemo(() => toAltFieldColumns(columnDefs), [columnDefs]);
  const columns = useMemo<GridColumn[]>(
    () =>
      fields.map((f) => ({
        id: f.id,
        title: f.title,
        width: Math.max(72, f.width),
      })),
    [fields],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ w: Math.max(1, Math.floor(cr.width)), h: Math.max(1, Math.floor(cr.height)) });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const field = fields[col]?.field ?? '';
      const text = cellText(rowData[row], field);
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: false,
      };
    },
    [fields, rowData],
  );

  return (
    <div
      ref={wrapRef}
      className="h-full min-h-0 w-full overflow-hidden bg-[#1b2330]"
      data-testid="glide-stress-grid"
    >
      <DataEditor
        columns={columns}
        rows={rowData.length}
        getCellContent={getCellContent}
        width={size.w}
        height={size.h}
        rowMarkers="number"
        smoothScrollX
        smoothScrollY
        getCellsForSelection
        keybindings={{ search: true }}
      />
    </div>
  );
}
