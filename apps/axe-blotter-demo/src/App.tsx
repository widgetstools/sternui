/**
 * Wires MarketsGrid + the edit subsystem + chrome together.
 *
 * Showcase pattern: take the imperative `MarketsGridHandle` (handed to
 * us via `onReady`), then drive everything through it — gridApi for
 * the edit pipeline, platform for the styled profile, profiles for
 * persistence. None of the sophisticated behavior on screen requires
 * the Cockpit settings UI to exist.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { MarketsGrid, type MarketsGridHandle } from '@starui/markets-grid';

import { SEED_ROWS, type AxeRow } from './data';
import { buildBaseColumns } from './columns';
import {
  EditCoordinator,
  PendingEditBuffer,
  UndoStack,
  syncBufferToRows,
  type LogKind,
} from './editing';
import { startPeerPricing, type StreamingHandle } from './streaming';
import { applyAxeProfile } from './buildAxeProfile';
import { HeaderBar, Sidebar, Toolbar, Toast, PendingStatusBar, type LogEntry } from './chrome';
import { DiffModal } from './DiffModal';

// ─── AG-Grid theme (dark, dense — matches the HTML reference) ──────────

const blotterTheme = themeQuartz.withParams({
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  headerFontSize: 10,
  iconSize: 11,
  cellHorizontalPaddingScale: 0.6,
  wrapperBorder: false,
  columnBorder: true,
  spacing: 5,
  borderRadius: 0,
  wrapperBorderRadius: 0,
  backgroundColor: '#0d1014',
  foregroundColor: '#d8dee9',
  headerBackgroundColor: '#1c2230',
  headerTextColor: '#8b95a7',
  oddRowBackgroundColor: '#0d1014',
  rowHoverColor: '#14181f',
  selectedRowBackgroundColor: '#ffb45422',
  rangeSelectionBackgroundColor: 'rgba(255,180,84,0.12)',
  rangeSelectionBorderColor: '#ffb454',
  borderColor: '#1e2532',
});

// ─── Component ─────────────────────────────────────────────────────────

export function App() {
  // ── Live row data — kept as state so re-renders observe the seed.
  // Mutations from the streamer go through gridApi.applyTransactionAsync,
  // not via setState (the grid is the source of truth post-mount).
  const rowData = useMemo<AxeRow[]>(() => SEED_ROWS.map((r) => ({ ...r })), []);

  // ── Edit subsystem — single instance per session. useRef (not useMemo)
  //    so React 19 StrictMode's mount/unmount/mount dance can't spawn
  //    two parallel buffers (which causes the streamer to write to one
  //    instance while the chrome subscribes to another → "N pending
  //    across 0 rows" ghost state).
  const bufferRef = useRef<PendingEditBuffer | null>(null);
  if (!bufferRef.current) bufferRef.current = new PendingEditBuffer();
  const buffer = bufferRef.current;

  const undoRef = useRef<UndoStack | null>(null);
  if (!undoRef.current) undoRef.current = new UndoStack();
  const undoStack = undoRef.current;
  const coordinatorRef = useRef<EditCoordinator | null>(null);
  const gridApiRef = useRef<GridApi<AxeRow> | null>(null);
  const streamRef = useRef<StreamingHandle | null>(null);

  // ── Chrome state.
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRowCount, setPendingRowCount] = useState(0);
  const [hasWarn, setHasWarn] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [streamPaused, setStreamPaused] = useState(false);
  const [diffVisible, setDiffVisible] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [toast, setToast] = useState<{ msg: string; kind?: 'danger' | 'success'; visible: boolean }>({
    msg: '',
    visible: false,
  });

  // ── Logging + toast helpers. Stable identity so they pass cleanly
  //    into the coordinator (which captures them once).
  const log = useCallback((kind: LogKind, msg: string, detail?: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogEntries((prev) => [{ time, kind, msg, detail }, ...prev].slice(0, 60));
  }, []);
  const showToast = useCallback((msg: string, kind?: 'danger' | 'success') => {
    setToast({ msg, kind, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2200);
  }, []);

  // ── Subscribe to buffer + undo state for chrome counters.
  useEffect(() => {
    // Console handles for inspection — `window.__axeBuffer.all()` /
    // `__axeCoord.stage({...})` from DevTools so showcase visitors can
    // poke at the edit subsystem without rebuilding.
    (window as unknown as { __axeBuffer?: unknown }).__axeBuffer = buffer;
    const u1 = buffer.subscribe(() => {
      const all = buffer.all();
      setPendingCount(all.length);
      setPendingRowCount(new Set(all.map((e) => e.rowId)).size);
      setHasWarn(all.some((e) => !!e.warn));
      setHasConflict(all.some((e) => !!e.conflict));
      // Sync buffer state onto each row's __p_<col> shadow field so the
      // MarketsGrid conditional-styling rules (in buildAxeProfile.ts)
      // can pattern-match cell state through the standard ExpressionEngine
      // context. Push as a transaction so AG-Grid re-evaluates rules.
      const changed = syncBufferToRows(buffer, rowData);
      const api = gridApiRef.current;
      if (api && changed.length > 0) api.applyTransactionAsync({ update: changed });
      // Note column reads buffer directly (not row data) so still needs
      // a force refresh.
      api?.refreshCells({ columns: ['note'], force: true });
    });
    const u2 = undoStack.subscribe(() => {
      setCanUndo(undoStack.canUndo());
      setCanRedo(undoStack.canRedo());
    });
    return () => { u1(); u2(); };
  }, [buffer, undoStack]);

  // ── Build column defs once. The pendingValueGetter/Setter close
  //    over `coordinatorRef` so they pick it up after onReady fires.
  const columnDefs = useMemo(
    () => buildBaseColumns({
      buffer,
      getCoordinator: () => coordinatorRef.current,
    }),
    [buffer],
  );

  // ── Once the grid is ready we have everything we need: build the
  //    coordinator, programmatically apply the styled profile, kick
  //    off streaming. This is the "API instead of UI" punchline.
  const onReady = useCallback((handle: MarketsGridHandle) => {
    gridApiRef.current = handle.gridApi as GridApi<AxeRow>;
    coordinatorRef.current = new EditCoordinator(buffer, undoStack, handle.gridApi, log, showToast);
    coordinatorRef.current.setRows(rowData);
    (window as unknown as { __axeCoord?: unknown }).__axeCoord = coordinatorRef.current;

    // ★ Apply the entire visual profile via the module-system API —
    //   no Cockpit clicks. Header renames, alignment, locked cols,
    //   the calculated "P&L vs Model" column, and 5 conditional
    //   styling rules are all set in one shot.
    applyAxeProfile(handle.platform);

    log('intent', 'Grid ready · 10 rows seeded · axe profile applied via API',
        'IG corporate axe blotter — try editing a Bid');

    // Start the peer-pricing engine.
    streamRef.current = startPeerPricing({
      gridApi: handle.gridApi,
      coordinator: coordinatorRef.current,
      buffer,
      rows: rowData,
      log,
    });
  }, [buffer, undoStack, log, showToast, rowData]);

  // ── Cleanup on unmount.
  useEffect(() => {
    return () => streamRef.current?.stop();
  }, []);

  // ── Toolbar + keyboard handlers — all delegate to the coordinator.
  const tickUp   = useCallback((mult = 1) => coordinatorRef.current?.tickRange('up', mult),   []);
  const tickDown = useCallback((mult = 1) => coordinatorRef.current?.tickRange('down', mult), []);
  const undoOne  = useCallback(() => coordinatorRef.current?.undoOne(), []);
  const redoOne  = useCallback(() => coordinatorRef.current?.redoOne(), []);
  const commit   = useCallback(() => coordinatorRef.current?.commit(), []);
  const cancel   = useCallback(() => coordinatorRef.current?.cancel(), []);
  const togglePause = useCallback(() => {
    setStreamPaused((p) => {
      const next = !p;
      streamRef.current?.setPaused(next);
      return next;
    });
  }, []);

  // ── Global keymap (matches the HTML reference). AG-Grid's
  //    `suppressKeyboardEvent` on each ColDef tells AG-Grid to let
  //    these keys bubble to document level.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inEditor = !!document.querySelector('.ag-cell-edit-input:focus, .ag-cell-edit-wrapper input:focus');
      if (e.altKey && e.key === 'ArrowUp')   { e.preventDefault(); tickUp(e.shiftKey ? 5 : 1); }
      else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); tickDown(e.shiftKey ? 5 : 1); }
      else if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !inEditor) { e.preventDefault(); undoOne(); }
      else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y') && !inEditor) { e.preventDefault(); redoOne(); }
      else if (e.ctrlKey && e.key === 'Enter' && !inEditor) { e.preventDefault(); commit(); }
      else if (e.key === 'Escape' && !inEditor && buffer.size() > 0) { e.preventDefault(); cancel(); }
      else if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (buffer.size() > 0) setDiffVisible(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [tickUp, tickDown, undoOne, redoOne, commit, cancel, buffer]);

  // ── Default colDef wires the suppressKeyboardEvent escape.
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    suppressKeyboardEvent: (params: { event: KeyboardEvent; editing: boolean }) => {
      const e = params.event;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return true;
      if (e.ctrlKey && /^[zZyYdD]$/.test(e.key)) return true;
      if (e.ctrlKey && e.key === 'Enter' && !params.editing) return true;
      return false;
    },
  }), []);

  return (
    <div className="app-shell">
      <HeaderBar trader="A. Mehta" />
      <Toolbar
        pendingCount={pendingCount}
        canUndo={canUndo}
        canRedo={canRedo}
        streamPaused={streamPaused}
        onTickUp={() => tickUp()}
        onTickDown={() => tickDown()}
        onUndo={undoOne}
        onRedo={redoOne}
        onDiff={() => setDiffVisible(true)}
        onCommit={commit}
        onCancel={cancel}
        onToggleStream={togglePause}
      />
      <main className="app-main">
        <div className="grid-wrap">
          <MarketsGrid<AxeRow>
            gridId="axe-blotter-default"
            rowData={rowData}
            columnDefs={columnDefs}
            theme={blotterTheme}
            defaultColDef={defaultColDef}
            rowHeight={30}
            headerHeight={34}
            animateRows={false}
            showToolbar={false}
            showFiltersToolbar={false}
            showFormattingToolbar={false}
            showProfileSelector={false}
            showSaveButton={false}
            showSettingsButton={false}
            sideBar={false}
            className="app-grid"
            onReady={onReady}
          />
          <PendingStatusBar
            pendingCount={pendingCount}
            rowCount={pendingRowCount}
            hasWarn={hasWarn}
            hasConflict={hasConflict}
          />
        </div>
        <Sidebar logEntries={logEntries} />
      </main>
      <DiffModal
        visible={diffVisible}
        entries={buffer.all()}
        getRow={(id) => coordinatorRef.current?.getRow(id)}
        onClose={() => setDiffVisible(false)}
        onCommitAll={() => { setDiffVisible(false); commit(); }}
      />
      <Toast message={toast.msg} kind={toast.kind} visible={toast.visible} />
    </div>
  );
}
