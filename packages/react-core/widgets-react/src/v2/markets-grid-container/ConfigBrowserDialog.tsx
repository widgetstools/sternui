import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@starui/ui';
import { ConfigBrowserPanel } from '@starui/config-browser';

export interface ConfigBrowserDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** In-browser shell for {@link ConfigBrowserPanel}. */
export function ConfigBrowserDialog({
  open,
  onOpenChange,
}: ConfigBrowserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="ds-sheet-v2 flex h-[85vh] max-h-[900px] w-[95vw] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        data-testid="config-browser-dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Config Browser</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ConfigBrowserPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
