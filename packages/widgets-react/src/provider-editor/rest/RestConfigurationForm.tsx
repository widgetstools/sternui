/**
 * RestConfigurationForm — 4-tab orchestrator for REST provider configuration.
 * Mirrors StompConfigurationForm structure: Connection / Fields / Columns /
 * Behaviour, with REST-specific Connection and Behaviour tabs and shared
 * Fields + Columns tabs (column build is transport-agnostic).
 *
 * Top header carries the visibility toggle (public ↔ private). Same
 * userId='system' sentinel semantics as STOMP.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger, Badge, Button, Switch, Label } from '@marketsui/ui';
import { RestConnectionTab } from './RestConnectionTab.js';
import { FieldsTab } from '../stomp/FieldsTab.js';
import { ColumnsTab } from '../stomp/ColumnsTab.js';
import { RestBehaviourTab } from './RestBehaviourTab.js';
import type { RestProviderConfig } from '@marketsui/shared-types';
import {
  useRestConnectionTest,
  useRestFieldInference,
  useColumnConfig,
} from './hooks/index.js';

interface RestConfigurationFormProps {
  name: string;
  config: RestProviderConfig;
  isPublic: boolean;
  onPublicChange: (next: boolean) => void;
  onChange: (field: string, value: any) => void;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isEditMode?: boolean;
}

export const RestConfigurationForm: React.FC<RestConfigurationFormProps> = ({
  name,
  config,
  isPublic,
  onPublicChange,
  onChange,
  onNameChange,
  onSave,
  onCancel,
  isEditMode = false,
}) => {
  const [activeTab, setActiveTab] = useState('connection');
  const isInitialLoadRef = useRef(true);

  const connectionTest = useRestConnectionTest(config);
  const fieldInference = useRestFieldInference(config);
  const columnConfig = useColumnConfig(
    fieldInference.inferredFields,
    fieldInference.committedSelectedFields,
    onChange,
  );

  useEffect(() => {
    if (!isInitialLoadRef.current) return;
    isInitialLoadRef.current = false;
    fieldInference.initializeFromConfig(config);
    columnConfig.initializeFromConfig(config as any);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInferFields = async () => {
    await fieldInference.inferFields();
    if (fieldInference.inferredFields.length > 0) {
      setActiveTab('fields');
    }
  };

  const handleClearAllFields = () => {
    fieldInference.clearAllFields();
    columnConfig.clearAll();
  };

  const handleClearAllColumns = () => {
    fieldInference.clearAllFields();
    columnConfig.clearAll();
  };

  const hasMinConfig = Boolean(config.baseUrl) && Boolean(config.endpoint);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Top header — visibility + subtype badge. */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px] uppercase">REST</Badge>
          <span>Snapshot HTTP provider</span>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="provider-public-toggle" className="text-xs cursor-pointer">
            {isPublic ? 'Public' : 'Private'}
          </Label>
          <Switch
            id="provider-public-toggle"
            checked={isPublic}
            onCheckedChange={onPublicChange}
            aria-label="Visibility — public visible to everyone, private to me only"
          />
          <span className="text-[10px] text-muted-foreground hidden md:inline">
            {isPublic
              ? 'Everyone in this app can pick this provider.'
              : 'Only you can pick this provider.'}
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-4 rounded-none h-10 bg-muted/50 border-b">
          <TabsTrigger
            value="connection"
            className="rounded-none text-sm data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
          >
            Connection
          </TabsTrigger>
          <TabsTrigger
            value="fields"
            className="rounded-none text-sm data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
          >
            <span>Fields</span>
            {fieldInference.inferredFields.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {fieldInference.inferredFields.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="columns"
            className="rounded-none text-sm data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
          >
            <span>Columns</span>
            {(fieldInference.committedSelectedFields.size + columnConfig.manualColumns.length) > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {fieldInference.committedSelectedFields.size + columnConfig.manualColumns.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="behaviour"
            className="rounded-none text-sm data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
          >
            <span>Behaviour</span>
            {(config.conflateByKey || (typeof config.throttleMs === 'number' && config.throttleMs > 0)) && (
              <Badge variant="secondary" className="ml-2 text-xs">on</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="connection" className="h-full overflow-auto m-0">
            <RestConnectionTab
              name={name}
              config={config}
              onChange={onChange}
              onNameChange={onNameChange}
              testing={connectionTest.testing}
              testResult={connectionTest.testResult}
              testError={connectionTest.testError}
            />
          </TabsContent>

          <TabsContent value="fields" className="h-full overflow-hidden m-0">
            <FieldsTab
              inferredFields={fieldInference.inferredFields}
              selectedFields={fieldInference.selectedFields}
              expandedFields={fieldInference.expandedFields}
              fieldSearchQuery={fieldInference.fieldSearchQuery}
              selectAllChecked={fieldInference.selectAllChecked}
              selectAllIndeterminate={fieldInference.selectAllIndeterminate}
              onFieldToggle={fieldInference.toggleField}
              onExpandToggle={fieldInference.toggleExpand}
              onSearchChange={fieldInference.setFieldSearchQuery}
              onSelectAllChange={fieldInference.selectAll}
              onClearAll={handleClearAllFields}
              onInferFields={handleInferFields}
              inferring={fieldInference.inferring}
              sampleSize={fieldInference.sampleSize}
              onSampleSizeChange={fieldInference.setSampleSize}
              lastSummary={fieldInference.lastSummary}
            />
          </TabsContent>

          <TabsContent value="columns" className="h-full overflow-hidden m-0">
            <ColumnsTab
              selectedFields={fieldInference.committedSelectedFields}
              inferredFields={fieldInference.inferredFields}
              manualColumns={columnConfig.manualColumns}
              fieldColumnOverrides={columnConfig.fieldColumnOverrides}
              onManualColumnsChange={columnConfig.setManualColumns}
              onFieldColumnOverridesChange={columnConfig.setFieldColumnOverrides}
              onClearAll={handleClearAllColumns}
              config={config}
              onConfigChange={onChange}
            />
          </TabsContent>

          <TabsContent value="behaviour" className="h-full overflow-auto m-0">
            <RestBehaviourTab config={config} onChange={onChange} />
          </TabsContent>
        </div>

        {/* Footer — context-aware left actions. */}
        <div className="border-t bg-card px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {activeTab === 'connection' && (
              <Button
                size="sm"
                variant="outline"
                onClick={connectionTest.testConnection}
                disabled={connectionTest.testing || !hasMinConfig}
              >
                {connectionTest.testing ? 'Testing...' : 'Test Connection'}
              </Button>
            )}

            {activeTab === 'fields' && (
              <>
                {fieldInference.inferredFields.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleInferFields}
                    disabled={fieldInference.inferring || !hasMinConfig}
                  >
                    {fieldInference.inferring ? 'Inferring...' : 'Infer Fields'}
                  </Button>
                )}
                {fieldInference.inferredFields.length > 0 && fieldInference.pendingFieldChanges && (
                  <Button
                    size="sm"
                    onClick={fieldInference.commitFieldSelection}
                  >
                    Update Columns
                  </Button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave}>
              {isEditMode ? 'Update Dataprovider' : 'Create Dataprovider'}
            </Button>
          </div>
        </div>
      </Tabs>
    </div>
  );
};
