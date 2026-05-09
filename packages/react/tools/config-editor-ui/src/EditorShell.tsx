import { type ReactNode } from 'react';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@starui/ui';

/**
 * Shared list + edit-drawer scaffold used by the four list editors
 * (Session 12). Keeps the visual frame identical so polish in Session
 * 14 (filter/sort/paginate + validation surfaces) lands in one place.
 *
 * No filter/sort/paginate here yet — that's the Session 14 boundary
 * called out in the plan acceptance criteria.
 */

export interface EditorShellProps {
  title: string;
  /** Singular noun used in the "New X" button label (e.g. "role"). */
  itemLabel: string;
  /** Triggered by the "New {itemLabel}" button in the header. */
  onCreate: () => void;
  /** The list view (typically a shadcn `<Table>`). */
  list: ReactNode;
  /** Drawer state — controlled by the editor. */
  drawer: {
    open: boolean;
    mode: 'create' | 'edit';
    onOpenChange: (open: boolean) => void;
    /** Form fields rendered inside the drawer body. */
    body: ReactNode;
    /** Optional validation message shown above the footer. */
    error?: string | null;
    /** Save handler — disabled when `canSave` is false. */
    onSave: () => void;
    canSave: boolean;
    saving?: boolean;
  };
}

export function EditorShell({
  title,
  itemLabel,
  onCreate,
  list,
  drawer,
}: EditorShellProps) {
  return (
    <div className="flex flex-col gap-4 p-4 bg-background text-foreground">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button onClick={onCreate} data-testid="editor-shell-create">
          New {itemLabel}
        </Button>
      </div>
      <div className="rounded-md border border-border">{list}</div>
      <Sheet open={drawer.open} onOpenChange={drawer.onOpenChange}>
        <SheetContent className="flex flex-col gap-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {drawer.mode === 'create' ? `New ${itemLabel}` : `Edit ${itemLabel}`}
            </SheetTitle>
            <SheetDescription>
              {drawer.mode === 'create'
                ? `Define a new ${itemLabel}.`
                : `Update this ${itemLabel}.`}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 overflow-y-auto">
            {drawer.body}
          </div>
          {drawer.error ? (
            <p
              className="text-sm text-destructive"
              role="alert"
              data-testid="editor-shell-error"
            >
              {drawer.error}
            </p>
          ) : null}
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => drawer.onOpenChange(false)}
              disabled={drawer.saving}
            >
              Cancel
            </Button>
            <Button
              onClick={drawer.onSave}
              disabled={!drawer.canSave || drawer.saving}
              data-testid="editor-shell-save"
            >
              {drawer.saving ? 'Saving…' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
