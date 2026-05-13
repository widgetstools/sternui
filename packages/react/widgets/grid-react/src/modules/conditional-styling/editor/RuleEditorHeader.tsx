import { memo } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { ObjectTitleRow, SharpBtn, TitleInput } from '../../../ui/SettingsPanel';

export const RuleEditorHeader = memo(function RuleEditorHeader({
  ruleId,
  name,
  dirty,
  onNameChange,
  onReset,
  onSave,
}: {
  ruleId: string;
  name: string;
  dirty: boolean;
  onNameChange: (next: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="shrink-0 bg-background border-b border-border">
      <ObjectTitleRow
        title={
          <TitleInput
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Rule name"
            data-testid={`cs-rule-name-${ruleId}`}
          />
        }
        actions={
          <>
            <SharpBtn
              variant="ghost"
              disabled={!dirty}
              onClick={onReset}
              data-testid={`cs-rule-reset-${ruleId}`}
            >
              <RotateCcw size={13} strokeWidth={2} /> RESET
            </SharpBtn>
            <SharpBtn
              variant={dirty ? 'action' : 'ghost'}
              disabled={!dirty}
              onClick={onSave}
              data-testid={`cs-rule-save-${ruleId}`}
            >
              <Save size={13} strokeWidth={2} /> SAVE
            </SharpBtn>
          </>
        }
      />
    </div>
  );
});
