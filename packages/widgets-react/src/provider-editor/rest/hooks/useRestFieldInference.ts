/**
 * useRestFieldInference — REST analogue of useFieldInference.
 *
 * Same UI surface (selection + expansion + two-phase commit + sample
 * picker + summary), driven by `RestDataProvider.fetchSnapshot` instead
 * of a STOMP probe. The schema-derivation step itself is shared:
 * `StompDataProvider.inferFields(rows, opts)` is a pure helper that
 * walks rows and produces a `FieldInfo` map regardless of transport.
 *
 * Sample-size semantics
 * ---------------------
 * REST endpoints typically return a single fixed payload — there's no
 * server-side knob to "ask for more rows for inference". The fetch
 * brings whatever the endpoint returns, and `targetSampleSize` then
 * trims it down via completeness-weighted sorting. The user-facing
 * sample-size picker therefore controls **how many rows are kept for
 * scoring**, not how many are fetched.
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@marketsui/ui';
import type { RestProviderConfig } from '@marketsui/shared-types';
import {
  type FieldNode,
  convertFieldInfoToNode,
  collectNonObjectLeaves,
  findFieldByPath,
} from '@marketsui/shared-types';
import type { InferenceSummary } from '../../stomp/hooks/useFieldInference.js';

export interface UseRestFieldInferenceReturn {
  inferring: boolean;
  inferredFields: FieldNode[];
  selectedFields: Set<string>;
  expandedFields: Set<string>;
  fieldSearchQuery: string;
  selectAllChecked: boolean;
  selectAllIndeterminate: boolean;
  pendingFieldChanges: boolean;
  committedSelectedFields: Set<string>;
  sampleSize: number;
  setSampleSize: (n: number) => void;
  lastSummary: InferenceSummary | null;
  inferFields: () => Promise<void>;
  toggleField: (path: string) => void;
  toggleExpand: (path: string) => void;
  setFieldSearchQuery: (query: string) => void;
  selectAll: (checked: boolean) => void;
  clearAllFields: () => void;
  commitFieldSelection: () => void;
  initializeFromConfig: (config: RestProviderConfig) => void;
}

const DEFAULT_SAMPLE_SIZE = 200;

export function useRestFieldInference(config: RestProviderConfig): UseRestFieldInferenceReturn {
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

  // Keep select-all checkbox state in sync (same logic as STOMP).
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

    if (!config.baseUrl || !config.endpoint) {
      toast({
        title: 'Field Inference Failed',
        description: 'Base URL and Endpoint are required',
        variant: 'destructive',
      });
      setInferring(false);
      return;
    }

    try {
      const { RestDataProvider, StompDataProvider } = await import('@marketsui/data-plane');

      const result = await RestDataProvider.fetchSnapshot({
        ...config,
        keyColumn: config.keyColumn || '__probe__',
      });

      if (!result.success || !result.data || result.data.length === 0) {
        toast({
          title: 'Field Inference Failed',
          description: result.error || 'No data returned by the endpoint',
          variant: 'destructive',
        });
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

      // Auto-expand object fields.
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
  }, [config, sampleSize, toast]);

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

  const initializeFromConfig = useCallback((cfg: RestProviderConfig) => {
    if (cfg.inferredFields && cfg.inferredFields.length > 0) {
      const fieldNodes = cfg.inferredFields.map(convertFieldInfoToNode);
      setInferredFields(fieldNodes);

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
