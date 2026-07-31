import { useEffect, useRef } from 'react';
import type { ColDef } from 'ag-grid-community';
import type { LabRow } from '../../data/types';
import { toAltFieldColumns, toPerspectiveRows } from './altFieldColumns';
import './perspective-jsx.d.ts';

type PerspectiveViewerEl = HTMLElement & {
  load: (table: unknown) => Promise<void>;
  restore?: (config: Record<string, unknown>) => Promise<void>;
};

type PerspectiveRow = Record<string, string | number | boolean | null>;

type PerspectiveTable = {
  update: (rows: PerspectiveRow[]) => Promise<unknown>;
  replace: (rows: PerspectiveRow[]) => Promise<unknown>;
  delete: () => Promise<unknown>;
};

type PerspectiveApi = {
  worker: () => Promise<{ table: (data: unknown) => Promise<PerspectiveTable> }>;
};

/** One-shot load — customElements.define must not run twice (StrictMode / remount). */
let perspectiveBoot: Promise<PerspectiveApi> | null = null;

async function bootPerspective(): Promise<PerspectiveApi> {
  if (!perspectiveBoot) {
    perspectiveBoot = (async () => {
      const [{ default: perspective }, { default: perspectiveViewer }] =
        await Promise.all([
          import('@finos/perspective'),
          import('@finos/perspective-viewer'),
          import('@finos/perspective-viewer-datagrid'),
        ]);
      await import('@finos/perspective-viewer/dist/css/pro-dark.css');

      const SERVER_WASM = (
        await import('@finos/perspective/dist/wasm/perspective-server.wasm?url')
      ).default;
      const CLIENT_WASM = (
        await import(
          '@finos/perspective-viewer/dist/wasm/perspective-viewer.wasm?url'
        )
      ).default;

      await Promise.all([
        perspective.init_server(fetch(SERVER_WASM)),
        perspectiveViewer.init_client(fetch(CLIENT_WASM)),
      ]);

      return perspective as PerspectiveApi;
    })().catch((err) => {
      perspectiveBoot = null;
      throw err;
    });
  }
  return perspectiveBoot;
}

function waitForRows(
  getRows: () => LabRow[],
  cancelled: () => boolean,
): Promise<LabRow[]> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      if (cancelled()) {
        reject(new Error('cancelled'));
        return;
      }
      const rows = getRows();
      if (rows.length > 0) {
        resolve(rows);
        return;
      }
      if (performance.now() - start > 60_000) {
        reject(new Error('timed out waiting for rowData'));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export type PerspectiveStressGridProps = {
  rowData: LabRow[];
  columnDefs: ColDef<LabRow>[];
};

/**
 * FINOS Perspective viewer (datagrid) — engine stays columnar; good long-run
 * scroll/tick contrast vs AG Grid row objects.
 */
export function PerspectiveStressGrid({
  rowData,
  columnDefs,
}: PerspectiveStressGridProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<PerspectiveTable | null>(null);
  const readyRef = useRef(false);
  const cols = toAltFieldColumns(columnDefs);
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const rowDataRef = useRef(rowData);
  rowDataRef.current = rowData;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const perspective = await bootPerspective();
      if (cancelled || !hostRef.current) return;

      // Create table from real rows so schema matches the stress book.
      const rawSeed = await waitForRows(
        () => rowDataRef.current,
        () => cancelled,
      );
      if (cancelled || !hostRef.current) return;

      const fields = colsRef.current;
      const seed = toPerspectiveRows(rawSeed, fields);

      hostRef.current.replaceChildren();
      const viewer = document.createElement(
        'perspective-viewer',
      ) as PerspectiveViewerEl;
      viewer.setAttribute('theme', 'Pro Dark');
      viewer.style.width = '100%';
      viewer.style.height = '100%';
      hostRef.current.appendChild(viewer);

      const worker = await perspective.worker();
      if (cancelled) return;

      const table = await worker.table(seed);
      tableRef.current = table;
      await viewer.load(table);
      await viewer.restore?.({
        plugin: 'Datagrid',
        columns: fields.slice(0, 24).map((c) => c.field),
      });
      readyRef.current = true;

      // Sync if React replaced rowData while we were booting.
      const latest = rowDataRef.current;
      if (latest !== rawSeed && latest.length > 0) {
        await table.replace(toPerspectiveRows(latest, fields));
      }
    })().catch((err) => {
      if ((err as Error)?.message === 'cancelled') return;
      console.error('[PerspectiveStressGrid] init failed', err);
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      void tableRef.current?.delete?.();
      tableRef.current = null;
      if (hostRef.current) hostRef.current.replaceChildren();
    };
    // Mount once; row updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!readyRef.current || !tableRef.current || rowData.length === 0) return;
    void tableRef.current
      .replace(toPerspectiveRows(rowData, colsRef.current))
      .catch((err) => {
        console.error('[PerspectiveStressGrid] replace failed', err);
      });
  }, [rowData]);

  return (
    <div
      ref={hostRef}
      className="h-full min-h-0 w-full"
      data-testid="perspective-stress-grid"
    />
  );
}
