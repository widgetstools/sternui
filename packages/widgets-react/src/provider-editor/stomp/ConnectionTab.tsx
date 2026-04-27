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
import { Input, Label, Checkbox, Alert, AlertDescription, Badge } from '@marketsui/ui';
import { Info, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { StompProviderConfig } from '@marketsui/shared-types';

interface ConnectionTabProps {
  name: string;
  config: StompProviderConfig;
  onChange: (field: string, value: any) => void;
  onNameChange: (name: string) => void;
  /** Live test state — surfaced inline as a diagnostics card. */
  testing?: boolean;
  testResult?: { success: boolean; error?: string } | null;
  testError?: string;
}

export const ConnectionTab: React.FC<ConnectionTabProps> = ({
  name,
  config,
  onChange,
  onNameChange,
  testing = false,
  testResult = null,
  testError = '',
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

          {/* Diagnostics — live state of the most recent Test Connection. */}
          <DiagnosticsCard
            testing={testing}
            testResult={testResult}
            testError={testError}
            hasUrl={Boolean(config.websocketUrl)}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Diagnostics card ─────────────────────────────────────────────────

interface DiagnosticsCardProps {
  testing: boolean;
  testResult: { success: boolean; error?: string } | null;
  testError: string;
  hasUrl: boolean;
}

const DiagnosticsCard: React.FC<DiagnosticsCardProps> = ({ testing, testResult, testError, hasUrl }) => {
  let state: 'idle' | 'testing' | 'ok' | 'error';
  let title = 'Diagnostics';
  let detail: React.ReactNode;

  if (testing) {
    state = 'testing';
    title = 'Connecting…';
    detail = <span>Awaiting STOMP handshake + snapshot end-token.</span>;
  } else if (testResult?.success) {
    state = 'ok';
    title = 'Connection OK';
    detail = <span>Last test succeeded — the configured URL accepted the subscribe payload and produced a snapshot.</span>;
  } else if (testResult?.success === false || testError) {
    state = 'error';
    title = 'Connection failed';
    detail = (
      <span className="break-words text-destructive-foreground/90">
        {testResult?.error || testError || 'Unknown error.'}
      </span>
    );
  } else {
    state = 'idle';
    detail = (
      <span>
        {hasUrl
          ? <>Click <strong>Test Connection</strong> in the footer to verify the URL + topic + end-token round-trip.</>
          : <>Enter a WebSocket URL above; the test button enables once a URL is set.</>}
      </span>
    );
  }

  const Icon = state === 'testing' ? Loader2 : state === 'ok' ? CheckCircle2 : state === 'error' ? AlertCircle : Info;
  const accent =
    state === 'ok' ? 'text-green-600 dark:text-green-500'
      : state === 'error' ? 'text-destructive'
      : state === 'testing' ? 'text-primary'
      : 'text-muted-foreground';

  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Diagnostics
        </h3>
        <Badge variant={state === 'ok' ? 'default' : state === 'error' ? 'destructive' : 'outline'} className="text-[10px]">
          {state === 'ok' ? 'Ready' : state === 'error' ? 'Failed' : state === 'testing' ? 'Testing' : 'Idle'}
        </Badge>
      </div>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${accent} ${state === 'testing' ? 'animate-spin' : ''}`} />
        <div className="text-[12px] leading-snug">
          <div className="font-medium">{title}</div>
          <div className="text-muted-foreground mt-0.5">{detail}</div>
        </div>
      </div>
    </section>
  );
};
