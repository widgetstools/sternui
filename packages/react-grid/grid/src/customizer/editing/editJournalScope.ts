import { EditJournal } from '@starui/engine';

/** One EditJournal per grid — shared by all editing modules on that grid. */
const journalsByGridId = new Map<string, EditJournal>();

export function getEditJournal(
  platform: { gridId: string },
  options?: { limit?: number },
): EditJournal {
  let journal = journalsByGridId.get(platform.gridId);
  if (!journal) {
    journal = new EditJournal({ limit: options?.limit ?? 50 });
    journalsByGridId.set(platform.gridId, journal);
  }
  return journal;
}

export function resetEditJournal(platform: { gridId: string }): void {
  journalsByGridId.get(platform.gridId)?.reset();
}

export function clearEditJournalRegistry(): void {
  journalsByGridId.clear();
}
