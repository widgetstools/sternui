/**
 * StompConfigurationForm — 3-tab orchestrator for STOMP provider configuration.
 * Tabs: Connection, Fields, Columns with context-aware footer actions.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger, Badge, Button } from '@stern/ui';
import { ConnectionTab } from './ConnectionTab.js';
import { FieldsTab } from './FieldsTab.js';
import { ColumnsTab } from './ColumnsTab.js';
import type { StompProviderConfig } from '@stern/shared-types';
import { useConnectionTest, useFieldInference, useColumnConfig } from './hooks/index.js';

interface StompConfigurationFormProps {
  name: string;
  config: StompProviderConfig;
  onChange: (field: string, value: any) => void;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isEditMode?: boolean;
}

export const StompConfigurationForm: React.FC<StompConfigurationFormProps> = ({
  name,
  config,
  onChange,
  onNameChange,
  onSave,
  onCancel,
  isEditMode = false,
}) => {
  const [activeTab, setActiveTab] = useState('connection');
  const isInitialLoadRef = useRef(true);

  const connectionTest = useConnectionTest(config);
  const fieldInference = useFieldInference(config);
  const columnConfig = useColumnConfig(
    fieldInference.inferredFields,
    fieldInference.committedSelectedFields,
    onChange
  );

  // Initialize from existing config on first mount
  useEffect(() => {
    if (!isInitialLoadRef.current) return;
    isInitialLoadRef.current = false;
    fieldInference.initializeFromConfig(config);
    columnConfig.initializeFromConfig(config);
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

  return (
    <div className="h-full w-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-3 rounded-none h-10 bg-muted/50 border-b">
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
        </TabsList>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="connection" className="h-full overflow-auto m-0">
            <ConnectionTab
              name={name}
              config={config}
              onChange={onChange}
              onNameChange={onNameChange}
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
            />
          </TabsContent>
        </div>

        {/* Footer — consistent sm buttons, context-aware left actions */}
        <div className="border-t bg-card px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {activeTab === 'connection' && (
              <Button
                size="sm"
                variant="outline"
                onClick={connectionTest.testConnection}
                disabled={connectionTest.testing || !config.websocketUrl}
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
                    disabled={fieldInference.inferring || !config.websocketUrl}
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
