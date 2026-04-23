import React, { useState, useCallback } from 'react';
import {
  Button,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@stern/ui';
import { Plus, Database, ChevronRight, Settings } from 'lucide-react';
import type { DataProviderConfig, ProviderType } from '@stern/shared-types';
import { getDefaultProviderConfig } from '@stern/shared-types';
import { useDeleteDataProvider } from './hooks/useDataProviderQueries.js';
import { ProviderList } from './ProviderList.js';
import { ProviderForm } from './ProviderForm.js';
import { TypeSelectionDialog } from './TypeSelectionDialog.js';

const SYSTEM_USER_ID = 'System';

interface DataProviderEditorProps {
  userId?: string;
}

export const DataProviderEditor: React.FC<DataProviderEditorProps> = ({
  userId = SYSTEM_USER_ID,
}) => {
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<DataProviderConfig | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<DataProviderConfig | null>(null);

  const deleteMutation = useDeleteDataProvider();

  const handleCreate = useCallback(() => {
    setShowTypeDialog(true);
  }, []);

  const handleDelete = useCallback((provider: DataProviderConfig) => {
    setProviderToDelete(provider);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!providerToDelete?.providerId) return;
    try {
      await deleteMutation.mutateAsync({ providerId: providerToDelete.providerId, userId });
      if (currentProvider?.providerId === providerToDelete.providerId) {
        setCurrentProvider(null);
      }
    } catch {
      // Toast handled by mutation hook
    } finally {
      setProviderToDelete(null);
    }
  }, [providerToDelete, deleteMutation, userId, currentProvider]);

  const handleTypeSelect = useCallback(
    (providerType: ProviderType) => {
      const newProvider: DataProviderConfig = {
        name: '',
        description: '',
        providerType,
        config: getDefaultProviderConfig(providerType) as DataProviderConfig['config'],
        tags: [],
        isDefault: false,
        userId,
      };
      setCurrentProvider(newProvider);
    },
    [userId]
  );

  return (
    <div className="flex h-full bg-background">
      {/* Left Sidebar */}
      <div className="w-72 border-r border-border flex flex-col bg-muted/30">
        <div className="px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Dataproviders</h2>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <ProviderList
            userId={userId}
            currentProvider={currentProvider}
            onSelect={setCurrentProvider}
            onDelete={handleDelete}
          />
        </div>

        <div className="p-3 border-t border-border bg-card">
          <Button onClick={handleCreate} className="w-full" size="sm" disabled={currentProvider !== null && !currentProvider.providerId}>
            <Plus className="w-4 h-4 mr-2" />
            New Dataprovider
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-background">
        {currentProvider ? (
          <>
            {/* Breadcrumb */}
            <div className="px-6 py-3 border-b border-border bg-card flex-shrink-0">
              <div className="flex items-center gap-2 text-sm">
                <Database className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Dataproviders</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{currentProvider.name || 'Untitled'}</span>
                {!currentProvider.providerId && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md border border-blue-500/20">
                    New
                  </span>
                )}
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 min-h-0 flex flex-col">
              <ProviderForm
                userId={userId}
                provider={currentProvider}
                onClose={() => setCurrentProvider(null)}
                onSave={() => {
                  console.log('[DataProviderEditor] Provider saved');
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Settings className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No DataProvider Selected</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Select an existing datasource from the sidebar to view and edit its configuration,
                or create a new one to get started.
              </p>
              <Button onClick={handleCreate} size="lg" className="gap-2">
                <Plus className="w-4 h-4" />
                Create New Dataprovider
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Type Selection Dialog */}
      <TypeSelectionDialog
        open={showTypeDialog}
        onClose={() => setShowTypeDialog(false)}
        onSelect={handleTypeSelect}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!providerToDelete} onOpenChange={() => setProviderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data Provider</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{providerToDelete?.name || 'this data provider'}"?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
