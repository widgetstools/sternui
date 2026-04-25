import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  createMenuItem,
  type DockMenuItem,
  findMenuItem,
  updateMenuItem,
  deleteMenuItem,
  addMenuItem,
  duplicateMenuItem,
  countItems,
} from '@marketsui/shared-types';
import { TreeNodeComponent } from './tree-node.component';
import { PropertiesPanelComponent } from './properties-panel.component';

export interface DockConfiguratorInputs {
  initialItems: DockMenuItem[];
  onItemsChange?: (items: DockMenuItem[]) => void;
  onApply?: (items: DockMenuItem[]) => Promise<void>;
}

@Component({
  selector: 'stern-dock-configurator',
  standalone: true,
  imports: [CommonModule, TreeNodeComponent, PropertiesPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full bg-background text-foreground">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold">Dock Configuration</h2>
          <span class="text-[10px] h-4 px-1.5 inline-flex items-center rounded-full bg-secondary text-secondary-foreground">
            {{ totalCount }} {{ totalCount === 1 ? 'item' : 'items' }}
          </span>
          <span
            *ngIf="isDirty"
            class="text-[10px] h-4 px-1.5 inline-flex items-center rounded-full border border-yellow-500/50 text-yellow-500"
          >Unsaved</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            title="Import JSON"
            class="inline-flex items-center justify-center h-7 w-7 rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
            (click)="handleImport()"
          >
            <!-- upload icon -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>
          <button
            type="button"
            title="Export JSON"
            class="inline-flex items-center justify-center h-7 w-7 rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
            (click)="handleExport()"
          >
            <!-- download icon -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <div class="h-4 w-px bg-border mx-1"></div>
          <button
            type="button"
            class="inline-flex items-center justify-center h-7 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            [disabled]="!isDirty || isSaving || !onApply"
            (click)="handleSave()"
          >
            <!-- save icon -->
            <svg class="h-3.5 w-3.5 mr-1.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            {{ isSaving ? 'Saving...' : 'Apply to Dock' }}
          </button>
        </div>
      </div>

      <!-- Body: Tree + Properties split -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left: Tree View -->
        <div class="w-[280px] border-r border-border flex flex-col">
          <!-- Tree toolbar -->
          <div class="flex items-center gap-1 px-2 py-1.5 border-b border-border">
            <button
              type="button"
              title="Add root item"
              class="inline-flex items-center justify-center h-7 w-7 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              (click)="handleAdd()"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>

            <ng-container *ngIf="selectedId">
              <button type="button" title="Add child"
                class="inline-flex items-center justify-center h-7 w-7 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                (click)="handleAdd(selectedId!)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/>
                </svg>
              </button>
              <button type="button" title="Duplicate"
                class="inline-flex items-center justify-center h-7 w-7 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                (click)="handleDuplicate(selectedId!)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button type="button" title="Move up"
                class="inline-flex items-center justify-center h-7 w-7 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                (click)="handleMoveUp(selectedId!)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </button>
              <button type="button" title="Move down"
                class="inline-flex items-center justify-center h-7 w-7 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                (click)="handleMoveDown(selectedId!)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div class="flex-1"></div>
              <button type="button" title="Delete"
                class="inline-flex items-center justify-center h-7 w-7 rounded-md text-sm font-medium transition-colors text-destructive hover:text-destructive hover:bg-destructive/10"
                (click)="handleDelete(selectedId!)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </ng-container>
          </div>

          <!-- Tree list -->
          <div class="flex-1 overflow-auto py-1">
            <ng-container *ngIf="menuItems.length > 0; else emptyState">
              <stern-tree-node
                *ngFor="let item of menuItems; trackBy: trackById"
                [item]="item"
                [level]="0"
                [selectedId]="selectedId"
                [expandedIds]="expandedIds"
                (onSelect)="setSelected($event)"
                (onToggleExpand)="handleToggleExpand($event)"
              ></stern-tree-node>
            </ng-container>
            <ng-template #emptyState>
              <div class="flex flex-col items-center justify-center py-12 text-center px-4">
                <svg class="h-8 w-8 text-muted-foreground/40 mb-3" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <p class="text-sm text-muted-foreground mb-1">No menu items</p>
                <p class="text-xs text-muted-foreground/60 mb-3">Add items to populate the dock</p>
                <button
                  type="button"
                  class="inline-flex items-center h-7 px-3 text-xs font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
                  (click)="handleAdd()"
                >
                  <svg class="h-3 w-3 mr-1.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add First Item
                </button>
              </div>
            </ng-template>
          </div>
        </div>

        <!-- Right: Properties Panel -->
        <div class="flex-1 overflow-auto">
          <stern-properties-panel
            *ngIf="selectedItem; else noSelection"
            [item]="selectedItem"
            (onUpdate)="handleUpdate($event.id, $event.updates)"
          ></stern-properties-panel>
          <ng-template #noSelection>
            <div class="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select an item to edit its properties
            </div>
          </ng-template>
        </div>
      </div>

      <!-- Hidden file input for import -->
      <input
        #fileInput
        type="file"
        accept=".json"
        class="hidden"
        (change)="handleFileChange($event)"
      />
    </div>
  `,
})
export class DockConfiguratorComponent implements OnInit {
  @Input() initialItems: DockMenuItem[] = [];
  @Input() onItemsChange?: (items: DockMenuItem[]) => void;
  @Input() onApply?: (items: DockMenuItem[]) => Promise<void>;
  @Output() itemsChange = new EventEmitter<DockMenuItem[]>();
  @Output() apply = new EventEmitter<DockMenuItem[]>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  menuItems: DockMenuItem[] = [];
  selectedId: string | null = null;
  expandedIds: Set<string> = new Set();
  isDirty = false;
  isSaving = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.menuItems = [...this.initialItems];
  }

  get selectedItem(): DockMenuItem | null {
    return this.selectedId ? findMenuItem(this.menuItems, this.selectedId) ?? null : null;
  }

  get totalCount(): number {
    return countItems(this.menuItems);
  }

  setSelected(id: string): void {
    this.selectedId = id;
    this.cdr.markForCheck();
  }

  private mutate(fn: (items: DockMenuItem[]) => DockMenuItem[]): void {
    this.menuItems = fn(this.menuItems);
    this.isDirty = true;
    this.onItemsChange?.(this.menuItems);
    this.itemsChange.emit(this.menuItems);
    this.cdr.markForCheck();
  }

  handleAdd(parentId?: string): void {
    const item = createMenuItem({
      caption: parentId ? 'New Child Item' : 'New Menu Item',
      order: this.totalCount,
    });
    this.mutate((items) => addMenuItem(items, item, parentId));
    this.selectedId = item.id;
    if (parentId) {
      this.expandedIds = new Set(this.expandedIds).add(parentId);
    }
    this.cdr.markForCheck();
  }

  handleDelete(id: string): void {
    this.mutate((items) => deleteMenuItem(items, id));
    if (this.selectedId === id) {
      this.selectedId = null;
    }
  }

  handleDuplicate(id: string): void {
    const newId = `menu-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.mutate((items) => duplicateMenuItem(items, id, newId));
    this.selectedId = newId;
    this.cdr.markForCheck();
  }

  handleUpdate(id: string, updates: Partial<DockMenuItem>): void {
    this.mutate((items) => updateMenuItem(items, id, updates));
  }

  handleMoveUp(id: string): void {
    this.mutate((items) => {
      const idx = items.findIndex((i) => i.id === id);
      if (idx <= 0) return items;
      const result = [...items];
      [result[idx - 1], result[idx]] = [result[idx], result[idx - 1]];
      return result;
    });
  }

  handleMoveDown(id: string): void {
    this.mutate((items) => {
      const idx = items.findIndex((i) => i.id === id);
      if (idx < 0 || idx >= items.length - 1) return items;
      const result = [...items];
      [result[idx], result[idx + 1]] = [result[idx + 1], result[idx]];
      return result;
    });
  }

  handleToggleExpand(id: string): void {
    const next = new Set(this.expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expandedIds = next;
    this.cdr.markForCheck();
  }

  async handleSave(): Promise<void> {
    if (!this.onApply) return;
    this.isSaving = true;
    this.cdr.markForCheck();
    try {
      await this.onApply(this.menuItems);
      this.isDirty = false;
    } catch (error) {
      console.error('[DockConfigurator] Failed to update dock', error);
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  handleExport(): void {
    const blob = new Blob([JSON.stringify(this.menuItems, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dock-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  handleImport(): void {
    this.fileInputRef?.nativeElement.click();
  }

  handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        const items: DockMenuItem[] = Array.isArray(parsed)
          ? parsed
          : parsed.menuItems || parsed.config?.menuItems || [];
        this.menuItems = items;
        this.isDirty = true;
        this.selectedId = null;
        this.onItemsChange?.(items);
        this.itemsChange.emit(items);
        this.cdr.markForCheck();
      } catch (err) {
        console.error('[DockConfigurator] Invalid JSON file', err);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  trackById(_: number, item: DockMenuItem): string {
    return item.id;
  }
}
