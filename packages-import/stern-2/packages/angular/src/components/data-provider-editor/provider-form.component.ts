import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import type {
  DataProviderConfig,
  StompProviderConfig,
  RestProviderConfig,
  WebSocketProviderConfig,
  SocketIOProviderConfig,
  MockProviderConfig,
  ProviderType,
} from '@stern/shared-types';
import { PROVIDER_TYPES } from '@stern/shared-types';
import { DataProviderService } from '../../services/data-provider.service';
import { StompFormComponent } from './stomp-form.component';

@Component({
  selector: 'stern-provider-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, StompFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <!-- STOMP uses its own full 3-tab form -->
      <ng-container *ngIf="formData.providerType === 'stomp'; else genericForm">
        <stern-stomp-form
          [name]="formData.name"
          [config]="stompConfig"
          (onChange)="handleConfigChange($event)"
          (onNameChange)="handleFieldChange('name', $event)"
        ></stern-stomp-form>
        <!-- Save/cancel footer for STOMP -->
        <div class="border-t bg-card px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
          <span *ngIf="isDirty" class="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          <div class="flex items-center gap-2 ml-auto">
            <button type="button" (click)="onClose.emit()"
              class="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent">
              Cancel
            </button>
            <button type="button" (click)="handleSave()" [disabled]="isSaving || !formData.name?.trim()"
              class="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50">
              {{ isSaving ? 'Saving...' : (isEditMode ? 'Update' : 'Create') }}
            </button>
          </div>
        </div>
      </ng-container>

      <!-- Generic form for REST / WebSocket / SocketIO / Mock -->
      <ng-template #genericForm>
        <div class="p-6 border-b bg-card flex-shrink-0">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted-foreground">Data Provider Name *</label>
            <input [value]="formData.name" (input)="handleFieldChange('name', $any($event.target).value)"
              placeholder="Enter data provider name"
              class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
        </div>

        <div class="flex-1 overflow-auto min-h-0 p-6 space-y-6">
          <!-- Description & Tags -->
          <section class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Description</label>
              <textarea [value]="formData.description || ''"
                (input)="handleFieldChange('description', $any($event.target).value)"
                placeholder="Optional description of this provider" rows="3"
                class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"></textarea>
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
              <input [value]="formData.tags?.join(', ') || ''"
                (input)="handleTagsChange($any($event.target).value)"
                placeholder="e.g., trading, real-time, production"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </section>

          <!-- REST config -->
          <section *ngIf="formData.providerType === 'rest'" class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">REST Configuration</h3>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Base URL *</label>
              <input [value]="restConfig.baseUrl || ''"
                (input)="handleConfigChange({ field: 'baseUrl', value: $any($event.target).value })"
                placeholder="https://api.example.com"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Endpoint</label>
              <input [value]="restConfig.endpoint || ''"
                (input)="handleConfigChange({ field: 'endpoint', value: $any($event.target).value })"
                placeholder="/v1/positions"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">HTTP Method</label>
              <select [value]="restConfig.method || 'GET'"
                (change)="handleConfigChange({ field: 'method', value: $any($event.target).value })"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </section>

          <!-- WebSocket config -->
          <section *ngIf="formData.providerType === 'websocket'" class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">WebSocket Configuration</h3>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">WebSocket URL *</label>
              <input [value]="wsConfig.url || ''"
                (input)="handleConfigChange({ field: 'url', value: $any($event.target).value })"
                placeholder="ws://localhost:8080/ws"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Subscribe Message</label>
              <input [value]="wsConfig.subscribeMessage || ''"
                (input)="handleConfigChange({ field: 'subscribeMessage', value: $any($event.target).value })"
                placeholder='{"action":"subscribe"}'
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </section>

          <!-- Socket.IO config -->
          <section *ngIf="formData.providerType === 'socketio'" class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Socket.IO Configuration</h3>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Server URL *</label>
              <input [value]="socketIOConfig.url || ''"
                (input)="handleConfigChange({ field: 'url', value: $any($event.target).value })"
                placeholder="http://localhost:3000"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Event Name</label>
              <input [value]="socketIOConfig.eventName || ''"
                (input)="handleConfigChange({ field: 'eventName', value: $any($event.target).value })"
                placeholder="data"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </section>

          <!-- Mock config -->
          <section *ngIf="formData.providerType === 'mock'" class="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mock Configuration</h3>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Row Count</label>
              <input type="number" [value]="mockConfig.rowCount ?? 100"
                (input)="handleConfigChange({ field: 'rowCount', value: +$any($event.target).value })"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">Update Interval (ms)</label>
              <input type="number" [value]="mockConfig.updateIntervalMs ?? 1000"
                (input)="handleConfigChange({ field: 'updateIntervalMs', value: +$any($event.target).value })"
                class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div class="border-t bg-card px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
          <span *ngIf="isDirty" class="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          <div class="flex items-center gap-2 ml-auto">
            <button type="button" (click)="onClose.emit()"
              class="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent">
              Cancel
            </button>
            <button type="button" (click)="handleSave()" [disabled]="isSaving || !formData.name?.trim()"
              class="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50">
              {{ isSaving ? 'Saving...' : (isEditMode ? 'Update Dataprovider' : 'Create Dataprovider') }}
            </button>
          </div>
        </div>
      </ng-template>
    </div>
  `,
})
export class ProviderFormComponent implements OnChanges {
  @Input() userId = 'System';
  @Input() provider!: DataProviderConfig;
  @Output() onClose = new EventEmitter<void>();
  @Output() onSave = new EventEmitter<void>();

  formData!: DataProviderConfig;
  isDirty = false;
  isSaving = false;

  constructor(
    private providerService: DataProviderService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['provider']) {
      this.formData = { ...this.provider };
      this.isDirty = false;
      this.cdr.markForCheck();
    }
  }

  get isEditMode(): boolean {
    return !!this.provider?.providerId;
  }

  get stompConfig(): StompProviderConfig {
    return (this.formData.config ?? {}) as StompProviderConfig;
  }

  get restConfig(): RestProviderConfig {
    return (this.formData.config ?? {}) as RestProviderConfig;
  }

  get wsConfig(): WebSocketProviderConfig {
    return (this.formData.config ?? {}) as WebSocketProviderConfig;
  }

  get socketIOConfig(): SocketIOProviderConfig {
    return (this.formData.config ?? {}) as SocketIOProviderConfig;
  }

  get mockConfig(): MockProviderConfig {
    return (this.formData.config ?? {}) as MockProviderConfig;
  }

  handleFieldChange(field: string, value: unknown): void {
    this.formData = { ...this.formData, [field]: value };
    this.isDirty = true;
    this.cdr.markForCheck();
  }

  handleConfigChange(event: { field: string; value: unknown }): void {
    this.formData = {
      ...this.formData,
      config: { ...this.formData.config, [event.field]: event.value },
    };
    this.isDirty = true;
    this.cdr.markForCheck();
  }

  handleTagsChange(tagsString: string): void {
    const tags = tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
    this.handleFieldChange('tags', tags);
  }

  async handleSave(): Promise<void> {
    if (!this.formData.name?.trim()) return;
    this.isSaving = true;
    this.cdr.markForCheck();
    const save$ = this.formData.providerId
      ? this.providerService.update(this.formData.providerId, this.formData, this.userId)
      : this.providerService.create(this.formData, this.userId);
    save$.subscribe({
      next: (saved) => {
        this.formData = { ...this.formData, providerId: saved.providerId };
        this.isDirty = false;
        this.isSaving = false;
        this.onSave.emit();
        this.cdr.markForCheck();
      },
      error: (err: Error) => {
        console.error('[ProviderForm] Save failed', err);
        this.isSaving = false;
        this.cdr.markForCheck();
      },
    });
  }
}
