/**
 * Chrome — header bar, primary toolbar, sidebar with keymap + linkage
 * + activity log. All purely presentational; the App.tsx wires
 * callbacks through.
 */
import { useEffect, useState } from 'react';

// ─── Top header ────────────────────────────────────────────────────────

export function HeaderBar({ trader }: { trader: string }) {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="app-header">
      <div className="brand">
        <span className="name">MarketsUI</span>
        <span className="desk">IG Credit · NY · Programmatic Demo</span>
      </div>
      <div className="status">
        <span><span className="dot" />ViewServer connected</span>
        <span>Trader: {trader}</span>
        <span>{clock}</span>
      </div>
    </header>
  );
}

// ─── Primary toolbar ───────────────────────────────────────────────────

export interface ToolbarProps {
  pendingCount: number;
  canUndo: boolean;
  canRedo: boolean;
  streamPaused: boolean;
  onTickUp(): void;
  onTickDown(): void;
  onUndo(): void;
  onRedo(): void;
  onDiff(): void;
  onCommit(): void;
  onCancel(): void;
  onToggleStream(): void;
}

export function Toolbar(p: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="btn" onClick={p.onToggleStream}>
        {p.streamPaused ? '▶ Resume stream' : '⏸ Pause stream'}
      </button>
      <button className="btn" onClick={p.onTickUp}>Tick Up (Alt+↑)</button>
      <button className="btn" onClick={p.onTickDown}>Tick Down (Alt+↓)</button>
      <div className="divider" />
      <button className="btn" onClick={p.onUndo} disabled={!p.canUndo}>↶ Undo (Ctrl+Z)</button>
      <button className="btn" onClick={p.onRedo} disabled={!p.canRedo}>↷ Redo (Ctrl+Y)</button>
      <div className="divider" />
      <button className="btn" onClick={p.onDiff}   disabled={p.pendingCount === 0}>Preview Diff (Ctrl+D)</button>
      <button className="btn primary" onClick={p.onCommit} disabled={p.pendingCount === 0}>Commit (Ctrl+Enter)</button>
      <button className="btn danger"  onClick={p.onCancel} disabled={p.pendingCount === 0}>Discard (Esc)</button>
      {p.pendingCount > 0 && <span className="pending-counter">{p.pendingCount} pending</span>}
      <span className="hint">Range-select cells, then Alt+↑/↓ or edit directly</span>
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────

export function Sidebar({ logEntries }: { logEntries: LogEntry[] }) {
  return (
    <aside className="app-sidebar">
      <div className="panel">
        <h3>Keyboard shortcuts</h3>
        <div className="keymap">
          <kbd>F2</kbd><span>Edit cell</span>
          <kbd>Alt+↑/↓</kbd><span>Tick selection ±1</span>
          <kbd>Alt+Shift+↑/↓</kbd><span>Tick ±5</span>
          <kbd>Ctrl+Enter</kbd><span>Commit batch</span>
          <kbd>Esc</kbd><span>Discard pending</span>
          <kbd>Ctrl+D</kbd><span>Preview diff</span>
          <kbd>Ctrl+Z</kbd><span>Undo</span>
          <kbd>Ctrl+Y</kbd><span>Redo</span>
        </div>
      </div>
      <div className="panel">
        <h3>Linkage rules (active · IG corp matrix)</h3>
        <div className="linkage-list">
          <div>· <span className="link-name">bid ↔ ask</span> preserve_spread</div>
          <div>· <span className="link-name">spread → price</span> derive_from_anchor</div>
          <div>· <span className="link-name">spread → yield</span> derive_from_anchor</div>
          <div>· FF warn &gt; 10 bp · reject &gt; 25 bp (spread)</div>
          <div>· FF warn &gt; 1 pt · reject &gt; 3 pt (bid/ask)</div>
        </div>
      </div>
      <div className="panel log-panel">
        <h3>Activity log</h3>
        <div className="log">
          {logEntries.map((e, i) => (
            <div key={i} className="log-entry">
              <span className="time">{e.time}</span>
              <span className={`tag ${e.kind}`}>{e.kind}</span>
              <span className="msg">{e.msg}</span>
              {e.detail && <div className="detail">{e.detail}</div>}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export interface LogEntry {
  time: string;
  kind: 'intent' | 'commit' | 'undo' | 'reject' | 'tick' | 'stream';
  msg: string;
  detail?: string;
}

// ─── Pending-state status bar (architecture §02 mock) ─────────────────

export function PendingStatusBar({
  pendingCount,
  rowCount,
  hasWarn,
  hasConflict,
}: {
  pendingCount: number;
  rowCount: number;
  hasWarn: boolean;
  hasConflict: boolean;
}) {
  const empty = pendingCount === 0;
  const glyph = hasConflict ? '⚠' : hasWarn ? '⚠' : '◆';
  const label = empty
    ? 'No pending edits — ready'
    : `${glyph} ${pendingCount} pending edit${pendingCount === 1 ? '' : 's'} across ${rowCount} row${rowCount === 1 ? '' : 's'}` +
      (hasWarn ? ' · warn' : '') +
      (hasConflict ? ' · stream conflict' : '');
  return (
    <div className="pending-status">
      <span className={`pending-label ${empty ? 'empty' : ''}`}>{label}</span>
      <span className="actions">
        <span><kbd>Ctrl+Enter</kbd>commit</span>
        <span><kbd>Esc</kbd>discard</span>
        <span><kbd>Ctrl+D</kbd>preview diff</span>
      </span>
    </div>
  );
}

// ─── Toast (singleton, imperative) ─────────────────────────────────────

export function Toast({ message, kind, visible }: {
  message: string;
  kind?: 'danger' | 'success';
  visible: boolean;
}) {
  return (
    <div className={`toast ${visible ? 'visible' : ''} ${kind ?? ''}`}>{message}</div>
  );
}
