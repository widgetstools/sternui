/**
 * IconSelectComponent
 *
 * A PrimeNG dropdown that shows a curated list of Lucide icons.
 * Each option renders the icon from the Iconify CDN + the display name.
 *
 * When the user selects an icon, emits the Iconify icon ID
 * (e.g. "lucide:file-text") via the (iconSelected) output.
 *
 * Icons are rendered as <img> tags pointing to the Iconify CDN —
 * no extra icon library dependency needed. Icons are fetched lazily
 * when the dropdown opens.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  OnInit,
  OnChanges,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ICON_OPTIONS, DEFAULT_ICON, findIconById, type IconOption } from '../icons';
import { iconIdToSvgUrl } from '../icon-utils';

@Component({
  selector: 'mkt-icon-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, SelectModule],
  template: `
    <p-select
      [options]="iconOptions"
      [(ngModel)]="selectedIcon"
      optionLabel="name"
      [filter]="true"
      filterBy="name"
      [showClear]="false"
      placeholder="Select an icon"
      class="w-full"
      [appendTo]="'body'"
      (onChange)="onIconChange()"
    >
      <!-- Selected value display -->
      <ng-template pTemplate="selectedItem">
        <div class="flex items-center gap-2" *ngIf="selectedIcon">
          <img
            [src]="getIconUrl(selectedIcon.icon)"
            width="16" height="16"
            [alt]="selectedIcon.name"
            style="filter: invert(1);"
          />
          <span class="text-sm">{{ selectedIcon.name }}</span>
        </div>
      </ng-template>

      <!-- Dropdown option row -->
      <ng-template let-option pTemplate="item">
        <div class="flex items-center gap-2">
          <img
            [src]="getIconUrl(option.icon)"
            width="16" height="16"
            [alt]="option.name"
            loading="lazy"
          />
          <span class="text-sm">{{ option.name }}</span>
        </div>
      </ng-template>
    </p-select>
  `,
})
export class IconSelectComponent implements OnInit, OnChanges {
  /** Currently selected icon ID (e.g. "lucide:file-text") */
  @Input() value: string = DEFAULT_ICON.icon;

  /** Emitted when the user selects a different icon */
  @Output() iconSelected = new EventEmitter<{ name: string; iconId: string }>();

  protected iconOptions: IconOption[] = ICON_OPTIONS;
  protected selectedIcon: IconOption | null = null;

  ngOnInit(): void {
    this.syncSelection();
  }

  ngOnChanges(): void {
    this.syncSelection();
  }

  /** Build an Iconify CDN URL for rendering the icon as an <img> */
  protected getIconUrl(iconId: string): string {
    // Use a neutral dark color — works in most PrimeNG themes
    return iconIdToSvgUrl(iconId, '#6b7280');
  }

  protected onIconChange(): void {
    if (this.selectedIcon) {
      this.iconSelected.emit({
        name: this.selectedIcon.name,
        iconId: this.selectedIcon.icon,
      });
    }
  }

  private syncSelection(): void {
    this.selectedIcon = findIconById(this.value) ?? ICON_OPTIONS[0];
  }
}
