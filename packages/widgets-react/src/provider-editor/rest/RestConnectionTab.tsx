/**
 * RestConnectionTab — REST endpoint configuration UI.
 * Two-column layout matching the STOMP variant:
 *   • Left: Basic + Endpoint (method, URL, rowsPath)
 *   • Right: Headers/Query/Body + Auth + Diagnostics
 *
 * Design tokens follow ConnectionTab.tsx exactly so the two configurators
 * feel like halves of the same product.
 */

import React from 'react';
import {
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
  Badge,
  Separator,
} from '@marketsui/ui';
import { Info, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { RestProviderConfig } from '@marketsui/shared-types';
import { KeyValueEditor } from '../KeyValueEditor.js';
import type { ConnectionTestResult } from './hooks/useRestConnectionTest.js';

interface RestConnectionTabProps {
  name: string;
  config: RestProviderConfig;
  onChange: (field: string, value: any) => void;
  onNameChange: (name: string) => void;
  testing?: boolean;
  testResult?: ConnectionTestResult | null;
  testError?: string;
}

export const RestConnectionTab: React.FC<RestConnectionTabProps> = ({
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
        {/* Left Column — Basic + Endpoint */}
        <div className="space-y-5">
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
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="method" className="text-xs font-medium text-muted-foreground">
                  Method
                </Label>
                <Select value={config.method || 'GET'} onValueChange={v => onChange('method', v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="baseUrl" className="text-xs font-medium text-muted-foreground">
                  Base URL *
                </Label>
                <Input
                  id="baseUrl"
                  value={config.baseUrl || ''}
                  onChange={e => onChange('baseUrl', e.target.value)}
                  placeholder="https://api.example.com"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endpoint" className="text-xs font-medium text-muted-foreground">
                Endpoint *
              </Label>
              <Input
                id="endpoint"
                value={config.endpoint || ''}
                onChange={e => onChange('endpoint', e.target.value)}
                placeholder="/v1/positions"
                className="h-8 text-sm"
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Response Shape
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="rowsPath" className="text-xs font-medium text-muted-foreground">
                Rows Path
              </Label>
              <Input
                id="rowsPath"
                value={config.rowsPath || ''}
                onChange={e => onChange('rowsPath', e.target.value)}
                placeholder="data.results"
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Dot-notation path inside the JSON response that holds the rows array.
                Leave empty if the response is the array itself.
              </p>
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
              <p className="text-[11px] text-muted-foreground">
                Unique row identifier — drives row dedup and AG-Grid getRowId.
              </p>
            </div>
            <Alert className="bg-background">
              <Info className="h-3.5 w-3.5" />
              <AlertDescription className="text-[11px]">
                Body templates support <code className="bg-muted px-1 rounded text-[11px]">{'{{providerId.key}}'}</code> tokens —
                resolved at request time by the worker.
              </AlertDescription>
            </Alert>
          </section>
        </div>

        {/* Right Column — Request payload + Auth + Diagnostics */}
        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Request Payload
            </h3>
            <KeyValueEditor
              label="Query Parameters"
              description="URL query string parameters."
              value={config.queryParams || {}}
              onChange={v => onChange('queryParams', v)}
              keyPlaceholder="Parameter"
              valuePlaceholder="Value"
            />
            <Separator />
            <KeyValueEditor
              label="Custom Headers"
              description="HTTP headers for every request."
              value={config.headers || {}}
              onChange={v => onChange('headers', v)}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
            />
            {config.method === 'POST' && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <Label htmlFor="body" className="text-xs font-medium text-muted-foreground">
                    Request Body (JSON)
                  </Label>
                  <Textarea
                    id="body"
                    value={config.body || ''}
                    onChange={e => onChange('body', e.target.value)}
                    placeholder='{"filter": "active", "asOfDate": "{{asOfDate}}"}'
                    rows={5}
                    className="font-mono text-xs"
                  />
                </div>
              </>
            )}
          </section>

          <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Authentication
            </h3>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Auth Type</Label>
              <Select
                value={config.auth?.type || 'none'}
                onValueChange={v => {
                  if (v === 'none') {
                    onChange('auth', undefined);
                  } else {
                    onChange('auth', { ...(config.auth || {}), type: v, credentials: config.auth?.credentials || '' });
                  }
                }}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="apikey">API Key</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.auth && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Credentials</Label>
                  <Input
                    type="password"
                    value={config.auth.credentials || ''}
                    onChange={e => onChange('auth', { ...config.auth, credentials: e.target.value })}
                    placeholder={config.auth.type === 'basic' ? 'base64(user:pass)' : 'token'}
                    className="h-8 text-sm"
                  />
                </div>
                {config.auth.type === 'apikey' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Header Name</Label>
                    <Input
                      value={config.auth.headerName || ''}
                      onChange={e => onChange('auth', { ...config.auth, headerName: e.target.value })}
                      placeholder="X-API-Key"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <DiagnosticsCard
            testing={testing}
            testResult={testResult}
            testError={testError}
            hasUrl={Boolean(config.baseUrl) && Boolean(config.endpoint)}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Diagnostics card ─────────────────────────────────────────────────

interface DiagnosticsCardProps {
  testing: boolean;
  testResult: ConnectionTestResult | null;
  testError: string;
  hasUrl: boolean;
}

const DiagnosticsCard: React.FC<DiagnosticsCardProps> = ({ testing, testResult, testError, hasUrl }) => {
  let state: 'idle' | 'testing' | 'ok' | 'error';
  let title = 'Diagnostics';
  let detail: React.ReactNode;

  if (testing) {
    state = 'testing';
    title = 'Fetching…';
    detail = <span>Sending the configured request and parsing the response.</span>;
  } else if (testResult?.success) {
    state = 'ok';
    title = 'Endpoint OK';
    detail = (
      <span>
        Last fetch returned <strong className="text-foreground">{testResult.rowCount ?? 0}</strong> row(s)
        from the configured rows path.
      </span>
    );
  } else if (testResult?.success === false || testError) {
    state = 'error';
    title = 'Fetch failed';
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
          ? <>Click <strong>Test Connection</strong> in the footer to verify the endpoint, auth, and rows path.</>
          : <>Enter Base URL + Endpoint above; the test button enables once both are set.</>}
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
