import { Info } from 'lucide-react';
import { FormatPopover } from '../format-editor';
import { ExcelReferenceList } from './ExcelReferenceList';
import { ChromeButton } from '../ChromeButton';

/**
 * Info popover with categorised Excel format examples, anchored to an
 * info button. Used by the **inline** (editor) FormatterPicker
 * presentation, which lives in a settings-panel row — there's no parent
 * picker popover for this one to stack on, so an anchored popover is the
 * right affordance there.
 *
 * (The **compact** toolbar presentation expands the same
 * `ExcelReferenceList` inline instead, to avoid a popover-on-popover.)
 *
 * Clicking any row populates the picker's custom-format input via
 * `onPick` AND closes this reference popover so the input gets focus.
 * Width is 420px so long formats don't wrap mid-token.
 */
export function ExcelReferencePopover({
  onPick,
  'data-testid': testId,
}: {
  onPick: (format: string) => void;
  'data-testid'?: string;
}) {
  return (
    <FormatPopover
      width={420}
      trigger={
        <ChromeButton
          type="button"
          title="Excel format reference"
          data-testid={testId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            background: 'var(--ds-surface-ground)',
            border: '1px solid var(--ds-border-secondary)',
            borderRadius: 2,
            color: 'var(--ds-text-muted)',
            cursor: 'pointer',
          }}
        >
          <Info size={12} strokeWidth={1.75} />
        </ChromeButton>
      }
    >
      {({ close }) => (
        <ExcelReferenceList
          onPick={(format) => {
            onPick(format);
            close();
          }}
        />
      )}
    </FormatPopover>
  );
}
