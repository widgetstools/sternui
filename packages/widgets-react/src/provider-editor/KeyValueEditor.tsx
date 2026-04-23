import React, { useCallback } from 'react';
import { Button, Input, Label } from '@marketsui/ui';
import { Plus, Trash2 } from 'lucide-react';

interface KeyValueEditorProps {
  label: string;
  description?: string;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export const KeyValueEditor: React.FC<KeyValueEditorProps> = ({
  label,
  description,
  value,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}) => {
  const entries = Object.entries(value);

  const handleAdd = useCallback(() => {
    onChange({ ...value, '': '' });
  }, [value, onChange]);

  const handleRemove = useCallback(
    (key: string) => {
      const next = { ...value };
      delete next[key];
      onChange(next);
    },
    [value, onChange]
  );

  const handleKeyChange = useCallback(
    (oldKey: string, newKey: string) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) {
        next[k === oldKey ? newKey : k] = v;
      }
      onChange(next);
    },
    [value, onChange]
  );

  const handleValueChange = useCallback(
    (key: string, newValue: string) => {
      onChange({ ...value, [key]: newValue });
    },
    [value, onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
          {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleAdd} className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">No entries configured</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, val], index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={key}
                onChange={(e) => handleKeyChange(key, e.target.value)}
                placeholder={keyPlaceholder}
                className="flex-1 h-8 text-sm"
              />
              <Input
                value={val}
                onChange={(e) => handleValueChange(key, e.target.value)}
                placeholder={valuePlaceholder}
                className="flex-1 h-8 text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(key)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
