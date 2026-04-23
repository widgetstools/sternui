import {
  Component,
  Input,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DataProviderConfig, ProviderType } from '@stern/shared-types';
import { getDefaultProviderConfig } from '@stern/shared-types';
import { DataProviderService } from '../../services/data-provider.service';
import { ProviderListComponent } from './provider-list.component';
import { ProviderFormComponent } from './provider-form.component';

@Component({
  selector: 'stern-data-provider-editor',
  standalone: true,
  imports: [CommonModule, ProviderListComponent, ProviderFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full bg-background">
      <!-- Left Sidebar -->
      <div class="w-72 border-r border-border flex flex-col bg-muted/30">
        <div class="px-4 py-3 border-b border-border bg-card">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-primary" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            <h2 class="text-sm font-semibold">Dataproviders</h2>
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          <stern-provider-list
            #providerList
            [userId]="userId"
            [currentProvider]="currentProvider"
            (onSelect)="setCurrentProvider($event)"
            (onDelete)="handleDelete($event)"
          ></stern-provider-list>
        </div>

        <div class="p-3 border-t border-border bg-card">
          <button
            type="button"
            (click)="handleCreate()"
            [disabled]="currentProvider !== null && !currentProvider.providerId"
            class="inline-flex items-center justify-center w-full h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 gap-2"
          >
            <svg class="w-4 h-4" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Dataprovider
          </button>
        </div>
      </div>

      <!-- Right: Form or placeholder -->
      <div class="flex-1 overflow-hidden">
        <ng-container *ngIf="currentProvider; else noSelection">
          <stern-provider-form
            [provider]="currentProvider"
            [userId]="userId"
            (onClose)="currentProvider = null; cdr.markForCheck()"
            (onSave)="onProviderSaved()"
          ></stern-provider-form>
        </ng-container>

        <ng-template #noSelection>
          <div class="flex flex-col items-center justify-center h-full text-center px-8">
            <svg class="w-16 h-16 text-muted-foreground/20 mb-6" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            <h3 class="text-lg font-semibold mb-2">No Data Provider Selected</h3>
            <p class="text-sm text-muted-foreground mb-6">Select a data provider from the list or create a new one</p>
            <div class="flex items-center gap-3">
              <button type="button" (click)="handleCreate()"
                class="inline-flex items-center h-8 px-4 text-sm font-medium rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 gap-2">
                <svg class="w-4 h-4" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Create New Provider
              </button>
            </div>
          </div>
        </ng-template>
      </div>

      <!-- Delete confirmation dialog -->
      <div *ngIf="providerToDelete" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-card rounded-lg border border-border p-6 w-96 shadow-xl">
          <h3 class="text-lg font-semibold mb-2">Delete Data Provider</h3>
          <p class="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete "{{ providerToDelete.name }}"? This action cannot be undone.
          </p>
          <div class="flex items-center justify-end gap-2">
            <button type="button" (click)="providerToDelete = null; cdr.markForCheck()"
              class="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent">
              Cancel
            </button>
            <button type="button" (click)="confirmDelete()"
              class="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md bg-destructive text-destructive-foreground shadow hover:bg-destructive/90">
              Delete
            </button>
          </div>
        </div>
      </div>

      <!-- Type selection dialog -->
      <div *ngIf="showTypeDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-card rounded-lg border border-border p-6 w-[480px] shadow-xl">
          <h3 class="text-lg font-semibold mb-1">New Data Provider</h3>
          <p class="text-sm text-muted-foreground mb-4">Choose the connection type for your new data provider</p>
          <div class="grid grid-cols-2 gap-3">
            <button *ngFor="let type of providerTypes" type="button"
              (click)="handleTypeSelect(type.id)"
              class="flex flex-col items-start p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left gap-1">
              <div [class]="'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white mb-1 ' + type.gradient">
                <span class="text-xs font-bold">{{ type.id.charAt(0).toUpperCase() }}</span>
              </div>
              <span class="text-sm font-medium">{{ type.label }}</span>
              <span class="text-xs text-muted-foreground">{{ type.description }}</span>
            </button>
          </div>
          <div class="flex justify-end mt-4">
            <button type="button" (click)="showTypeDialog = false; cdr.markForCheck()"
              class="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DataProviderEditorComponent {
  @Input() userId = 'System';

  currentProvider: DataProviderConfig | null = null;
  providerToDelete: DataProviderConfig | null = null;
  showTypeDialog = false;

  providerTypes = [
    { id: 'stomp', label: 'STOMP WebSocket', description: 'STOMP protocol over WebSocket', gradient: 'from-blue-500 to-cyan-500' },
    { id: 'rest', label: 'REST API', description: 'HTTP REST endpoint', gradient: 'from-green-500 to-emerald-500' },
    { id: 'websocket', label: 'WebSocket', description: 'Raw WebSocket connection', gradient: 'from-purple-500 to-pink-500' },
    { id: 'socketio', label: 'Socket.IO', description: 'Socket.IO event stream', gradient: 'from-orange-500 to-red-500' },
    { id: 'mock', label: 'Mock Data', description: 'Simulated data for testing', gradient: 'from-gray-500 to-slate-500' },
  ];

  constructor(
    private providerService: DataProviderService,
    public cdr: ChangeDetectorRef,
  ) {}

  setCurrentProvider(provider: DataProviderConfig): void {
    this.currentProvider = provider;
    this.cdr.markForCheck();
  }

  handleCreate(): void {
    this.showTypeDialog = true;
    this.cdr.markForCheck();
  }

  handleDelete(provider: DataProviderConfig): void {
    this.providerToDelete = provider;
    this.cdr.markForCheck();
  }

  confirmDelete(): void {
    if (!this.providerToDelete?.providerId) return;
    this.providerService.delete(this.providerToDelete.providerId).subscribe({
      next: () => {
        if (this.currentProvider?.providerId === this.providerToDelete?.providerId) {
          this.currentProvider = null;
        }
        this.providerToDelete = null;
        this.cdr.markForCheck();
      },
      error: (err: Error) => {
        console.error('[DataProviderEditor] Delete failed', err);
        this.providerToDelete = null;
        this.cdr.markForCheck();
      },
    });
  }

  handleTypeSelect(providerType: string): void {
    const newProvider: DataProviderConfig = {
      name: '',
      description: '',
      providerType: providerType as ProviderType,
      config: getDefaultProviderConfig(providerType as ProviderType) as DataProviderConfig['config'],
      tags: [],
      isDefault: false,
      userId: this.userId,
    };
    this.currentProvider = newProvider;
    this.showTypeDialog = false;
    this.cdr.markForCheck();
  }

  onProviderSaved(): void {
    // List will need to refresh — ViewChild would allow calling loadProviders() directly
    // For now the list component polls on its own schedule; user can also reload
    this.cdr.markForCheck();
  }
}
