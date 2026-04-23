import React, { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Alert,
  AlertDescription,
  useToast,
} from '@marketsui/ui';
import { Info } from 'lucide-react';
import {
  useCreateDataProvider,
  useUpdateDataProvider,
} from './hooks/useDataProviderQueries.js';
import type {
  DataProviderConfig,
  StompProviderConfig,
  RestProviderConfig,
  WebSocketProviderConfig,
  SocketIOProviderConfig,
  MockProviderConfig,
} from '@marketsui/shared-types';
import { PROVIDER_TYPES } from '@marketsui/shared-types';
import { KeyValueEditor } from './KeyValueEditor.js';
import { StompConfigurationForm } from './stomp/StompConfigurationForm.js';

const SYSTEM_USER_ID = 'System';

/**
 * Unified form design tokens (shared across all provider forms & DockConfigurator):
 *   Labels:        text-xs font-medium text-muted-foreground
 *   Inputs:        h-8 text-sm
 *   Select:        h-8 text-sm (on SelectTrigger)
 *   Label→Input:   space-y-1.5
 *   Field gap:     space-y-4
 *   Helper text:   text-[11px] text-muted-foreground
 *   Switch labels: text-xs font-normal text-muted-foreground
 */

interface ProviderFormProps {
  userId?: string;
  provider: DataProviderConfig;
  onClose: () => void;
  onSave?: () => void;
}

export const ProviderForm: React.FC<ProviderFormProps> = ({
  userId = SYSTEM_USER_ID,
  provider,
  onClose,
  onSave,
}) => {
  const { toast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState<DataProviderConfig>(provider);

  useEffect(() => {
    setFormData(provider);
    setIsDirty(false);
  }, [provider]);

  const createMutation = useCreateDataProvider();
  const updateMutation = useUpdateDataProvider();

  const handleSave = useCallback(async () => {
    if (!formData.name || formData.name.trim() === '') {
      toast({ title: 'Validation Failed', description: 'Data provider name is required', variant: 'destructive' });
      return;
    }

    try {
      if (formData.providerId) {
        await updateMutation.mutateAsync({ providerId: formData.providerId, updates: formData, userId });
      } else {
        const created = await createMutation.mutateAsync({ provider: formData, userId });
        setFormData(prev => ({ ...prev, providerId: created.providerId }));
      }
      setIsDirty(false);
      onSave?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save provider';
      toast({ title: 'Save Failed', description: message, variant: 'destructive' });
    }
  }, [formData, userId, createMutation, updateMutation, onSave, toast]);

  const handleFieldChange = useCallback((field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const handleConfigChange = useCallback((field: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      config: { ...prev.config, [field]: value },
    }));
    setIsDirty(true);
  }, []);

  const handleTagsChange = useCallback(
    (tagsString: string) => {
      const tags = tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
      handleFieldChange('tags', tags);
    },
    [handleFieldChange]
  );

  const isEditMode = Boolean(provider.providerId);

  // STOMP uses its own full 3-tab form (Connection, Fields, Columns)
  if (formData.providerType === PROVIDER_TYPES.STOMP) {
    return (
      <StompConfigurationForm
        name={formData.name}
        config={formData.config as StompProviderConfig}
        onChange={handleConfigChange}
        onNameChange={(name: string) => handleFieldChange('name', name)}
        onSave={handleSave}
        onCancel={onClose}
        isEditMode={isEditMode}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Name header */}
      <div className="p-6 border-b bg-card flex-shrink-0">
        <div className="space-y-1.5">
          <Label htmlFor="providerName" className="text-xs font-medium text-muted-foreground">
            Data Provider Name *
          </Label>
          <Input
            id="providerName"
            value={formData.name}
            onChange={e => handleFieldChange('name', e.target.value)}
            placeholder="Enter data provider name"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Provider identification and metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-medium text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={e => handleFieldChange('description', e.target.value)}
                  placeholder="Optional description of this provider"
                  rows={3}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags" className="text-xs font-medium text-muted-foreground">
                  Tags (comma-separated)
                </Label>
                <Input
                  id="tags"
                  value={formData.tags?.join(', ') || ''}
                  onChange={e => handleTagsChange(e.target.value)}
                  placeholder="e.g., trading, real-time, production"
                  className="h-8 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Protocol-Specific Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Connection Configuration</CardTitle>
              <CardDescription>{formData.providerType.toUpperCase()} protocol settings</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="connection">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="connection">Connection</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>

                <TabsContent value="connection" className="space-y-4 mt-4">
                  {formData.providerType === PROVIDER_TYPES.REST && (
                    <RestConfigForm config={formData.config as RestProviderConfig} onChange={handleConfigChange} />
                  )}
                  {formData.providerType === PROVIDER_TYPES.WEBSOCKET && (
                    <WebSocketConfigForm config={formData.config as WebSocketProviderConfig} onChange={handleConfigChange} />
                  )}
                  {formData.providerType === PROVIDER_TYPES.SOCKETIO && (
                    <SocketIOConfigForm config={formData.config as SocketIOProviderConfig} onChange={handleConfigChange} />
                  )}
                  {formData.providerType === PROVIDER_TYPES.MOCK && (
                    <MockConfigForm config={formData.config as MockProviderConfig} onChange={handleConfigChange} />
                  )}
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4 mt-4">
                  {formData.providerType === PROVIDER_TYPES.REST && (
                    <RestAdvancedForm config={formData.config as RestProviderConfig} onChange={handleConfigChange} />
                  )}
                  {formData.providerType === PROVIDER_TYPES.WEBSOCKET && (
                    <WebSocketAdvancedForm config={formData.config as WebSocketProviderConfig} onChange={handleConfigChange} />
                  )}
                  {formData.providerType === PROVIDER_TYPES.SOCKETIO && (
                    <SocketIOAdvancedForm config={formData.config as SocketIOProviderConfig} onChange={handleConfigChange} />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="border-t bg-card px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="text-xs text-muted-foreground">
          {isDirty && <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={createMutation.isPending || updateMutation.isPending || !formData.name.trim()}
          >
            {createMutation.isPending || updateMutation.isPending
              ? 'Saving...'
              : isEditMode
                ? 'Update Dataprovider'
                : 'Create Dataprovider'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── REST Configuration Form ────────────────────────────────────────────────────

const RestConfigForm: React.FC<{
  config: RestProviderConfig;
  onChange: (field: string, value: unknown) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-4">
    <div className="space-y-1.5">
      <Label htmlFor="baseUrl" className="text-xs font-medium text-muted-foreground">Base URL *</Label>
      <Input
        id="baseUrl"
        value={config.baseUrl || ''}
        onChange={e => onChange('baseUrl', e.target.value)}
        placeholder="https://api.example.com"
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="endpoint" className="text-xs font-medium text-muted-foreground">Endpoint *</Label>
      <Input
        id="endpoint"
        value={config.endpoint || ''}
        onChange={e => onChange('endpoint', e.target.value)}
        placeholder="/v1/positions"
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="method" className="text-xs font-medium text-muted-foreground">HTTP Method</Label>
      <Select value={config.method} onValueChange={v => onChange('method', v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="GET">GET</SelectItem>
          <SelectItem value="POST">POST</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <Separator />
    <KeyValueEditor
      label="Query Parameters"
      description="URL query string parameters (e.g., symbol, limit, filter)"
      value={config.queryParams || {}}
      onChange={v => onChange('queryParams', v)}
      keyPlaceholder="Parameter name"
      valuePlaceholder="Parameter value"
    />
    {config.method === 'POST' && (
      <>
        <Separator />
        <div className="space-y-1.5">
          <Label htmlFor="body" className="text-xs font-medium text-muted-foreground">Request Body (JSON)</Label>
          <Textarea
            id="body"
            value={config.body || ''}
            onChange={e => onChange('body', e.target.value)}
            placeholder='{"filter": "active", "sort": "desc"}'
            rows={6}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">Enter valid JSON for the POST request body</p>
        </div>
      </>
    )}
    <Separator />
    <div className="space-y-1.5">
      <Label htmlFor="pollInterval" className="text-xs font-medium text-muted-foreground">Poll Interval (ms)</Label>
      <Input
        id="pollInterval"
        type="number"
        value={config.pollInterval || 5000}
        onChange={e => onChange('pollInterval', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
      <p className="text-[11px] text-muted-foreground">How often to poll the API for updates</p>
    </div>
  </div>
);

// ─── REST Advanced Form ─────────────────────────────────────────────────────────

const RestAdvancedForm: React.FC<{
  config: RestProviderConfig;
  onChange: (field: string, value: unknown) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-4">
    <KeyValueEditor
      label="Custom Headers"
      description="HTTP headers to include with each request"
      value={config.headers || {}}
      onChange={v => onChange('headers', v)}
      keyPlaceholder="Header name"
      valuePlaceholder="Header value"
    />
    <Separator />
    <div className="space-y-1.5">
      <Label htmlFor="timeout" className="text-xs font-medium text-muted-foreground">Request Timeout (ms)</Label>
      <Input
        id="timeout"
        type="number"
        value={config.timeout || 30000}
        onChange={e => onChange('timeout', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
      <p className="text-[11px] text-muted-foreground">Maximum time to wait for a response</p>
    </div>
    <Separator />
    <div className="space-y-1.5">
      <Label htmlFor="paginationMode" className="text-xs font-medium text-muted-foreground">Pagination Mode</Label>
      <Select value={config.paginationMode || 'offset'} onValueChange={v => onChange('paginationMode', v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="offset">Offset-based</SelectItem>
          <SelectItem value="cursor">Cursor-based</SelectItem>
          <SelectItem value="page">Page-based</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">Strategy for paginating through large datasets</p>
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="pageSize" className="text-xs font-medium text-muted-foreground">Page Size</Label>
      <Input
        id="pageSize"
        type="number"
        value={config.pageSize || 100}
        onChange={e => onChange('pageSize', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
      <p className="text-[11px] text-muted-foreground">Number of records to fetch per page</p>
    </div>
    <Alert>
      <Info className="h-3.5 w-3.5" />
      <AlertDescription className="text-[11px]">
        Common headers: Content-Type, Accept, Authorization, X-API-Key
      </AlertDescription>
    </Alert>
  </div>
);

// ─── WebSocket Configuration Form ───────────────────────────────────────────────

const WebSocketConfigForm: React.FC<{
  config: WebSocketProviderConfig;
  onChange: (field: string, value: unknown) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-4">
    <div className="space-y-1.5">
      <Label htmlFor="url" className="text-xs font-medium text-muted-foreground">WebSocket URL *</Label>
      <Input
        id="url"
        value={config.url || ''}
        onChange={e => onChange('url', e.target.value)}
        placeholder="ws://localhost:8080/ws"
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="messageFormat" className="text-xs font-medium text-muted-foreground">Message Format *</Label>
      <Select value={config.messageFormat} onValueChange={v => onChange('messageFormat', v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="json">JSON</SelectItem>
          <SelectItem value="binary">Binary</SelectItem>
          <SelectItem value="text">Text</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="protocol" className="text-xs font-medium text-muted-foreground">Sub-protocol</Label>
      <Input
        id="protocol"
        value={config.protocol || ''}
        onChange={e => onChange('protocol', e.target.value)}
        placeholder="Optional sub-protocol"
        className="h-8 text-sm"
      />
    </div>
  </div>
);

// ─── WebSocket Advanced Form ────────────────────────────────────────────────────

const WebSocketAdvancedForm: React.FC<{
  config: WebSocketProviderConfig;
  onChange: (field: string, value: unknown) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-4">
    <div className="space-y-1.5">
      <Label htmlFor="heartbeatInterval" className="text-xs font-medium text-muted-foreground">Heartbeat Interval (ms)</Label>
      <Input
        id="heartbeatInterval"
        type="number"
        value={config.heartbeatInterval || 30000}
        onChange={e => onChange('heartbeatInterval', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="reconnectAttempts" className="text-xs font-medium text-muted-foreground">Reconnection Attempts</Label>
      <Input
        id="reconnectAttempts"
        type="number"
        value={config.reconnectAttempts || 5}
        onChange={e => onChange('reconnectAttempts', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="reconnectDelay" className="text-xs font-medium text-muted-foreground">Reconnection Delay (ms)</Label>
      <Input
        id="reconnectDelay"
        type="number"
        value={config.reconnectDelay || 5000}
        onChange={e => onChange('reconnectDelay', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
    </div>
  </div>
);

// ─── Socket.IO Configuration Form ───────────────────────────────────────────────

const SocketIOConfigForm: React.FC<{
  config: SocketIOProviderConfig;
  onChange: (field: string, value: unknown) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-4">
    <div className="space-y-1.5">
      <Label htmlFor="url" className="text-xs font-medium text-muted-foreground">Server URL *</Label>
      <Input
        id="url"
        value={config.url || ''}
        onChange={e => onChange('url', e.target.value)}
        placeholder="http://localhost:3000"
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="namespace" className="text-xs font-medium text-muted-foreground">Namespace</Label>
      <Input
        id="namespace"
        value={config.namespace || '/'}
        onChange={e => onChange('namespace', e.target.value)}
        placeholder="/"
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="snapshotEvent" className="text-xs font-medium text-muted-foreground">Snapshot Event Name *</Label>
      <Input
        id="snapshotEvent"
        value={config.events?.snapshot || ''}
        onChange={e => onChange('events', { ...config.events, snapshot: e.target.value })}
        placeholder="snapshot"
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="updateEvent" className="text-xs font-medium text-muted-foreground">Update Event Name *</Label>
      <Input
        id="updateEvent"
        value={config.events?.update || ''}
        onChange={e => onChange('events', { ...config.events, update: e.target.value })}
        placeholder="update"
        className="h-8 text-sm"
      />
    </div>
  </div>
);

// ─── Socket.IO Advanced Form ────────────────────────────────────────────────────

const SocketIOAdvancedForm: React.FC<{
  config: SocketIOProviderConfig;
  onChange: (field: string, value: unknown) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-4">
    <div className="space-y-1.5">
      <Label htmlFor="deleteEvent" className="text-xs font-medium text-muted-foreground">Delete Event Name</Label>
      <Input
        id="deleteEvent"
        value={config.events?.delete || ''}
        onChange={e => onChange('events', { ...config.events, delete: e.target.value })}
        placeholder="delete"
        className="h-8 text-sm"
      />
    </div>
    <div className="flex items-center space-x-2">
      <Switch
        id="reconnection"
        checked={config.reconnection ?? true}
        onCheckedChange={checked => onChange('reconnection', checked)}
      />
      <Label htmlFor="reconnection" className="text-xs font-normal text-muted-foreground">
        Enable Auto-reconnect
      </Label>
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="reconnectionDelay" className="text-xs font-medium text-muted-foreground">Reconnection Delay (ms)</Label>
      <Input
        id="reconnectionDelay"
        type="number"
        value={config.reconnectionDelay || 5000}
        onChange={e => onChange('reconnectionDelay', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
    </div>
  </div>
);

// ─── Mock Configuration Form ────────────────────────────────────────────────────

const MockConfigForm: React.FC<{
  config: MockProviderConfig;
  onChange: (field: string, value: unknown) => void;
}> = ({ config, onChange }) => (
  <div className="space-y-4">
    <div className="space-y-1.5">
      <Label htmlFor="dataType" className="text-xs font-medium text-muted-foreground">Data Type</Label>
      <Select value={config.dataType} onValueChange={v => onChange('dataType', v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="positions">Positions</SelectItem>
          <SelectItem value="trades">Trades</SelectItem>
          <SelectItem value="orders">Orders</SelectItem>
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="rowCount" className="text-xs font-medium text-muted-foreground">Row Count</Label>
      <Input
        id="rowCount"
        type="number"
        value={config.rowCount || 20}
        onChange={e => onChange('rowCount', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="updateInterval" className="text-xs font-medium text-muted-foreground">Update Interval (ms)</Label>
      <Input
        id="updateInterval"
        type="number"
        value={config.updateInterval || 2000}
        onChange={e => onChange('updateInterval', parseInt(e.target.value))}
        className="h-8 text-sm"
      />
    </div>
    <div className="flex items-center space-x-2">
      <Switch
        id="enableUpdates"
        checked={config.enableUpdates ?? true}
        onCheckedChange={checked => onChange('enableUpdates', checked)}
      />
      <Label htmlFor="enableUpdates" className="text-xs font-normal text-muted-foreground">
        Enable Real-time Updates
      </Label>
    </div>
    <Alert>
      <Info className="h-3.5 w-3.5" />
      <AlertDescription className="text-[11px]">
        Mock provider generates random data for testing without external dependencies.
      </AlertDescription>
    </Alert>
  </div>
);
