import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@starui/ui';

/**
 * Banner shown when the editor catches `OptimisticLockError` from the
 * client (Decision 12.5). Two-action confirm: reload the row's current
 * values, or discard the operator's draft and close the drawer.
 *
 * The dialog is a pure presentation surface — the editor owns the
 * captured row + the `expectedUpdatedTime` and decides what to do on
 * each action. Same shape used across all four editors.
 */

export interface OptimisticLockDialogProps {
  /** When true, the dialog is mounted. */
  open: boolean;
  /** Mirrors shadcn's controlled `onOpenChange` — false closes the dialog. */
  onOpenChange: (open: boolean) => void;
  /** Reload the editor's draft from the latest row on disk. */
  onReload: () => void;
  /** Discard the draft and close the drawer. */
  onDiscard: () => void;
  /** Optional override for the title — defaults to the standard copy. */
  title?: string;
  /** Optional override for the body — defaults to the standard copy. */
  description?: string;
}

const DEFAULT_TITLE = 'Row changed by another operator';
const DEFAULT_DESCRIPTION =
  'Someone else updated this row while you were editing it. Reload to bring in the current values, or discard your changes.';

export function OptimisticLockDialog({
  open,
  onOpenChange,
  onReload,
  onDiscard,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
}: OptimisticLockDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="editor-optimistic-lock-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onDiscard}
            data-testid="editor-optimistic-lock-discard"
          >
            Discard your changes
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onReload}
            data-testid="editor-optimistic-lock-reload"
          >
            Reload current values
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
