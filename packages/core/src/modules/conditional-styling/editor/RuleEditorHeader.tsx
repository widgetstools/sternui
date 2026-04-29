import { memo } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { ObjectTitleRow, SharpBtn, TitleInput } from '../../../ui/SettingsPanel';

export const RuleEditorHeader = memo(function RuleEditorHeader({
  ruleId,
  name,
  dirty,
  onNameChange,
  onSave,
  onDelete,
}: {
  ruleId: string;
  name: string;
  dirty: boolean;
  onNameChange: (next: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="gc-editor-header">
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
              variant={dirty ? 'action' : 'ghost'}
              disabled={!dirty}
              onClick={onSave}
              data-testid={`cs-rule-save-${ruleId}`}
            >
              <Save size={13} strokeWidth={2} /> SAVE
            </SharpBtn>
            <SharpBtn
              variant="danger"
              onClick={onDelete}
              data-testid={`cs-rule-delete-${ruleId}`}
            >
              <Trash2 size={13} strokeWidth={2} /> DELETE
            </SharpBtn>
          </>
        }
      />
    </div>
  );
});
