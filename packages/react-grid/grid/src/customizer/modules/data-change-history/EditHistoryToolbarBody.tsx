import { useCallback } from 'react';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  type DataChangeHistoryState,
} from '@starui/engine';
import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@starui/ui';
import { Redo2, Undo2 } from 'lucide-react';
import type { EditingToolbarSegmentProps } from '../../editing/editingToolbarLayout';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useEditJournal } from '../../hooks/useEditJournal';
import { journalUndoStackSize } from '../../editing/editJournalScope';
import { journalRedo, journalUndo } from '../../editing/journalUndoRedo';
import { useModuleState } from '../../hooks/useModuleState';

export function EditHistoryToolbarBody({ layout = 'standalone' }: EditingToolbarSegmentProps) {
  const platform = useGridPlatform();
  const journal = useEditJournal();
  const [history] = useModuleState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);

  const handleUndo = useCallback(async () => {
    const api = platform.api.api;
    if (!api) return;
    await journalUndo(platform, journal, api as never);
  }, [journal, platform]);

  const handleRedo = useCallback(async () => {
    const api = platform.api.api;
    if (!api) return;
    await journalRedo(platform, journal, api as never);
  }, [journal, platform]);

  const entryCount = journalUndoStackSize(journal);

  if (!history.settings.enabled) return null;

  const segment = layout === 'segment';

  return (
    <div
      className={cn(
        segment ? 'ds-editing-toolbar__segment' : 'ds-edit-history-toolbar',
        !segment && 'ds-sheet-v2',
      )}
      data-testid="edit-history-toolbar"
    >
      <span className="ds-edit-history-toolbar__label">Edit history</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="edit-history-undo"
            disabled={!journal.canUndo}
            onClick={() => void handleUndo()}
            aria-label="Undo last edit"
          >
            <Undo2 className="size-3.5" />
            Undo
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo last edit</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="edit-history-redo"
            disabled={!journal.canRedo}
            onClick={() => void handleRedo()}
            aria-label="Redo"
          >
            <Redo2 className="size-3.5" />
            Redo
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo</TooltipContent>
      </Tooltip>
      <span
        className={cn(
          'ds-edit-history-toolbar__count',
          segment && 'ml-0',
        )}
        data-testid="edit-history-count"
      >
        {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
      </span>
    </div>
  );
}
