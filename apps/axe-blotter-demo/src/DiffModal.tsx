import type { PendingEntry } from './editing';
import type { AxeRow } from './data';

export function DiffModal(props: {
  visible: boolean;
  entries: readonly PendingEntry[];
  getRow: (rowId: string) => AxeRow | undefined;
  onClose: () => void;
  onCommitAll: () => void;
}) {
  if (!props.visible) return null;
  const rows = [...props.entries].sort((a, b) =>
    (a.rowId + a.colId).localeCompare(b.rowId + b.colId),
  );
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">Pending edits — review before commit</div>
        <div className="modal-body">
          <table>
            <thead>
              <tr>
                <th>CUSIP</th>
                <th>Field</th>
                <th>Before</th>
                <th>After</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cusip = props.getRow(r.rowId)?.cusip ?? r.rowId;
                const delta = r.value - r.before;
                const dCls = delta > 0 ? 'delta-up' : 'delta-down';
                const sign = delta > 0 ? '+' : '';
                return (
                  <tr key={`${r.rowId}|${r.colId}`}>
                    <td>{cusip}</td>
                    <td>{r.colId}</td>
                    <td className="before">{r.before.toFixed(3)}</td>
                    <td className="after">{r.value.toFixed(3)}</td>
                    <td className={dCls}>{sign}{delta.toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={props.onClose}>Close</button>
          <button className="btn primary" onClick={props.onCommitAll}>Commit all</button>
        </div>
      </div>
    </div>
  );
}
