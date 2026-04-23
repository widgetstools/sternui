/**
 * TreeItemComponent
 *
 * Renders a single row in the dock editor's button tree.
 * Uses PrimeNG Button + Tailwind CSS for layout and styling.
 * Dynamic indent uses [style.paddingLeft.px] since depth is runtime-calculated.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { BadgeModule } from 'primeng/badge';
import { iconIdToSvgUrl } from '../icon-utils';

const INDENT_STEP = 22;

export interface TreeItemData {
  id: string;
  label: string;
  iconId: string;
  iconUrl?: string;
  actionId?: string;
  childCount?: number;
  children?: TreeItemData[];
  isContainer?: boolean;
}

@Component({
  selector: 'mkt-tree-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, TooltipModule, BadgeModule],
  template: `
    <!-- Indent guide -->
    <div
      *ngIf="depth > 0"
      class="absolute top-0 bottom-0 w-px bg-border"
      [style.left.px]="depth * INDENT_STEP + 6"
    ></div>

    <!-- Row -->
    <div
      (mouseenter)="hovered.set(true)"
      (mouseleave)="hovered.set(false)"
      class="flex items-center gap-1 pr-1.5 h-8 rounded mb-px transition-colors"
      [class.bg-muted]="hovered()"
      [style.paddingLeft.px]="depth * INDENT_STEP + 8"
    >
      <!-- Expand/collapse toggle -->
      <button
        *ngIf="hasChildren; else spacer"
        (click)="expanded.set(!expanded())"
        class="w-5 h-5 flex items-center justify-center border-none bg-transparent
               cursor-pointer text-muted-foreground rounded p-0 flex-shrink-0"
      >
        <img
          [src]="expanded() ? chevronDownUrl : chevronRightUrl"
          width="13" height="13" alt=""
        />
      </button>
      <ng-template #spacer>
        <span class="w-5 flex-shrink-0"></span>
      </ng-template>

      <!-- Drag handle -->
      <span class="w-3 flex items-center justify-center text-muted-foreground cursor-grab flex-shrink-0">
        <img [src]="gripUrl" width="12" height="12" alt="" />
      </span>

      <!-- Icon chip — 24x24, 6px radius to match React -->
      <span class="w-6 h-6 flex items-center justify-center bg-card border border-border flex-shrink-0"
        style="border-radius: var(--de-radius-sm);">
        <img [src]="getItemIconUrl()" width="13" height="13" [alt]="item.label" />
      </span>

      <!-- Label — 13px to match React (not Tailwind text-sm 14px) -->
      <span class="flex-1 font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap pl-1"
        style="font-size: 13px;">
        {{ item.label }}
      </span>

      <!-- Child count badge — 10px radius (stadium), 5px padding to match React -->
      <span
        *ngIf="hasChildren"
        class="min-w-[20px] h-[18px] flex items-center justify-center
               bg-card border border-border text-[10px] font-semibold text-muted-foreground
               flex-shrink-0"
        style="border-radius: 10px; padding: 0 5px;"
      >
        {{ item.childCount ?? item.children?.length ?? 0 }}
      </span>

      <!-- Action buttons (visible on hover) -->
      <div
        class="flex items-center gap-px flex-shrink-0 transition-opacity"
        [class.opacity-0]="!hovered()"
        [class.opacity-100]="hovered()"
      >
        <p-button
          [text]="true"
          [rounded]="true"
          size="small"
          [disabled]="isFirst"
          (onClick)="moveUp.emit(item.id)"
          pTooltip="Move up"
          tooltipPosition="top"
        >
          <img [src]="chevronUpUrl" width="14" height="14" alt="up" />
        </p-button>
        <p-button
          [text]="true"
          [rounded]="true"
          size="small"
          [disabled]="isLast"
          (onClick)="moveDown.emit(item.id)"
          pTooltip="Move down"
          tooltipPosition="top"
        >
          <img [src]="chevronDownUrl" width="14" height="14" alt="down" />
        </p-button>
        <p-button
          [text]="true"
          [rounded]="true"
          size="small"
          (onClick)="edit.emit(item.id)"
          pTooltip="Edit"
          tooltipPosition="top"
        >
          <img [src]="pencilUrl" width="14" height="14" alt="edit" />
        </p-button>
        <p-button
          [text]="true"
          [rounded]="true"
          size="small"
          severity="danger"
          (onClick)="remove.emit(item.id)"
          pTooltip="Delete"
          tooltipPosition="top"
        >
          <img [src]="trashUrl" width="14" height="14" alt="delete" />
        </p-button>
      </div>
    </div>

    <!-- Children -->
    <ng-container *ngIf="hasChildren && expanded()">
      <mkt-tree-item
        *ngFor="let child of item.children; let i = index; trackBy: trackById"
        [item]="child"
        [index]="i"
        [total]="item.children?.length ?? 0"
        [depth]="depth + 1"
        [theme]="theme"
        (edit)="edit.emit($event)"
        (remove)="remove.emit($event)"
        (moveUp)="moveUp.emit($event)"
        (moveDown)="moveDown.emit($event)"
        (addChild)="addChild.emit($event)"
      />
      <button
        (click)="addChild.emit(item.id)"
        class="flex items-center gap-1.5 pr-2 h-[26px] border-none bg-transparent
               text-muted-foreground text-xs font-medium cursor-pointer rounded"
        [style.paddingLeft.px]="(depth + 1) * INDENT_STEP + 32"
      >
        <img [src]="plusUrl" width="11" height="11" alt="" />
        Add child
      </button>
    </ng-container>
  `,
  styles: [`
    :host { display: block; position: relative; }
  `],
})
export class TreeItemComponent {
  @Input({ required: true }) item!: TreeItemData;
  @Input() index = 0;
  @Input() total = 1;
  @Input() depth = 0;
  @Input() theme: 'dark' | 'light' = 'dark';

  @Output() edit     = new EventEmitter<string>();
  @Output() remove   = new EventEmitter<string>();
  @Output() moveUp   = new EventEmitter<string>();
  @Output() moveDown = new EventEmitter<string>();
  @Output() addChild = new EventEmitter<string>();

  protected readonly expanded = signal(true);
  protected readonly hovered  = signal(false);
  protected readonly INDENT_STEP = INDENT_STEP;

  // Icon colors per theme — values match --de-* token definitions in editor.css.
  // SVG data URLs require literal hex colors (CSS variables don't work in SVG strings).
  private get secondaryColor(): string { return this.theme === 'dark' ? '#8b8b9e' : '#5c5c72'; }
  private get tertiaryColor(): string { return this.theme === 'dark' ? '#5c5c6e' : '#8e8ea0'; }
  private get ghostColor(): string { return this.theme === 'dark' ? '#3a3a4a' : '#b8b8c8'; }
  private get dangerColor(): string { return this.theme === 'dark' ? '#e5534b' : '#dc2626'; }

  protected get chevronDownUrl(): string  { return iconIdToSvgUrl('lucide:chevron-down',  this.tertiaryColor); }
  protected get chevronRightUrl(): string { return iconIdToSvgUrl('lucide:chevron-right', this.tertiaryColor); }
  protected get chevronUpUrl(): string    { return iconIdToSvgUrl('lucide:chevron-up',    this.secondaryColor); }
  protected get gripUrl(): string         { return iconIdToSvgUrl('lucide:grip-vertical', this.ghostColor); }
  protected get pencilUrl(): string       { return iconIdToSvgUrl('lucide:pencil',        this.secondaryColor); }
  protected get trashUrl(): string        { return iconIdToSvgUrl('lucide:trash-2',       this.dangerColor); }
  protected get plusUrl(): string          { return iconIdToSvgUrl('lucide:plus',           this.ghostColor); }

  get hasChildren(): boolean {
    return !!this.item.isContainer || (this.item.childCount ?? 0) > 0 || (this.item.children?.length ?? 0) > 0;
  }
  get isFirst(): boolean { return this.index === 0; }
  get isLast():  boolean { return this.index === this.total - 1; }

  protected getItemIconUrl(): string {
    return iconIdToSvgUrl(this.item.iconId, this.secondaryColor);
  }

  protected trackById(_: number, item: TreeItemData): string {
    return item.id;
  }
}
