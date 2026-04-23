/**
 * ConnectionTab — STOMP connection configuration UI.
 * Two-column layout with basic/topic config and data/options.
 *
 * Unified form design system (matches DockConfigurator):
 *   Container: p-6 (24px)
 *   Column gap: gap-8 (32px)
 *   Sections: rounded-lg border bg-muted/30 p-4
 *   Section gap: space-y-5 (20px) between sections
 *   Field gap: space-y-3.5 (14px) within sections
 *   Label-to-input: space-y-1.5 (6px)
 *   Labels: text-xs font-medium text-muted-foreground
 *   Inputs: h-8 text-sm
 *   Section header: text-xs font-semibold uppercase tracking-wider text-muted-foreground
 *   Helper text: text-[11px] text-muted-foreground
 */

import React from 'react';
import { Input, Label, Checkbox, Alert, AlertDescription } from '@stern/ui';
import { Info } from 'lucide-react';
import type { StompProviderConfig } from '@stern/shared-types';

interface ConnectionTabProps {
  name: string;
  config: StompProviderConfig;
  onChange: (field: string, value: any) => void;
  onNameChange: (name: string) => void;
}

export const ConnectionTab: React.FC<ConnectionTabProps> = ({
  name,
  config,
  onChange,
  onNameChange,
}) => {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column — Basic + Topic Configuration */}
        <div className="space-y-5">
          {/* Basic Configuration */}
          <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Basic Configuration
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="providerName" className="text-xs font-medium text-muted-foreground">
                Data Provider Name *
              </Label>
              <Input
                id="providerName"
                value={name}
                onChange={e => onNameChange(e.target.value)}
                placeholder="Enter data provider name"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="websocketUrl" className="text-xs font-medium text-muted-foreground">
                WebSocket URL *
              </Label>
              <Input
                id="websocketUrl"
                value={config.websocketUrl || ''}
                onChange={e => onChange('websocketUrl', e.target.value)}
                placeholder="ws://localhost:15674/ws"
                className="h-8 text-sm"
              />
            </div>
          </section>

          {/* Topic Configuration */}
          <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Topic Configuration
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="listenerTopic" className="text-xs font-medium text-muted-foreground">
                Listener Topic *
              </Label>
              <Input
                id="listenerTopic"
                value={config.listenerTopic || ''}
                onChange={e => onChange('listenerTopic', e.target.value)}
                placeholder="/topic/positions"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="requestMessage" className="text-xs font-medium text-muted-foreground">
                Trigger Topic
              </Label>
              <Input
                id="requestMessage"
                value={config.requestMessage || ''}
                onChange={e => onChange('requestMessage', e.target.value)}
                placeholder="/app/subscribe"
                className="h-8 text-sm"
              />
            </div>
            <Alert className="bg-background">
              <Info className="h-3.5 w-3.5" />
              <AlertDescription className="text-[11px]">
                Topics support template variables: <code className="bg-muted px-1 rounded text-[11px]">[variable]</code> and{' '}
                <code className="bg-muted px-1 rounded text-[11px]">{'{dataprovider.variable}'}</code>
              </AlertDescription>
            </Alert>
          </section>
        </div>

        {/* Right Column — Data Configuration + Options */}
        <div className="space-y-5">
          {/* Data Configuration */}
          <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Data Configuration
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="snapshotEndToken" className="text-xs font-medium text-muted-foreground">
                Snapshot End Token
              </Label>
              <Input
                id="snapshotEndToken"
                value={config.snapshotEndToken || ''}
                onChange={e => onChange('snapshotEndToken', e.target.value)}
                placeholder="Success"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keyColumn" className="text-xs font-medium text-muted-foreground">
                Key Column
              </Label>
              <Input
                id="keyColumn"
                value={config.keyColumn || ''}
                onChange={e => onChange('keyColumn', e.target.value)}
                placeholder="e.g., id, orderId, positionId"
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Unique row identifier for delta updates</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snapshotTimeoutMs" className="text-xs font-medium text-muted-foreground">
                Snapshot Timeout (ms)
              </Label>
              <Input
                id="snapshotTimeoutMs"
                type="number"
                value={config.snapshotTimeoutMs || 60000}
                onChange={e => onChange('snapshotTimeoutMs', parseInt(e.target.value) || 60000)}
                min={10000}
                max={600000}
                className="h-8 text-sm"
              />
            </div>
          </section>

          {/* Options */}
          <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Options
            </h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="autoStart"
                checked={config.autoStart || false}
                onCheckedChange={checked => onChange('autoStart', checked)}
              />
              <Label htmlFor="autoStart" className="text-xs font-normal text-muted-foreground">
                Auto-start on application load
              </Label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
