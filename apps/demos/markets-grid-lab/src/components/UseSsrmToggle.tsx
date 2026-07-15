import { Checkbox, Label } from '@starui/ui';
import { useLabDemoRegistry } from '../demo/LabDemoContext';

export function UseSsrmToggle() {
  const { useSSRM, setUseSSRM } = useLabDemoRegistry();

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="lab-use-ssrm"
        checked={useSSRM}
        onCheckedChange={(checked) => setUseSSRM(checked === true)}
        data-testid="use-ssrm-toggle"
      />
      <Label
        htmlFor="lab-use-ssrm"
        className="cursor-pointer text-[12px] font-normal text-[color:var(--ds-text-secondary)]"
      >
        Use SSRM (large dataset)
      </Label>
    </div>
  );
}
