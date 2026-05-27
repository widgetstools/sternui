import { describe, expect, it, vi } from 'vitest';
import { EditJournal } from './EditJournal.js';
import { previewPatches } from './previewPatches.js';
import { assertSingleColumnSelection } from './selectionGuards.js';

describe('assertSingleColumnSelection', () => {
  it('passes for single column', () => {
    expect(
      assertSingleColumnSelection([
        { rowId: 'r1', colId: 'qty', field: 'qty', value: 1 },
        { rowId: 'r2', colId: 'qty', field: 'qty', value: 2 },
      ]),
    ).toEqual({ ok: true, columnId: 'qty' });
  });

  it('fails for multi-column', () => {
    expect(
      assertSingleColumnSelection([
        { rowId: 'r1', colId: 'qty', field: 'qty', value: 1 },
        { rowId: 'r1', colId: 'mid', field: 'mid', value: 2 },
      ]),
    ).toEqual({ ok: false, reason: 'multi-column' });
  });
});

describe('previewPatches', () => {
  it('classifies all valid by default', () => {
    const preview = previewPatches([
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 },
    ]);
    expect(preview.allValid).toBe(true);
    expect(preview.validPatches).toHaveLength(1);
  });

  it('detects partial invalid', () => {
    const preview = previewPatches(
      [
        { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 },
        { rowId: 'r2', colId: 'qty', field: 'qty', oldValue: 3, newValue: 4 },
      ],
      (p) => (p.rowId === 'r2' ? 'invalid' : 'valid'),
    );
    expect(preview.someInvalid).toBe(true);
    expect(preview.validPatches).toHaveLength(1);
  });
});

describe('EditJournal', () => {
  it('records and undoes an entry', async () => {
    const journal = new EditJournal({ limit: 10 });
    const api = {
      getRowNode: () => ({ data: { id: 'r1', qty: 200 } }),
      applyTransactionAsync: vi.fn().mockResolvedValue(undefined),
    };
    journal.record({
      source: 'smart-edit',
      label: '×2',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
    });
    expect(journal.canUndo).toBe(true);
    expect(journal.entries).toHaveLength(1);
    await journal.undo(api);
    expect(api.applyTransactionAsync).toHaveBeenCalled();
    expect(journal.canRedo).toBe(true);
  });

  it('does not record when suspended', () => {
    const journal = new EditJournal();
    journal.suspend();
    const entry = journal.record({
      source: 'smart-edit',
      label: '×2',
      patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 }],
    });
    expect(entry).toBeNull();
    expect(journal.canUndo).toBe(false);
  });
});