import { applyPatches } from './applyPatches.js';
import type { CellPatch, EditGridWriter, EditJournalEntry, EditSource } from './types.js';

export interface EditJournalOptions {
  /** Max undo/redo stack depth. Default 50. */
  limit?: number;
  /** Max entries shown in monitor list. Default 100. */
  monitorLimit?: number;
}

let entryCounter = 0;

function nextEntryId(): string {
  entryCounter += 1;
  return `edit-${Date.now()}-${entryCounter}`;
}

/**
 * Cell-patch journal — one user action = one undo step.
 * Session-only stacks; settings persist via data-change-history module profile.
 */
export class EditJournal {
  private readonly limit: number;
  private readonly monitorLimit: number;
  private past: EditJournalEntry[] = [];
  private future: EditJournalEntry[] = [];
  private monitor: EditJournalEntry[] = [];
  private suspended = false;

  constructor(options: EditJournalOptions = {}) {
    this.limit = options.limit ?? 50;
    this.monitorLimit = options.monitorLimit ?? 100;
  }

  get entries(): readonly EditJournalEntry[] {
    return this.monitor;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  reset(): void {
    this.past = [];
    this.future = [];
    this.monitor = [];
  }

  record(params: {
    source: EditSource;
    label: string;
    patches: readonly CellPatch[];
  }): EditJournalEntry | null {
    if (this.suspended || params.patches.length === 0) return null;
    const entry: EditJournalEntry = {
      id: nextEntryId(),
      at: Date.now(),
      source: params.source,
      label: params.label,
      patches: [...params.patches],
    };
    this.past.push(entry);
    if (this.past.length > this.limit) {
      this.past = this.past.slice(this.past.length - this.limit);
    }
    this.future = [];
    this.monitor.unshift(entry);
    if (this.monitor.length > this.monitorLimit) {
      this.monitor = this.monitor.slice(0, this.monitorLimit);
    }
    return entry;
  }

  async undo(api: EditGridWriter, rowIdField = 'id'): Promise<boolean> {
    const entry = this.past.pop();
    if (!entry) return false;
    this.future.push(entry);
    if (this.future.length > this.limit) {
      this.future = this.future.slice(this.future.length - this.limit);
    }
    await applyPatches(api, entry.patches, 'undo', rowIdField);
    return true;
  }

  async redo(api: EditGridWriter, rowIdField = 'id'): Promise<boolean> {
    const entry = this.future.pop();
    if (!entry) return false;
    this.past.push(entry);
    if (this.past.length > this.limit) {
      this.past = this.past.slice(this.past.length - this.limit);
    }
    await applyPatches(api, entry.patches, 'redo', rowIdField);
    return true;
  }

  /** Undo a specific monitor entry (moves timeline to that point). */
  async undoEntry(api: EditGridWriter, entryId: string, rowIdField = 'id'): Promise<boolean> {
    let idx = -1;
    for (let i = this.past.length - 1; i >= 0; i -= 1) {
      if (this.past[i]?.id === entryId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return false;
    const entry = this.past[idx]!;
    this.past = this.past.slice(0, idx);
    this.future = [entry, ...this.future];
    await applyPatches(api, entry.patches, 'undo', rowIdField);
    return true;
  }
}
