import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GridReadyEvent, GridApi } from 'ag-grid-community';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import { generateSnapshot, generateUpdate } from '../data/mock-data.provider';

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

const COLUMN_CONFIGS: Record<string, ColDef[]> = {
  orders: [
    { field: 'orderId', headerName: 'Order ID', width: 130, pinned: 'left' },
    { field: 'instrument', headerName: 'Instrument', width: 110 },
    { field: 'side', headerName: 'Side', width: 80, cellClass: (p) => p.value === 'Buy' ? 'text-green-400' : 'text-red-400' },
    { field: 'quantity', headerName: 'Quantity', width: 100, type: 'numericColumn' },
    { field: 'price', headerName: 'Price', width: 90, type: 'numericColumn', valueFormatter: (p) => p.value?.toFixed(2) },
    { field: 'filledQty', headerName: 'Filled', width: 90, type: 'numericColumn' },
    { field: 'status', headerName: 'Status', width: 130 },
    { field: 'trader', headerName: 'Trader', width: 110 },
    { field: 'timestamp', headerName: 'Time', flex: 1, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleTimeString() : '' },
  ],
  fills: [
    { field: 'orderId', headerName: 'Order ID', width: 130, pinned: 'left' },
    { field: 'instrument', headerName: 'Instrument', width: 110 },
    { field: 'side', headerName: 'Side', width: 80, cellClass: (p) => p.value === 'Buy' ? 'text-green-400' : 'text-red-400' },
    { field: 'filledQty', headerName: 'Fill Qty', width: 100, type: 'numericColumn' },
    { field: 'price', headerName: 'Fill Price', width: 100, type: 'numericColumn', valueFormatter: (p) => p.value?.toFixed(2) },
    { field: 'trader', headerName: 'Trader', width: 110 },
    { field: 'desk', headerName: 'Desk', width: 140 },
    { field: 'timestamp', headerName: 'Time', flex: 1, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleTimeString() : '' },
  ],
};

const DEFAULT_COLS: ColDef[] = [
  { field: 'orderId', headerName: 'Order ID', width: 130, pinned: 'left' },
  { field: 'instrument', headerName: 'Instrument', width: 110 },
  { field: 'side', headerName: 'Side', width: 80 },
  { field: 'quantity', headerName: 'Quantity', width: 100, type: 'numericColumn' },
  { field: 'price', headerName: 'Price', width: 90, type: 'numericColumn', valueFormatter: (p) => p.value?.toFixed(2) },
  { field: 'status', headerName: 'Status', flex: 1 },
];

@Component({
  selector: 'stern-blotter',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-screen w-screen flex flex-col bg-background text-foreground">
      <!-- Header bar -->
      <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold">{{ title }}</h2>
          <span class="text-[10px] h-4 px-1.5 inline-flex items-center rounded-full bg-secondary text-secondary-foreground">
            {{ rowData.length }} rows
          </span>
          <span *ngIf="streaming"
            class="text-[10px] h-4 px-1.5 inline-flex items-center rounded-full border border-green-500/50 text-green-500 gap-1">
            <span class="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
            Live
          </span>
        </div>
        <span class="text-xs text-muted-foreground">{{ selectedCount }} selected</span>
      </div>

      <!-- Grid -->
      <div class="flex-1 overflow-hidden">
        <ag-grid-angular
          class="h-full w-full ag-theme-quartz-dark"
          [rowData]="rowData"
          [columnDefs]="columnDefs"
          [defaultColDef]="defaultColDef"
          [rowSelection]="'multiple'"
          [getRowId]="getRowId"
          (gridReady)="onGridReady($event)"
          (selectionChanged)="onSelectionChanged()"
        ></ag-grid-angular>
      </div>
    </div>
  `,
})
export class BlotterComponent implements OnInit, OnDestroy {
  @Input() id?: string;

  rowData: Record<string, unknown>[] = [];
  columnDefs: ColDef[] = DEFAULT_COLS;
  defaultColDef: ColDef = { sortable: true, filter: true, resizable: true };
  streaming = false;
  selectedCount = 0;
  title = 'Blotter';

  private gridApi?: GridApi;
  private updateInterval?: ReturnType<typeof setInterval>;
  private blotterType = 'orders';

  constructor(
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.blotterType = this.route.snapshot.paramMap.get('type') ?? 'orders';
    this.title = this.blotterType.charAt(0).toUpperCase() + this.blotterType.slice(1) + ' Blotter';
    this.columnDefs = COLUMN_CONFIGS[this.blotterType] ?? DEFAULT_COLS;
    this.rowData = generateSnapshot(this.blotterType);
    this.streaming = true;
    this.cdr.markForCheck();

    this.updateInterval = setInterval(() => {
      const update = generateUpdate(this.rowData);
      const idx = this.rowData.findIndex((r) => r['id'] === update['id']);
      if (idx >= 0) {
        this.rowData = [...this.rowData.slice(0, idx), update, ...this.rowData.slice(idx + 1)];
      }
      // Use AG Grid transaction for efficient row update
      this.gridApi?.applyTransaction({ update: [update] });
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
  }

  onSelectionChanged(): void {
    this.selectedCount = this.gridApi?.getSelectedRows().length ?? 0;
    this.cdr.markForCheck();
  }

  getRowId = (params: { data: Record<string, unknown> }): string =>
    params.data['id'] as string;
}
