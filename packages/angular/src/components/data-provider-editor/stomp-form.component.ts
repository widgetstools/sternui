import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import type { StompProviderConfig, FieldNode } from '@marketsui/shared-types';
import { filterFields, collectNonObjectLeaves } from '@marketsui/shared-types';
import { StompDataProvider } from '@marketsui/data-plane';
import { FieldInferenceService, type FieldInferenceState } from '../../services/field-inference.service';

// ─── AG Grid ──────────────────────────────────────────────────────────────────
import type { ColDef, GridReadyEvent } from 'ag-grid-community';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import { AgGridAngular } from 'ag-grid-angular';

ModuleRegistry.registerModules([AllEnterpriseModule]);

@Component({
  selector: 'stern-stomp-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AgGridAngular],
  providers: [FieldInferenceService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-full w-full flex flex-col" [formGroup]="form">
      <!-- Tabs -->
      <div class="grid grid-cols-3 h-10 bg-muted/50 border-b">
        <button
          *ngFor="let tab of tabs"
          type="button"
          (click)="activeTab = tab.id; cdr.markForCheck()"
          [class]="getTabClass(tab.id)"
        >{{ tab.label }}</button>
      </div>

      <!-- Connection Tab -->
      <div *ngIf="activeTab === 'connection'" class="flex-1 overflow-auto p-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Left Column -->
          <div class="space-y-5">
            <section class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Configuration</h3>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">Data Provider Name *</label>
                <input formControlName="name" placeholder="Enter data provider name"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">WebSocket URL *</label>
                <input formControlName="websocketUrl" placeholder="ws://localhost:15674/ws"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <p class="text-[11px] text-muted-foreground">
                  Supports <code class="bg-muted px-1 rounded text-[10px]">{{'{{appData.key}}'}</code> (deterministic)
                  and <code class="bg-muted px-1 rounded text-[10px]">[name]</code> (session-unique ID).
                </p>
              </div>
            </section>

            <section class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Topic Configuration</h3>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">Listener Topic *</label>
                <input formControlName="listenerTopic" placeholder="/topic/orders"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <p class="text-[11px] text-muted-foreground">
                  Use <code class="bg-muted px-1 rounded text-[10px]">[name]</code> for
                  a session-unique ID — same <code class="bg-muted px-1 rounded text-[10px]">[name]</code> in different fields resolve to the same value.
                </p>
              </div>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">Request Topic</label>
                <input formControlName="requestMessage" placeholder="/queue/request"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <p class="text-[11px] text-muted-foreground">
                  Supports <code class="bg-muted px-1 rounded text-[10px]">[name]</code> tokens for session-unique identifiers.
                </p>
              </div>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">Request Body</label>
                <input formControlName="requestBody" placeholder="START"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                <p class="text-[11px] text-muted-foreground">
                  Supports <code class="bg-muted px-1 rounded text-[10px]">[name]</code> tokens for correlation IDs and session-unique identifiers.
                </p>
              </div>
            </section>
          </div>

          <!-- Right Column -->
          <div class="space-y-5">
            <section class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Options</h3>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">Snapshot End Token</label>
                <input formControlName="snapshotEndToken" placeholder="Success"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">Key Column</label>
                <input formControlName="keyColumn" placeholder="id"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div class="space-y-1.5">
                <label class="text-xs font-medium text-muted-foreground">Snapshot Timeout (ms)</label>
                <input formControlName="snapshotTimeoutMs" type="number" placeholder="60000"
                  class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            </section>

            <section class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connection Actions</h3>
              <button type="button" (click)="testConnection()"
                [disabled]="connectionTesting"
                class="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50 gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {{ connectionTesting ? 'Testing...' : 'Test Connection' }}
              </button>
              <p *ngIf="connectionStatus" [class]="'text-xs mt-1 ' + (connectionOk ? 'text-green-500' : 'text-destructive')">
                {{ connectionStatus }}
              </p>
            </section>
          </div>
        </div>
      </div>

      <!-- Fields Tab -->
      <div *ngIf="activeTab === 'fields'" class="flex-1 overflow-hidden flex flex-col">
        <div class="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
          <button type="button" (click)="inferFields()" [disabled]="fieldState.inferring"
            class="inline-flex items-center h-7 px-3 text-xs font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent disabled:opacity-50 gap-1.5">
            {{ fieldState.inferring ? 'Inferring...' : 'Infer Fields' }}
          </button>
          <button *ngIf="fieldState.inferredFields.length > 0" type="button" (click)="commitFields()"
            [disabled]="!fieldState.pendingFieldChanges"
            class="inline-flex items-center h-7 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 gap-1.5">
            Apply Selection
          </button>
          <button *ngIf="fieldState.inferredFields.length > 0" type="button" (click)="fieldInferenceSvc.clearAllFields()"
            class="inline-flex items-center h-7 px-3 text-xs font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent gap-1.5">
            Clear
          </button>
          <input *ngIf="fieldState.inferredFields.length > 0"
            type="text" [value]="fieldState.fieldSearchQuery"
            (input)="fieldInferenceSvc.setFieldSearchQuery($any($event.target).value)"
            placeholder="Search fields..."
            class="h-7 text-xs rounded-md border border-input bg-background px-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ml-auto w-48" />
        </div>
        <div class="flex-1 overflow-auto p-3">
          <ng-container *ngIf="fieldState.inferredFields.length > 0; else noFieldsTpl">
            <div class="mb-2 flex items-center gap-2">
              <input type="checkbox"
                [checked]="fieldState.selectAllChecked"
                [indeterminate]="fieldState.selectAllIndeterminate"
                (change)="fieldInferenceSvc.selectAll($any($event.target).checked)"
                class="h-3.5 w-3.5 rounded border-border" />
              <span class="text-xs text-muted-foreground">Select all ({{ fieldState.selectedFields.size }} selected)</span>
            </div>
            <div class="space-y-0.5">
              <ng-container *ngFor="let field of getFilteredFields()">
                <div [style.padding-left.px]="(field.depth ?? 0) * 16" class="flex items-center gap-2 py-1 text-sm">
                  <button *ngIf="field.children?.length" type="button"
                    (click)="fieldInferenceSvc.toggleExpand(field.path)"
                    class="p-0.5 rounded hover:bg-muted">
                    <svg [class]="'h-3 w-3 transition-transform' + (fieldState.expandedFields.has(field.path) ? ' rotate-90' : '')"
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                  <span *ngIf="!field.children?.length" class="w-4"></span>
                  <input type="checkbox"
                    [checked]="isFieldChecked(field)"
                    [indeterminate]="isFieldIndeterminate(field)"
                    (change)="fieldInferenceSvc.toggleField(field.path)"
                    class="h-3.5 w-3.5 rounded border-border" />
                  <span class="font-mono text-xs text-muted-foreground">{{ field.name }}</span>
                  <span class="text-[10px] text-muted-foreground/60 ml-auto">{{ field.type }}</span>
                </div>
              </ng-container>
            </div>
          </ng-container>
          <ng-template #noFieldsTpl>
            <div class="flex flex-col items-center justify-center py-12 text-center px-4">
              <p class="text-sm text-muted-foreground mb-1">No fields inferred yet</p>
              <p class="text-xs text-muted-foreground/60">Click "Infer Fields" to connect and sample data</p>
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Columns Tab -->
      <div *ngIf="activeTab === 'columns'" class="flex-1 overflow-hidden">
        <ag-grid-angular
          class="ag-theme-quartz-dark h-full w-full"
          [rowData]="columnRowData"
          [columnDefs]="columnDefs"
          [defaultColDef]="defaultColDef"
          (gridReady)="onGridReady($event)"
        ></ag-grid-angular>
      </div>
    </div>
  `,
})
export class StompFormComponent implements OnInit, OnDestroy {
  @Input() name = '';
  @Input() config!: StompProviderConfig;
  @Output() onChange = new EventEmitter<{ field: string; value: unknown }>();
  @Output() onNameChange = new EventEmitter<string>();

  activeTab = 'connection';
  tabs = [
    { id: 'connection', label: 'Connection' },
    { id: 'fields', label: 'Fields' },
    { id: 'columns', label: 'Columns' },
  ];

  form!: FormGroup;
  fieldState!: FieldInferenceState;
  connectionTesting = false;
  connectionStatus = '';
  connectionOk = false;

  columnDefs: ColDef[] = [
    { field: 'field', headerName: 'Field', editable: true, flex: 1 },
    { field: 'headerName', headerName: 'Header', editable: true, flex: 1 },
    { field: 'width', headerName: 'Width', editable: true, width: 100 },
    { field: 'sortable', headerName: 'Sortable', editable: true, width: 100 },
    { field: 'filter', headerName: 'Filter', editable: true, width: 100 },
  ];
  defaultColDef: ColDef = { resizable: true };
  columnRowData: unknown[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    public fieldInferenceSvc: FieldInferenceService,
    public cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: [this.name, Validators.required],
      websocketUrl: [this.config?.websocketUrl ?? ''],
      listenerTopic: [this.config?.listenerTopic ?? ''],
      requestMessage: [this.config?.requestMessage ?? ''],
      requestBody: [this.config?.requestBody ?? 'START'],
      snapshotEndToken: [this.config?.snapshotEndToken ?? 'Success'],
      keyColumn: [this.config?.keyColumn ?? ''],
      snapshotTimeoutMs: [this.config?.snapshotTimeoutMs ?? 60000],
    });

    this.form.get('name')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.onNameChange.emit(v));

    this.form.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(vals => {
        const { name: _name, ...configFields } = vals;
        Object.entries(configFields).forEach(([field, value]) => {
          this.onChange.emit({ field, value });
        });
      });

    this.fieldInferenceSvc.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        (this as any).fieldState = state;
        this.syncColumnsFromFields(state);
        this.cdr.markForCheck();
      });

    this.fieldInferenceSvc.initializeFromConfig(this.config);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getTabClass(tabId: string): string {
    const base = 'text-sm transition-colors';
    const active = 'bg-background border-b-2 border-primary text-foreground shadow-none';
    const inactive = 'text-muted-foreground hover:text-foreground';
    return `${base} ${this.activeTab === tabId ? active : inactive}`;
  }

  async inferFields(): Promise<void> {
    const config = this.buildConfig();
    try {
      await this.fieldInferenceSvc.inferFields(config);
      this.activeTab = 'fields';
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[StompForm] Field inference failed', err);
    }
  }

  commitFields(): void {
    this.fieldInferenceSvc.commitFieldSelection();
    const state = this.fieldInferenceSvc.snapshot;
    const colDefs = Array.from(state.committedSelectedFields).map(path => ({
      field: path,
      headerName: path,
      sortable: true,
      filter: true,
    }));
    this.onChange.emit({ field: 'columnDefinitions', value: colDefs });
  }

  async testConnection(): Promise<void> {
    this.connectionTesting = true;
    this.connectionStatus = '';
    this.cdr.markForCheck();
    try {
      const config = this.buildConfig();
      const provider = new StompDataProvider(config);
      await provider.fetchSnapshot(1);
      this.connectionOk = true;
      this.connectionStatus = 'Connection successful';
    } catch (err) {
      this.connectionOk = false;
      this.connectionStatus = err instanceof Error ? err.message : 'Connection failed';
    } finally {
      this.connectionTesting = false;
      this.cdr.markForCheck();
    }
  }

  getFilteredFields(): FieldNode[] {
    const state = this.fieldInferenceSvc.snapshot;
    const { inferredFields, fieldSearchQuery, expandedFields } = state;
    if (!fieldSearchQuery.trim()) return this.flattenVisible(inferredFields, expandedFields);
    return filterFields(inferredFields, fieldSearchQuery);
  }

  isFieldChecked(field: FieldNode): boolean {
    const { selectedFields } = this.fieldInferenceSvc.snapshot;
    if (field.type !== 'object') return selectedFields.has(field.path);
    const leaves = collectNonObjectLeaves(field);
    return leaves.length > 0 && leaves.every(p => selectedFields.has(p));
  }

  isFieldIndeterminate(field: FieldNode): boolean {
    if (field.type !== 'object') return false;
    const { selectedFields } = this.fieldInferenceSvc.snapshot;
    const leaves = collectNonObjectLeaves(field);
    const selected = leaves.filter(p => selectedFields.has(p)).length;
    return selected > 0 && selected < leaves.length;
  }

  onGridReady(_event: GridReadyEvent): void {}

  private buildConfig(): StompProviderConfig {
    return { ...this.config, ...this.form.getRawValue() };
  }

  private flattenVisible(fields: FieldNode[], expandedIds: Set<string>, depth = 0): FieldNode[] {
    const result: FieldNode[] = [];
    fields.forEach(f => {
      result.push({ ...f, depth } as FieldNode & { depth: number });
      if (f.children && expandedIds.has(f.path)) {
        result.push(...this.flattenVisible(f.children, expandedIds, depth + 1));
      }
    });
    return result;
  }

  private syncColumnsFromFields(state: FieldInferenceState): void {
    if (state.committedSelectedFields.size > 0) {
      this.columnRowData = Array.from(state.committedSelectedFields).map(path => ({
        field: path,
        headerName: path,
        sortable: true,
        filter: true,
        width: undefined,
      }));
    }
  }
}
