import { Band, IconInput } from '../../../ui/SettingsPanel';
import { Row } from './Row';

export function HeaderBand({
  colId,
  hostHeaderName,
  headerName,
  headerTooltip,
  setDraft,
}: {
  colId: string;
  hostHeaderName: string;
  headerName: string | undefined;
  headerTooltip: string | undefined;
  setDraft: (patch: { headerName?: string; headerTooltip?: string }) => void;
}) {
  return (
    <Band index="01" title="HEADER">
      <Row
        label="HEADER NAME"
        hint="Blank = use the host-supplied header"
        control={
          <IconInput
            value={headerName ?? ''}
            onCommit={(v) => setDraft({ headerName: v.trim() ? v : undefined })}
            placeholder={hostHeaderName}
            data-testid={`cols-${colId}-header-name`}
            style={{ maxWidth: 260 }}
          />
        }
      />
      <Row
        label="TOOLTIP"
        control={
          <IconInput
            value={headerTooltip ?? ''}
            onCommit={(v) => setDraft({ headerTooltip: v.trim() ? v : undefined })}
            data-testid={`cols-${colId}-header-tooltip`}
            style={{ maxWidth: 320 }}
          />
        }
      />
    </Band>
  );
}
