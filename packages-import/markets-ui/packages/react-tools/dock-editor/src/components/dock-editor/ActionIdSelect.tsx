import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const KNOWN_ACTIONS = [
  { id: "launch-app", label: "Launch App" },
  { id: "toggle-theme", label: "Toggle Theme" },
  { id: "open-dock-editor", label: "Open Dock Editor" },
  { id: "show-notifications", label: "Show Notifications" },
  { id: "open-store", label: "Open Store" },
  { id: "open-home", label: "Open Home" },
];

interface ActionIdSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function ActionIdSelect({ value, onChange }: ActionIdSelectProps) {
  const [isCustom, setIsCustom] = useState(
    !KNOWN_ACTIONS.some((a) => a.id === value) && value !== "",
  );

  if (isCustom) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="custom-action-id"
          className="h-8 text-xs flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px] h-7 px-2 shrink-0"
          onClick={() => {
            setIsCustom(false);
            onChange("launch-app");
          }}
        >
          Use preset
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs flex-1">
          <SelectValue placeholder="Select action..." />
        </SelectTrigger>
        <SelectContent>
          {KNOWN_ACTIONS.map((action) => (
            <SelectItem key={action.id} value={action.id}>
              {action.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        className="text-[11px] h-7 px-2 shrink-0"
        onClick={() => setIsCustom(true)}
      >
        Custom
      </Button>
    </div>
  );
}
