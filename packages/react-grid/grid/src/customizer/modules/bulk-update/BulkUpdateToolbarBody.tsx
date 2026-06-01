import { useCallback, useMemo, useState } from 'react';
import {
  BULK_UPDATE_MODULE_ID,
  assertSingleColumnSelection,
  bulkUpdateValueKind,
  resolveColumnDistinctValues,
  type BulkUpdateState,
} from '@starui/engine';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  cn,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@starui/ui';
import type { EditingToolbarSegmentProps } from '../../editing/editingToolbarLayout';
import { resolveEditRecording } from '../../editing/recordEdit';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useModuleState } from '../../hooks/useModuleState';
import {
  EDITING_TOOLBAR_CONTROL,
  EDITING_TOOLBAR_POPOVER,
  EditingToolbarApplyButton,
} from '../../../widget/editingToolbar/EditingToolbarPrimitives';
import { useBulkUpdateSelection } from './useBulkUpdateSelection';
import { applyBulkUpdateEdits, resolveBulkUpdateTargets } from './runtime/applyBulkUpdateEdits';

function formatDistinctLabel(value: unknown): string {
  if (value == null || value === '') return '(empty)';
  return String(value);
}

export function BulkUpdateToolbarBody({ layout = 'standalone' }: EditingToolbarSegmentProps) {
  const platform = useGridPlatform();
  const [settings] = useModuleState<BulkUpdateState>(BULK_UPDATE_MODULE_ID);
  const { count, cells } = useBulkUpdateSelection();
  const [value, setValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const columnGuard = useMemo(() => {
    if (!settings.settings.enforceSingleColumn) return { ok: true as const };
    return assertSingleColumnSelection(cells);
  }, [cells, settings.settings.enforceSingleColumn]);

  const journalRecording = useMemo(
    () => resolveEditRecording(platform, 'bulk-update', settings.settings.recordHistory),
    [platform, settings.settings.recordHistory],
  );

  const valueKind = useMemo(
    () => bulkUpdateValueKind(cells[0]?.cellDataType),
    [cells],
  );

  const distinctValues = useMemo(() => {
    const api = platform.api.api;
    const colId = cells[0]?.colId;
    if (!api || !colId || !settings.settings.showDistinctValues) return [];
    return resolveColumnDistinctValues(
      api as never,
      colId,
      settings.settings.maxDropdownValues,
    );
  }, [platform, cells, settings.settings.showDistinctValues, settings.settings.maxDropdownValues]);

  const executeApply = useCallback(async () => {
    const api = platform.api.api;
    if (!api || !settings.settings.enabled || !value.trim()) return;

    const targets = resolveBulkUpdateTargets(api);
    if (targets.length === 0) return;

    if (settings.settings.enforceSingleColumn) {
      const guard = assertSingleColumnSelection(targets);
      if (!guard.ok) return;
    }

    const colLabel = targets[0]?.field ?? 'cells';
    await applyBulkUpdateEdits(api, targets, value, {
      journal: journalRecording.record ? journalRecording.journal : null,
      journalLabel: `Bulk set ${colLabel} → ${value.trim()} · ${targets.length} cell${targets.length === 1 ? '' : 's'}`,
      journalApplyGridId: platform.gridId,
    });
  }, [platform, settings.settings.enabled, settings.settings.enforceSingleColumn, value, journalRecording]);

  const beginApply = useCallback(() => {
    const api = platform.api.api;
    if (!api || !settings.settings.enabled || !value.trim()) return;

    const targets = resolveBulkUpdateTargets(api);
    if (targets.length === 0) return;

    if (settings.settings.enforceSingleColumn) {
      const guard = assertSingleColumnSelection(targets);
      if (!guard.ok) return;
    }

    if (
      settings.settings.confirmThreshold > 0
      && targets.length > settings.settings.confirmThreshold
    ) {
      setConfirmOpen(true);
      return;
    }

    void executeApply();
  }, [platform, settings.settings, value, executeApply]);

  const disabled = !settings.settings.enabled || count === 0 || !columnGuard.ok || !value.trim();

  const showDistinctPicker =
    settings.settings.showDistinctValues && distinctValues.length > 0;

  const valueInput = (
    <Input
      className={cn('ds-bulk-update-toolbar__input', EDITING_TOOLBAR_CONTROL)}
      data-testid="bulk-update-value-input"
      type={valueKind === 'number' ? 'number' : valueKind === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={valueKind === 'date' ? 'YYYY-MM-DD' : 'New value…'}
      aria-label="Bulk update value"
    />
  );

  const distinctPicker = showDistinctPicker ? (
    <Select
      onValueChange={(picked) => setValue(picked === '__empty__' ? '' : picked)}
    >
      <SelectTrigger
        className={cn('ds-bulk-update-toolbar__select ds-bulk-update-toolbar__picker', EDITING_TOOLBAR_CONTROL)}
        data-testid="bulk-update-value-select"
        aria-label="Pick existing column value"
      >
        <SelectValue placeholder="Existing…" />
      </SelectTrigger>
      <SelectContent className={EDITING_TOOLBAR_POPOVER}>
        {distinctValues.map((v) => {
          const label = formatDistinctLabel(v);
          const pickValue = label === '(empty)' ? '__empty__' : label;
          return (
            <SelectItem key={label} value={pickValue} className="text-xs">
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  ) : null;

  if (!settings.settings.enabled) return null;

  const segment = layout === 'segment';

  return (
    <div
      className={cn(segment ? 'ds-editing-toolbar__segment' : 'ds-bulk-update-toolbar')}
      data-testid="bulk-update-toolbar"
    >
      <span className="ds-bulk-update-toolbar__label">Bulk</span>
      {valueInput}
      {distinctPicker}
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <EditingToolbarApplyButton
              data-testid="bulk-update-apply"
              disabled={disabled}
              onClick={beginApply}
            />
          </span>
        </TooltipTrigger>
        {!columnGuard.ok ? (
          <TooltipContent>Select cells in a single column only</TooltipContent>
        ) : (
          <TooltipContent>Apply bulk update</TooltipContent>
        )}
      </Tooltip>
      <span
        className={cn(
          segment ? 'ds-editing-toolbar__meta' : 'ds-bulk-update-toolbar__count',
        )}
        data-testid="bulk-update-count"
      >
        {count} selected
      </span>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply bulk update?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update {count} cells. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="bulk-update-confirm-apply"
              onClick={() => {
                setConfirmOpen(false);
                void executeApply();
              }}
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
