import type { ReactNode } from 'react';
import {
  BULK_UPDATE_MODULE_ID,
  DATA_CHANGE_HISTORY_MODULE_ID,
  PLUS_MINUS_MODULE_ID,
  SHORTCUTS_MODULE_ID,
  SMART_EDIT_MODULE_ID,
  type BulkUpdateState,
  type DataChangeHistoryState,
  type PlusMinusState,
  type ShortcutsState,
  type SmartEditState,
} from '@starui/engine';
import { cn } from '@starui/ui';
import { useModuleState } from '../../customizer/hooks/useModuleState';
import { BulkUpdateToolbarBody } from '../../customizer/modules/bulk-update/BulkUpdateToolbarBody';
import { EditHistoryToolbarBody } from '../../customizer/modules/data-change-history/EditHistoryToolbarBody';
import { SmartEditToolbarBody } from '../../customizer/modules/smart-edit/SmartEditToolbarBody';
import { EditingToolbarKeyboardMenu } from './EditingToolbarKeyboardMenu';
import type { EditingToolbarAllow } from './resolveEditingToolbarAllow';

export interface EditingToolbarProps {
  allow: EditingToolbarAllow;
}

function ToolbarSeparator() {
  return (
    <span
      className="mx-1 hidden h-5 w-px shrink-0 bg-[color:var(--ds-border-primary)] sm:inline-block"
      aria-hidden
    />
  );
}

function joinSegments(nodes: Array<ReactNode | false | null | undefined>) {
  const visible = nodes.filter(Boolean);
  return visible.flatMap((node, index) => (
    index === 0 ? [node] : [<ToolbarSeparator key={`sep-${index}`} />, node]
  ));
}

/** Unified editing toolbar — history, smart edit, bulk update, keyboard hints. */
export function EditingToolbar({ allow }: EditingToolbarProps) {
  const [history] = useModuleState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);
  const [smartEdit] = useModuleState<SmartEditState>(SMART_EDIT_MODULE_ID);
  const [bulkUpdate] = useModuleState<BulkUpdateState>(BULK_UPDATE_MODULE_ID);
  const [plusMinus] = useModuleState<PlusMinusState>(PLUS_MINUS_MODULE_ID);
  const [shortcuts] = useModuleState<ShortcutsState>(SHORTCUTS_MODULE_ID);

  const showHistory = allow.allowHistory && history.settings.enabled;
  const showSmartEdit = allow.allowSmartEdit && smartEdit.settings.enabled;
  const showBulkUpdate = allow.allowBulkUpdate && bulkUpdate.settings.enabled;
  const showKeyboard =
    (plusMinus.settings.enabled && plusMinus.nudges.some((n) => n.enabled))
    || (shortcuts.settings.enabled && shortcuts.shortcuts.some((s) => s.enabled));
  const hasPrimarySegment = showHistory || showSmartEdit || showBulkUpdate;

  if (!allow.rowVisible || !hasPrimarySegment) return null;

  const primary = joinSegments([
    showHistory && <EditHistoryToolbarBody key="history" layout="segment" />,
    showSmartEdit && <SmartEditToolbarBody key="smart-edit" layout="segment" />,
    showBulkUpdate && <BulkUpdateToolbarBody key="bulk-update" layout="segment" />,
  ]);

  return (
    <div
      className={cn(
        'ds-editing-toolbar ds-sheet-v2 shrink-0 border-b border-[color:var(--ds-border-primary)]',
      )}
      data-testid="editing-toolbar-pinned"
    >
      {primary}
      {primary.length > 0 && showKeyboard && <ToolbarSeparator />}
      {showKeyboard && <EditingToolbarKeyboardMenu />}
    </div>
  );
}
