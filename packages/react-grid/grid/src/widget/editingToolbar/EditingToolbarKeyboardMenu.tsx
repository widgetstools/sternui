import {
  PLUS_MINUS_MODULE_ID,
  SHORTCUTS_MODULE_ID,
  type PlusMinusState,
  type ShortcutsState,
} from '@starui/engine';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@starui/ui';
import { Keyboard } from 'lucide-react';
import { useModuleState } from '../../customizer/hooks/useModuleState';

export function EditingToolbarKeyboardMenu() {
  const [plusMinus] = useModuleState<PlusMinusState>(PLUS_MINUS_MODULE_ID);
  const [shortcuts] = useModuleState<ShortcutsState>(SHORTCUTS_MODULE_ID);

  const plusEnabled = plusMinus.settings.enabled;
  const shortcutsEnabled = shortcuts.settings.enabled;
  const activeNudges = plusMinus.nudges.filter((n) => n.enabled);
  const activeShortcuts = shortcuts.shortcuts.filter((s) => s.enabled);

  if (!plusEnabled && !shortcutsEnabled) return null;
  if (plusEnabled && activeNudges.length === 0 && shortcutsEnabled && activeShortcuts.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="px-2"
              aria-label="Keyboard shortcuts"
              data-testid="editing-toolbar-keyboard-menu"
            >
              <Keyboard className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="ds-sheet-v2 w-72">
        {plusEnabled && activeNudges.length > 0 && (
          <>
            <DropdownMenuLabel>Plus / Minus</DropdownMenuLabel>
            {activeNudges.map((nudge) => (
              <DropdownMenuItem key={nudge.id} disabled className="text-xs opacity-100">
                {nudge.name}
                {' · '}
                +{nudge.incrementStep}
                {' / '}
                −{nudge.decrementStep ?? nudge.incrementStep}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {plusEnabled && activeNudges.length > 0 && shortcutsEnabled && activeShortcuts.length > 0 && (
          <DropdownMenuSeparator />
        )}
        {shortcutsEnabled && activeShortcuts.length > 0 && (
          <>
            <DropdownMenuLabel>Shortcuts</DropdownMenuLabel>
            {activeShortcuts.map((shortcut) => (
              <DropdownMenuItem key={shortcut.id} disabled className="text-xs opacity-100">
                {shortcut.name}
                {' · '}
                {shortcut.shortcutKey.toUpperCase()}
                {' → '}
                {shortcut.operation}
                {' '}
                {shortcut.shortcutValue}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-[10px] text-[color:var(--ds-text-muted)]">
          Configure in Settings
          {plusEnabled && shortcutsEnabled
            ? ' → Plus / Minus / Shortcuts'
            : plusEnabled
              ? ' → Plus / Minus'
              : ' → Shortcuts'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
