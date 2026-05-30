/**
 * PrimaryToolbarOverflowMenu — collapses infrequent toolbar actions into
 * a single ⋯ menu so the primary row stays compact (export, settings,
 * admin actions, grid info).
 */

import { useState, type ReactElement } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@starui/ui';
import {
  FileSpreadsheet,
  Info,
  MoreVertical,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { AdminAction } from './types';
import { AdminActionButtons, resolveAdminActionIcon } from './AdminActionButtons';
import { GridInfoButton } from './GridInfoButton';
import { GridInfoContent } from './GridInfoContent';

export type ToolbarActionsLayout = 'inline' | 'overflow';

export interface PrimaryToolbarSecondaryActionsProps {
  readonly showVisualExcelExport: boolean;
  readonly visualExcelExportEnabled: boolean;
  readonly onExportVisualExcel: () => void;
  readonly showSettingsButton: boolean;
  readonly onOpenSettings: () => void;
  readonly adminActions: AdminAction[] | undefined;
  readonly componentName: string | undefined;
  readonly gridId: string;
  readonly instanceId: string | undefined;
  readonly appId: string | undefined;
  readonly userId: string | undefined;
}

export function PrimaryToolbarOverflowMenu(
  props: PrimaryToolbarSecondaryActionsProps,
): ReactElement | null {
  const adminVisible = (props.adminActions ?? []).filter((a) => a.visible !== false);
  const showExcel = props.showVisualExcelExport && props.visualExcelExportEnabled;
  const hasMenuItems = showExcel || props.showSettingsButton || adminVisible.length > 0;

  if (!hasMenuItems) {
    return <GridInfoButton {...gridInfoProps(props)} />;
  }

  return <OverflowMenu {...props} adminVisible={adminVisible} showExcel={showExcel} />;
}

function gridInfoProps(props: PrimaryToolbarSecondaryActionsProps) {
  return {
    componentName: props.componentName,
    gridId: props.gridId,
    instanceId: props.instanceId,
    appId: props.appId,
    userId: props.userId,
  };
}

function OverflowMenu({
  showExcel,
  onExportVisualExcel,
  showSettingsButton,
  onOpenSettings,
  adminVisible,
  componentName,
  gridId,
  instanceId,
  appId,
  userId,
}: PrimaryToolbarSecondaryActionsProps & {
  adminVisible: AdminAction[];
  showExcel: boolean;
}): ReactElement {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <>
      <span className="ds-primary-divider" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="ds-primary-action"
            title="More actions"
            aria-label="More actions"
            data-testid="toolbar-more-menu-trigger"
          >
            <MoreVertical size={14} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="fx-menu w-max min-w-0 p-0.5">
          {showExcel ? (
            <DropdownMenuItem
              onSelect={onExportVisualExcel}
              data-testid="visual-excel-export-btn"
              className="gap-1.5 px-2 py-1"
            >
              <FileSpreadsheet size={14} strokeWidth={2} className="shrink-0 opacity-80" />
              Export to Excel
            </DropdownMenuItem>
          ) : null}
          {showSettingsButton ? (
            <DropdownMenuItem
              onSelect={onOpenSettings}
              data-testid="v2-settings-open-btn"
              className="gap-1.5 px-2 py-1"
            >
              <SettingsIcon size={14} strokeWidth={2} className="shrink-0 opacity-80" />
              Grid settings
            </DropdownMenuItem>
          ) : null}
          {adminVisible.length > 0 && (showExcel || showSettingsButton) ? (
            <DropdownMenuSeparator />
          ) : null}
          {adminVisible.map((action) => {
            const Icon = resolveAdminActionIcon(action.icon);
            const title = action.description
              ? `${action.label}\n${action.description}`
              : action.label;
            return (
              <DropdownMenuItem
                key={action.id}
                onSelect={() => { void action.onClick(); }}
                title={title}
                data-testid={`admin-action-${action.id}`}
                className="gap-1.5 px-2 py-1"
              >
                <Icon size={14} strokeWidth={2} className="shrink-0 opacity-80" />
                {action.label}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setInfoOpen(true)}
            data-testid="grid-info-btn"
            className="gap-1.5 px-2 py-1"
          >
            <Info size={14} strokeWidth={2} className="shrink-0 opacity-80" />
            Grid info
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md p-0 text-xs" data-ds-settings>
          <DialogHeader className="sr-only">
            <DialogTitle>Grid info</DialogTitle>
          </DialogHeader>
          <GridInfoContent
            componentName={componentName}
            gridId={gridId}
            instanceId={instanceId}
            appId={appId}
            userId={userId}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Inline icon cluster — opt-in via `toolbarActionsLayout="inline"`. */
export function PrimaryToolbarInlineActions(
  props: PrimaryToolbarSecondaryActionsProps,
): ReactElement {
  return (
    <>
      {props.showVisualExcelExport && props.visualExcelExportEnabled ? (
        <>
          <span className="ds-primary-divider" aria-hidden />
          <button
            type="button"
            className="ds-primary-action"
            onClick={props.onExportVisualExcel}
            title="Export to Excel (preserves formatting)"
            data-testid="visual-excel-export-btn"
            aria-label="Export to Excel"
          >
            <FileSpreadsheet size={14} strokeWidth={2} />
          </button>
        </>
      ) : null}

      {props.showSettingsButton ? (
        <>
          <span className="ds-primary-divider" aria-hidden />
          <button
            type="button"
            className="ds-primary-action"
            onClick={props.onOpenSettings}
            title="Open settings"
            data-testid="v2-settings-open-btn"
          >
            <SettingsIcon size={14} strokeWidth={2} />
          </button>
        </>
      ) : null}

      <AdminActionButtons actions={props.adminActions} />
      <GridInfoButton {...gridInfoProps(props)} />
    </>
  );
}
