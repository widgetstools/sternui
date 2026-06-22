import { ScrollArea } from '@starui/ui';
import { ResearchPanels } from '../panels/ResearchPanels';

export function ResearchTab() {
  return (
    <ScrollArea className="min-h-0 flex-1" data-testid="tab-research">
      <ResearchPanels />
    </ScrollArea>
  );
}
