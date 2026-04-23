import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { DataProviderConfig, ProviderType } from '@marketsui/shared-types';
import { DataProviderService } from '../../services/data-provider.service';

const PROVIDER_ICONS: Record<ProviderType | string, string> = {
  stomp: 'wifi',
  rest: 'globe',
  websocket: 'zap',
  socketio: 'database',
  mock: 'flask',
  appdata: 'database',
};

const PROVIDER_GRADIENT_CLASSES: Record<ProviderType | string, string> = {
  stomp: 'from-blue-500 to-cyan-500',
  rest: 'from-green-500 to-emerald-500',
  websocket: 'from-purple-500 to-pink-500',
  socketio: 'from-orange-500 to-red-500',
  mock: 'from-gray-500 to-slate-500',
  appdata: 'from-yellow-500 to-amber-500',
};

@Component({
  selector: 'stern-provider-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <!-- Search -->
      <div class="p-3 border-b">
        <div class="relative">
          <svg class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Search data providers..."
            class="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <!-- List -->
      <div class="flex-1 overflow-auto">
        <div class="space-y-1 p-2">
          <ng-container *ngIf="!isLoading; else loadingTpl">
            <ng-container *ngIf="filteredProviders.length > 0; else emptyTpl">
              <div
                *ngFor="let provider of filteredProviders; trackBy: trackById"
                (click)="onSelect.emit(provider)"
                [class]="getItemClass(provider)"
              >
                <div class="flex items-center gap-3">
                  <div [class]="'flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white ' + getGradient(provider.providerType)">
                    <span class="text-xs font-bold">{{ provider.providerType.charAt(0).toUpperCase() }}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="text-sm font-medium truncate">{{ provider.name }}</span>
                      <svg *ngIf="provider.isDefault" class="w-3 h-3 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    </div>
                    <span class="text-xs text-muted-foreground capitalize">{{ provider.providerType }}</span>
                  </div>
                  <button
                    type="button"
                    (click)="$event.stopPropagation(); onDelete.emit(provider)"
                    class="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </ng-container>
          </ng-container>
          <ng-template #loadingTpl>
            <div class="flex items-center justify-center py-8 text-muted-foreground text-sm">Loading...</div>
          </ng-template>
          <ng-template #emptyTpl>
            <div class="flex flex-col items-center justify-center py-12 text-center px-4">
              <svg class="w-10 h-10 text-muted-foreground/30 mb-3" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
              <p class="text-sm text-muted-foreground mb-1">No data providers</p>
              <p class="text-xs text-muted-foreground/60">{{ searchQuery ? 'No results for "' + searchQuery + '"' : 'Create a new data provider to get started' }}</p>
            </div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    div.group:hover button { opacity: 1 !important; }
  `],
})
export class ProviderListComponent implements OnInit, OnChanges {
  @Input() userId = 'System';
  @Input() currentProvider: DataProviderConfig | null = null;
  @Output() onSelect = new EventEmitter<DataProviderConfig>();
  @Output() onDelete = new EventEmitter<DataProviderConfig>();

  providers: DataProviderConfig[] = [];
  filteredProviders: DataProviderConfig[] = [];
  isLoading = false;
  searchQuery = '';

  constructor(
    private providerService: DataProviderService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadProviders();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && !changes['userId'].firstChange) {
      this.loadProviders();
    }
  }

  loadProviders(): void {
    this.isLoading = true;
    this.providerService.getAll(this.userId).subscribe({
      next: (providers) => {
        this.providers = providers;
        this.applyFilter();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    this.applyFilter();
    this.cdr.markForCheck();
  }

  private applyFilter(): void {
    let filtered = [...this.providers];
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        p => p.name.toLowerCase().includes(q) || p.providerType.toLowerCase().includes(q),
      );
    }
    filtered.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
    this.filteredProviders = filtered;
  }

  getItemClass(provider: DataProviderConfig): string {
    const isSelected = this.currentProvider?.providerId === provider.providerId;
    const base = 'group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors w-full';
    return isSelected
      ? `${base} bg-primary/10 border border-primary/20`
      : `${base} hover:bg-accent border border-transparent`;
  }

  getGradient(type: string): string {
    return PROVIDER_GRADIENT_CLASSES[type] ?? 'from-gray-500 to-slate-500';
  }

  trackById(_: number, provider: DataProviderConfig): string {
    return provider.providerId ?? provider.name;
  }
}
