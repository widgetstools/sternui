/**
 * useFieldInference — hook for inferring fields from STOMP data.
 * Handles field inference, selection, expansion, and two-phase commit.
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@marketsui/ui';
import type { StompProviderConfig } from '@marketsui/shared-types';
import {
  type FieldNode,
  convertFieldInfoToNode,
  collectNonObjectLeaves,
  findFieldByPath,
} from '@marketsui/shared-types';

export interface InferenceSummary {
  /** Rows fetched from the upstream snapshot. */
  rowsFetched: number;
  /** Rows actually used for inference (may be ≤ rowsFetched if sampleSize caps it). */
  rowsUsed: number;
  /** Distinct top-level fields detected. */
  fieldsDetected: number;
}

export interface UseFieldInferenceReturn {
  inferring: boolean;
  inferredFields: FieldNode[];
  selectedFields: Set<string>;
  expandedFields: Set<string>;
  fieldSearchQuery: string;
  selectAllChecked: boolean;
  selectAllIndeterminate: boolean;
  pendingFieldChanges: boolean;
  committedSelectedFields: Set<string>;
  /** Target sample size for the next inference run; user-adjustable in the Fields tab. */
  sampleSize: number;
  setSampleSize: (n: number) => void;
  /** Stats from the last inference run (null until inferFields has run). */
  lastSummary: InferenceSummary | null;
  inferFields: () => Promise<void>;
  toggleField: (path: string) => void;
  toggleExpand: (path: string) => void;
  setFieldSearchQuery: (query: string) => void;
  selectAll: (checked: boolean) => void;
  clearAllFields: () => void;
  commitFieldSelection: () => void;
  initializeFromConfig: (config: StompProviderConfig) => void;
}

/** Default rows used by the configurator's inference run. Capped at 500
 *  in the UI to keep wire + parse time predictable on large snapshots. */
const DEFAULT_SAMPLE_SIZE = 200;

export function useFieldInference(config: StompProviderConfig): UseFieldInferenceReturn {
  const { toast } = useToast();

  const [inferring, setInferring] = useState(false);
  const [inferredFields, setInferredFields] = useState<FieldNode[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const [selectAllIndeterminate, setSelectAllIndeterminate] = useState(false);
  const [pendingFieldChanges, setPendingFieldChanges] = useState(false);
  const [committedSelectedFields, setCommittedSelectedFields] = useState<Set<string>>(new Set());
  const [sampleSize, setSampleSize] = useState<number>(DEFAULT_SAMPLE_SIZE);
  const [lastSummary, setLastSummary] = useState<InferenceSummary | null>(null);

  // Update select-all checkbox state
  useEffect(() => {
    const allLeafPaths = new Set<string>();

    const collectLeafPaths = (fields: FieldNode[]) => {
      fields.forEach(field => {
        if (field.type !== 'object' || !field.children || field.children.length === 0) {
          allLeafPaths.add(field.path);
        }
        if (field.children) collectLeafPaths(field.children);
      });
    };
    collectLeafPaths(inferredFields);

    const selectedCount = Array.from(allLeafPaths).filter(p => selectedFields.has(p)).length;
    const totalCount = allLeafPaths.size;

    if (selectedCount === 0) {
      setSelectAllChecked(false);
      setSelectAllIndeterminate(false);
    } else if (selectedCount === totalCount) {
      setSelectAllChecked(true);
      setSelectAllIndeterminate(false);
    } else {
      setSelectAllChecked(false);
      setSelectAllIndeterminate(true);
    }
  }, [selectedFields, inferredFields]);

  const inferFields = useCallback(async () => {
    setInferring(true);

    if (!config.websocketUrl) {
      toast({ title: 'Field Inference Failed', description: 'WebSocket URL is required', variant: 'destructive' });
      setInferring(false);
      return;
    }

    try {
      const { StompDataProvider } = await import('@marketsui/data-plane');

      const provider = new StompDataProvider({
        websocketUrl: config.websocketUrl,
        listenerTopic: config.listenerTopic || '',
        requestMessage: config.requestMessage,
        requestBody: config.requestBody || 'START',
        snapshotEndToken: config.snapshotEndToken || 'Success',
        keyColumn: config.keyColumn,
        messageRate: config.messageRate,
        snapshotTimeoutMs: config.snapshotTimeoutMs || 60000,
        dataType: config.dataType,
        batchSize: config.batchSize,
      });

      // Fetch some headroom over the target sample size so completeness-
      // weighted filtering has rows to choose from. STOMP snapshots are
      // capped on the upstream side anyway; we ask for what we want.
      const fetchSize = Math.min(Math.max(sampleSize * 2, sampleSize + 50), 1000);
      const result = await provider.fetchSnapshot(fetchSize);

      if (!result.success || !result.data || result.data.length === 0) {
        toast({ title: 'Field Inference Failed', description: result.error || 'No data received from STOMP server', variant: 'destructive' });
        setInferring(false);
        return;
      }

      const inferredFieldsMap = StompDataProvider.inferFields(result.data, { targetSampleSize: sampleSize });
      const fieldNodes = Object.values(inferredFieldsMap).map(f => convertFieldInfoToNode(f));

      setInferredFields(fieldNodes);
      setLastSummary({
        rowsFetched: result.data.length,
        rowsUsed: Math.min(result.data.length, sampleSize),
        fieldsDetected: fieldNodes.length,
      });

      // Auto-expand object fields
      const objectPaths = new Set<string>();
      const findObjects = (fields: FieldNode[]) => {
        fields.forEach(f => {
          if (f.children) {
            objectPaths.add(f.path);
            findObjects(f.children);
          }
        });
      };
      findObjects(fieldNodes);
      setExpandedFields(objectPaths);

      toast({
        title: 'Fields Inferred',
        description: `Found ${fieldNodes.length} fields from ${Math.min(result.data.length, sampleSize)} sample rows (of ${result.data.length} fetched)`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to infer fields';
      toast({ title: 'Field Inference Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setInferring(false);
    }
  }, [config, toast]);

  const toggleField = useCallback((path: string) => {
    const field = findFieldByPath(path, inferredFields);
    if (!field) return;

    setSelectedFields(prev => {
      const next = new Set(prev);

      if (field.type === 'object') {
        const leafPaths = collectNonObjectLeaves(field);
        const allSelected = leafPaths.every(p => next.has(p));
        if (allSelected) {
          leafPaths.forEach(p => next.delete(p));
        } else {
          leafPaths.forEach(p => next.add(p));
        }
      } else {
        if (next.has(path)) next.delete(path);
        else next.add(path);
      }

      return next;
    });
    setPendingFieldChanges(true);
  }, [inferredFields]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedFields(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allLeafPaths = new Set<string>();
      const collectLeafPaths = (fields: FieldNode[]) => {
        fields.forEach(f => {
          if (f.type !== 'object' || !f.children || f.children.length === 0) {
            allLeafPaths.add(f.path);
          }
          if (f.children) collectLeafPaths(f.children);
        });
      };
      collectLeafPaths(inferredFields);
      setSelectedFields(allLeafPaths);
    } else {
      setSelectedFields(new Set());
    }
    setPendingFieldChanges(true);
  }, [inferredFields]);

  const clearAllFields = useCallback(() => {
    setInferredFields([]);
    setSelectedFields(new Set());
    setCommittedSelectedFields(new Set());
    setFieldSearchQuery('');
    setPendingFieldChanges(false);
  }, []);

  const commitFieldSelection = useCallback(() => {
    setCommittedSelectedFields(new Set(selectedFields));
    setPendingFieldChanges(false);
    toast({ title: 'Columns Updated', description: `${selectedFields.size} field(s) will be used as columns` });
  }, [selectedFields, toast]);

  const initializeFromConfig = useCallback((cfg: StompProviderConfig) => {
    if (cfg.inferredFields && cfg.inferredFields.length > 0) {
      const fieldNodes = cfg.inferredFields.map(convertFieldInfoToNode);
      setInferredFields(fieldNodes);

      // Auto-expand objects
      const objectPaths = new Set<string>();
      const findObjects = (fields: FieldNode[]) => {
        fields.forEach(f => {
          if (f.children) {
            objectPaths.add(f.path);
            findObjects(f.children);
          }
        });
      };
      findObjects(fieldNodes);
      setExpandedFields(objectPaths);

      // Restore selected fields from column definitions
      if (cfg.columnDefinitions && cfg.columnDefinitions.length > 0) {
        const selected = new Set<string>();
        cfg.columnDefinitions.forEach(col => {
          if (cfg.inferredFields?.some(field => field.path === col.field)) {
            selected.add(col.field);
          }
        });
        setSelectedFields(selected);
        setCommittedSelectedFields(selected);
      }
    }
  }, []);

  return {
    inferring,
    inferredFields,
    selectedFields,
    expandedFields,
    fieldSearchQuery,
    selectAllChecked,
    selectAllIndeterminate,
    pendingFieldChanges,
    committedSelectedFields,
    sampleSize,
    setSampleSize,
    lastSummary,
    inferFields,
    toggleField,
    toggleExpand,
    setFieldSearchQuery,
    selectAll,
    clearAllFields,
    commitFieldSelection,
    initializeFromConfig,
  };
}
