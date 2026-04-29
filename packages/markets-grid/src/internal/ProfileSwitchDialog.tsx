import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@marketsui/core';

/**
 * Unsaved-changes prompt fired by the profile switcher when the user
 * picks a different profile while the active one is dirty. Three
 * explicit actions — we never silently drop edits.
 *
 * Extracted verbatim from `MarketsGrid.tsx` during Phase C-3.
 */
export function ProfileSwitchDialog({
  open,
  onCancel,
  onDiscard,
  onSave,
}: {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent data-testid="profile-switch-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes in the current profile. What do you want to
            do before switching?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="profile-switch-cancel">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="profile-switch-discard"
            onClick={(e) => {
              e.preventDefault();
              onDiscard();
            }}
          >
            Discard changes
          </AlertDialogAction>
          <AlertDialogAction
            data-testid="profile-switch-save"
            onClick={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            Save &amp; switch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
