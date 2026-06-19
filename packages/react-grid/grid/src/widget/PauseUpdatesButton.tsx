/**
 * PrimaryToolbar action — freeze / resume this grid's realtime data stream
 * on demand. Reads the host-supplied {@link ProviderGridHostApi} from context
 * (so PrimaryToolbar stays view-only); renders nothing when the grid isn't
 * hosted by MarketsGridContainer (no provider to pause).
 */
import { memo, type ReactElement } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@starui/ui';
import { useProviderGridHost } from '../customizer/providerGridHost/ProviderGridHostContext';

export const PauseUpdatesButton = memo(function PauseUpdatesButton(): ReactElement | null {
  const host = useProviderGridHost();
  if (!host?.available) return null;

  const { paused, onTogglePause } = host;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="ds-primary-action"
      onClick={onTogglePause}
      title={paused ? 'Resume live updates' : 'Pause live updates'}
      aria-label={paused ? 'Resume live updates' : 'Pause live updates'}
      data-testid="pause-updates-toggle"
      data-active={paused ? 'true' : 'false'}
      aria-pressed={paused}
    >
      {paused ? <Play size={14} strokeWidth={2} /> : <Pause size={14} strokeWidth={2} />}
    </Button>
  );
});
