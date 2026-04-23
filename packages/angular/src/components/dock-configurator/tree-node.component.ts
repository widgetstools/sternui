import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DockMenuItem } from '@marketsui/openfin-platform-stern';

@Component({
  selector: 'stern-tree-node',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container>
      <button
        type="button"
        (click)="onSelect.emit(item.id)"
        [class]="nodeClass"
        [style.padding-left.px]="8 + level * 20"
      >
        <!-- Expand/collapse toggle -->
        <span
          *ngIf="hasChildren; else spacer"
          class="mr-1 p-0.5 rounded hover:bg-muted"
          (click)="$event.stopPropagation(); onToggleExpand.emit(item.id)"
        >
          <svg
            [class]="'h-3.5 w-3.5 transition-transform' + (isExpanded ? ' rotate-90' : '')"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <ng-template #spacer><span class="mr-1 w-[18px] inline-block"></span></ng-template>

        <!-- Icon -->
        <svg
          *ngIf="hasChildren; else fileIcon"
          class="h-4 w-4 mr-2 text-muted-foreground shrink-0"
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <ng-template #fileIcon>
          <svg
            class="h-4 w-4 mr-2 text-muted-foreground shrink-0"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </ng-template>

        <span class="truncate flex-1">{{ item.caption }}</span>

        <span
          *ngIf="hasChildren"
          class="ml-2 text-[10px] h-4 px-1.5 inline-flex items-center rounded-full bg-secondary text-secondary-foreground"
        >{{ item.children!.length }}</span>
      </button>

      <!-- Children -->
      <div *ngIf="hasChildren && isExpanded" class="relative">
        <div
          class="absolute left-0 top-0 bottom-0 border-l border-border"
          [style.margin-left.px]="18 + level * 20"
        ></div>
        <stern-tree-node
          *ngFor="let child of item.children; trackBy: trackById"
          [item]="child"
          [level]="level + 1"
          [selectedId]="selectedId"
          [expandedIds]="expandedIds"
          (onSelect)="onSelect.emit($event)"
          (onToggleExpand)="onToggleExpand.emit($event)"
        ></stern-tree-node>
      </div>
    </ng-container>
  `,
})
export class TreeNodeComponent {
  @Input() item!: DockMenuItem;
  @Input() level = 0;
  @Input() selectedId: string | null = null;
  @Input() expandedIds: Set<string> = new Set();
  @Output() onSelect = new EventEmitter<string>();
  @Output() onToggleExpand = new EventEmitter<string>();

  get hasChildren(): boolean {
    return !!(this.item.children && this.item.children.length > 0);
  }

  get isExpanded(): boolean {
    return this.expandedIds.has(this.item.id);
  }

  get nodeClass(): string {
    const isSelected = this.item.id === this.selectedId;
    const base = 'flex items-center w-full px-2 py-1.5 text-left text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground';
    const selected = isSelected
      ? 'bg-primary/10 text-primary border border-primary/20'
      : 'border border-transparent';
    return `${base} ${selected}`;
  }

  trackById(_: number, item: DockMenuItem): string {
    return item.id;
  }
}
