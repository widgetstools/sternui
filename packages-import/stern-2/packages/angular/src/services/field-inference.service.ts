import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { StompProviderConfig, FieldNode } from '@stern/shared-types';
import { convertFieldInfoToNode, collectNonObjectLeaves, findFieldByPath } from '@stern/shared-types';
import { StompDataProvider } from '@stern/widgets';

export interface FieldInferenceState {
  inferring: boolean;
  inferredFields: FieldNode[];
  selectedFields: Set<string>;
  expandedFields: Set<string>;
  fieldSearchQuery: string;
  selectAllChecked: boolean;
  selectAllIndeterminate: boolean;
  pendingFieldChanges: boolean;
  committedSelectedFields: Set<string>;
}

const initialState: FieldInferenceState = {
  inferring: false,
  inferredFields: [],
  selectedFields: new Set(),
  expandedFields: new Set(),
  fieldSearchQuery: '',
  selectAllChecked: false,
  selectAllIndeterminate: false,
  pendingFieldChanges: false,
  committedSelectedFields: new Set(),
};

@Injectable()
export class FieldInferenceService {
  private _state = new BehaviorSubject<FieldInferenceState>({ ...initialState });
  readonly state$: Observable<FieldInferenceState> = this._state.asObservable();

  get snapshot(): FieldInferenceState {
    return this._state.value;
  }

  private patch(partial: Partial<FieldInferenceState>): void {
    this._state.next({ ...this._state.value, ...partial });
  }

  private updateSelectAll(fields: FieldNode[], selected: Set<string>): void {
    const allLeafPaths = new Set<string>();
    const collect = (nodes: FieldNode[]) => {
      nodes.forEach(f => {
        if (f.type !== 'object' || !f.children || f.children.length === 0) allLeafPaths.add(f.path);
        if (f.children) collect(f.children);
      });
    };
    collect(fields);
    const selectedCount = Array.from(allLeafPaths).filter(p => selected.has(p)).length;
    const total = allLeafPaths.size;
    if (selectedCount === 0) {
      this.patch({ selectAllChecked: false, selectAllIndeterminate: false });
    } else if (selectedCount === total) {
      this.patch({ selectAllChecked: true, selectAllIndeterminate: false });
    } else {
      this.patch({ selectAllChecked: false, selectAllIndeterminate: true });
    }
  }

  async inferFields(config: StompProviderConfig): Promise<void> {
    if (!config.websocketUrl) {
      throw new Error('WebSocket URL is required');
    }
    this.patch({ inferring: true });
    try {
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
      const result = await provider.fetchSnapshot(100);
      if (!result.success || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'No data received from STOMP server');
      }
      const inferredFieldsMap = StompDataProvider.inferFields(result.data);
      const fieldNodes: FieldNode[] = Object.values(inferredFieldsMap).map((f: any) => convertFieldInfoToNode(f));
      const objectPaths = new Set<string>();
      const findObjects = (nodes: FieldNode[]) => {
        nodes.forEach(n => { if (n.children) { objectPaths.add(n.path); findObjects(n.children); } });
      };
      findObjects(fieldNodes);
      const newState = { ...this._state.value, inferredFields: fieldNodes, expandedFields: objectPaths, inferring: false };
      this._state.next(newState);
      this.updateSelectAll(fieldNodes, newState.selectedFields);
    } catch (error) {
      this.patch({ inferring: false });
      throw error;
    }
  }

  toggleField(path: string): void {
    const { inferredFields, selectedFields } = this._state.value;
    const field = findFieldByPath(path, inferredFields);
    if (!field) return;
    const next = new Set(selectedFields);
    if (field.type === 'object') {
      const leafPaths = collectNonObjectLeaves(field);
      const allSelected = leafPaths.every(p => next.has(p));
      if (allSelected) leafPaths.forEach(p => next.delete(p));
      else leafPaths.forEach(p => next.add(p));
    } else {
      if (next.has(path)) next.delete(path);
      else next.add(path);
    }
    this.patch({ selectedFields: next, pendingFieldChanges: true });
    this.updateSelectAll(inferredFields, next);
  }

  toggleExpand(path: string): void {
    const next = new Set(this._state.value.expandedFields);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.patch({ expandedFields: next });
  }

  setFieldSearchQuery(query: string): void {
    this.patch({ fieldSearchQuery: query });
  }

  selectAll(checked: boolean): void {
    const { inferredFields } = this._state.value;
    if (checked) {
      const allLeafPaths = new Set<string>();
      const collect = (nodes: FieldNode[]) => {
        nodes.forEach(f => {
          if (f.type !== 'object' || !f.children || f.children.length === 0) allLeafPaths.add(f.path);
          if (f.children) collect(f.children);
        });
      };
      collect(inferredFields);
      this.patch({ selectedFields: allLeafPaths, pendingFieldChanges: true });
      this.updateSelectAll(inferredFields, allLeafPaths);
    } else {
      this.patch({ selectedFields: new Set(), pendingFieldChanges: true });
      this.updateSelectAll(inferredFields, new Set());
    }
  }

  clearAllFields(): void {
    this._state.next({ ...initialState });
  }

  commitFieldSelection(): void {
    const { selectedFields } = this._state.value;
    this.patch({ committedSelectedFields: new Set(selectedFields), pendingFieldChanges: false });
  }

  initializeFromConfig(config: StompProviderConfig): void {
    if (!config.inferredFields || config.inferredFields.length === 0) return;
    const fieldNodes = config.inferredFields.map(convertFieldInfoToNode);
    const objectPaths = new Set<string>();
    const findObjects = (nodes: FieldNode[]) => {
      nodes.forEach(n => { if (n.children) { objectPaths.add(n.path); findObjects(n.children); } });
    };
    findObjects(fieldNodes);
    const selected = new Set<string>();
    if (config.columnDefinitions?.length) {
      config.columnDefinitions.forEach(col => {
        if (config.inferredFields?.some(f => f.path === col.field)) selected.add(col.field);
      });
    }
    this._state.next({
      ...initialState,
      inferredFields: fieldNodes,
      expandedFields: objectPaths,
      selectedFields: selected,
      committedSelectedFields: selected,
    });
    this.updateSelectAll(fieldNodes, selected);
  }
}
