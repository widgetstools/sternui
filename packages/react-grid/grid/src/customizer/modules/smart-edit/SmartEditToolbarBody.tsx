import { useCallback, useState } from 'react';
import {
  SMART_EDIT_MODULE_ID,
  type SmartEditOp,
  type SmartEditState,
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
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@starui/ui';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useModuleState } from '../../hooks/useModuleState';
import { useSmartEditSelection } from './useSmartEditSelection';
import { applyEdits, resolveTargetCells } from './runtime/applyEdits';

const OP_LABELS: Record<SmartEditOp, string> = {
  multiply: '×',
  divide: '÷',
  add: '+',
  subtract: '−',
  set: 'Set…',
};

export function SmartEditToolbarBody() {
  const platform = useGridPlatform();
  const [settings] = useModuleState<SmartEditState>(SMART_EDIT_MODULE_ID);
  const { count } = useSmartEditSelection();
  const [operand, setOperand] = useState('1');
  const [setDialogOpen, setSetDialogOpen] = useState(false);
  const [setValue, setSetValue] = useState('');
  const [confirmOp, setConfirmOp] = useState<SmartEditOp | null>(null);

  const runOp = useCallback(async (op: SmartEditOp, value: number) => {
    const api = platform.api.api;
    if (!api || !settings.settings.enabled) return;

    const cells = resolveTargetCells(api);
    if (cells.length === 0) return;

    if (
      settings.settings.confirmThreshold > 0 &&
      cells.length > settings.settings.confirmThreshold
    ) {
      setConfirmOp(op);
      return;
    }

    await applyEdits(api, cells, op, value);
  }, [platform, settings.settings.enabled, settings.settings.confirmThreshold]);

  const handleConfirm = async () => {
    const api = platform.api.api;
    if (!api || !confirmOp) return;
    const value = Number(operand);
    if (!Number.isFinite(value)) return;
    const cells = resolveTargetCells(api);
    await applyEdits(api, cells, confirmOp, value);
    setConfirmOp(null);
  };

  const handleSet = async () => {
    const parsed = Number(setValue);
    if (!Number.isFinite(parsed)) return;
    await runOp('set', parsed);
    setSetDialogOpen(false);
    setSetValue('');
  };

  if (!settings.settings.enabled) return null;

  const disabled = count === 0;
  const ops = settings.settings.enabledOps;

  return (
    <div className="ds-smart-edit-toolbar ds-sheet-v2" data-testid="smart-edit-toolbar">
      {ops.filter((op) => op !== 'set').map((op) => (
        <Tooltip key={op}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              data-testid={`smart-edit-op-${op}`}
              onClick={() => {
                const v = Number(operand);
                if (Number.isFinite(v)) void runOp(op, v);
              }}
            >
              {OP_LABELS[op]}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{op}</TooltipContent>
        </Tooltip>
      ))}
      {ops.includes('set') && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          data-testid="smart-edit-op-set"
          onClick={() => setSetDialogOpen(true)}
        >
          Set…
        </Button>
      )}
      <span className="text-[11px] text-[color:var(--ds-text-secondary)]">Operand</span>
      <Input
        className="ds-smart-edit-toolbar__operand h-8 w-[88px] text-[12px]"
        value={operand}
        onChange={(e) => setOperand(e.target.value)}
        data-testid="smart-edit-operand"
      />
      <span className="ds-smart-edit-toolbar__count text-[11px] text-[color:var(--ds-text-secondary)]">
        {count} cell{count === 1 ? '' : 's'} selected
      </span>

      <Dialog open={setDialogOpen} onOpenChange={setSetDialogOpen}>
        <DialogContent className="ds-sheet-v2">
          <DialogHeader>
            <DialogTitle>Bulk set value</DialogTitle>
          </DialogHeader>
          <Input
            value={setValue}
            onChange={(e) => setSetValue(e.target.value)}
            placeholder="e.g. 1000000 or 1.5M"
            data-testid="smart-edit-set-input"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSet()} data-testid="smart-edit-set-apply">Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOp !== null} onOpenChange={(o) => !o && setConfirmOp(null)}>
        <AlertDialogContent className="ds-sheet-v2">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to {count} cells?</AlertDialogTitle>
            <AlertDialogDescription>
              This exceeds your confirm threshold ({settings.settings.confirmThreshold} cells).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirm()}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
