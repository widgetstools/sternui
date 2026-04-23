/**
 * ItemFormComponent
 *
 * Dialog form for adding/editing a dock button or menu item.
 * Uses PrimeNG components (Dialog, InputText, Button, Checkbox) + Tailwind CSS.
 *
 * Features:
 * - Searchable icon grid with 85+ Lucide icons
 * - Predefined color swatches + custom color picker
 * - Label, Action ID, Has Children toggle
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { iconIdToSvgUrl } from '../icon-utils';
import { ICON_OPTIONS, DEFAULT_ICON, type IconOption } from '../icons';

// ─── Predefined icon colors ─────────────────────────────────────────

export const PREDEFINED_COLORS = [
  { name: 'Electric Blue', hex: '#2196F3' },
  { name: 'Cyan',          hex: '#00BCD4' },
  { name: 'Mint',          hex: '#00E5A0' },
  { name: 'Lime',          hex: '#76FF03' },
  { name: 'Yellow',        hex: '#FFD600' },
  { name: 'Amber',         hex: '#FF9800' },
  { name: 'Coral',         hex: '#FF5252' },
  { name: 'Pink',          hex: '#FF4081' },
  { name: 'Lavender',      hex: '#B388FF' },
  { name: 'White',         hex: '#FFFFFF' },
];

// ─── Form data shape ────────────────────────────────────────────────

export interface ItemFormData {
  label: string;
  iconId: string;
  actionId: string;
  hasChildren: boolean;
  iconColor?: string;
}

function isCustomColor(color: string | undefined): boolean {
  if (!color) return false;
  return !PREDEFINED_COLORS.some((c) => c.hex === color);
}

// ─── Component ──────────────────────────────────────────────────────

@Component({
  selector: 'mkt-item-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    CheckboxModule,
    TooltipModule,
  ],
  template: `
    <p-dialog
      [visible]="visible"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: '420px' }"
      [header]="title"
      (onHide)="onCancel()"
    >
      <!-- Fields -->
      <div class="flex flex-col gap-4 py-2">

        <!-- Label -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground">
            Label <span class="text-red-500">*</span>
          </label>
          <input
            pInputText
            [value]="form.get('label')?.value"
            (input)="form.get('label')?.setValue($any($event.target).value)"
            placeholder="e.g., New File"
            class="w-full"
            [class.ng-invalid]="form.get('label')?.invalid && form.get('label')?.touched"
          />
          <small
            *ngIf="form.get('label')?.invalid && form.get('label')?.touched"
            class="text-red-500 text-xs"
          >
            Label is required
          </small>
        </div>

        <!-- Icon picker grid -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground">
            Icon <span class="text-red-500">*</span>
          </label>
          <!-- Selected icon display -->
          <button
            (click)="iconPickerOpen.set(!iconPickerOpen())"
            class="flex items-center gap-2 w-full h-10 px-3 border border-border rounded-md
                   bg-card text-foreground text-sm cursor-pointer transition-colors
                   hover:border-primary"
          >
            <img [src]="getSelectedIconUrl()" width="16" height="16" alt="" />
            <span>{{ getSelectedIconName() }}</span>
            <img
              [src]="iconPickerOpen() ? chevronUpUrl : chevronDownUrl"
              width="12" height="12" alt="" class="ml-auto"
            />
          </button>
          <!-- Search + Grid -->
          <div
            *ngIf="iconPickerOpen()"
            class="border border-border rounded-md bg-card p-2 max-h-64 overflow-y-auto mt-1"
          >
            <input
              pInputText
              class="w-full mb-2"
              placeholder="Search icons…"
              (input)="onIconSearch($any($event.target).value)"
            />
            <span class="text-[10px] text-muted-foreground mb-1 block">
              {{ filteredIcons().length }} icons
            </span>
            <div class="grid grid-cols-9 gap-0.5">
              <button
                *ngFor="let icon of filteredIcons()"
                (click)="selectIcon(icon)"
                class="w-9 h-9 flex items-center justify-center rounded border border-transparent
                       cursor-pointer transition-all hover:bg-muted hover:border-border"
                [class.bg-primary/10]="form.get('iconId')?.value === icon.icon"
                [class.border-primary]="form.get('iconId')?.value === icon.icon"
                [pTooltip]="icon.name"
                tooltipPosition="top"
              >
                <img [src]="getIconUrl(icon.icon)" width="18" height="18" [alt]="icon.name" loading="lazy" />
              </button>
            </div>
          </div>
        </div>

        <!-- Icon Color -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-muted-foreground">Icon Color</label>
          <div class="flex flex-wrap gap-1.5 items-center">
            <!-- Auto -->
            <button
              class="w-7 h-7 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer transition-all"
              [class.border-primary]="!selectedColor()"
              [class.border-border]="selectedColor()"
              [class.ring-2]="!selectedColor()"
              [class.ring-primary/20]="!selectedColor()"
              (click)="setIconColor(undefined)"
              pTooltip="Auto — follows theme"
              tooltipPosition="top"
            >
              <img [src]="sunMoonUrl" width="14" height="14" alt="" />
            </button>
            <!-- Predefined -->
            <button
              *ngFor="let c of predefinedColors"
              class="w-7 h-7 rounded border flex-shrink-0 cursor-pointer transition-all"
              [class.border-primary]="selectedColor() === c.hex"
              [class.border-border]="selectedColor() !== c.hex"
              [class.ring-2]="selectedColor() === c.hex"
              [class.ring-primary/20]="selectedColor() === c.hex"
              [style.background]="c.hex"
              (click)="setIconColor(c.hex)"
              [pTooltip]="c.name"
              tooltipPosition="top"
            ></button>
            <!-- Custom picker -->
            <label
              class="w-7 h-7 rounded border border-border flex items-center justify-center
                     flex-shrink-0 cursor-pointer overflow-hidden relative transition-all"
              [class.border-primary]="isCustom(selectedColor())"
              [class.ring-2]="isCustom(selectedColor())"
              [class.ring-primary/20]="isCustom(selectedColor())"
              [style.background]="isCustom(selectedColor()) ? selectedColor()! : 'transparent'"
              pTooltip="Custom color"
              tooltipPosition="top"
            >
              <img *ngIf="!isCustom(selectedColor())" [src]="pipetteUrl" width="14" height="14" alt="" />
              <input
                type="color"
                [value]="selectedColor() || '#ffffff'"
                (change)="setIconColor($any($event.target).value.toUpperCase())"
                class="absolute opacity-0 w-7 h-7 cursor-pointer"
              />
            </label>
          </div>
          <small class="text-xs text-muted-foreground">
            {{ selectedColor() ? 'Fixed color: ' + selectedColor() : 'Auto — changes with theme' }}
          </small>
        </div>

        <!-- Action ID -->
        <div class="flex flex-col gap-1" *ngIf="!form.get('hasChildren')?.value">
          <label class="text-xs font-medium text-muted-foreground">
            Action ID <span class="text-red-500">*</span>
          </label>
          <input
            pInputText
            class="w-full font-mono text-sm"
            [value]="form.get('actionId')?.value"
            (input)="form.get('actionId')?.setValue($any($event.target).value)"
            placeholder="e.g., file.new"
          />
          <small class="text-xs text-muted-foreground">Unique identifier for this action</small>
        </div>

        <!-- Has Children -->
        <div
          class="flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all"
          [class.border-primary]="form.get('hasChildren')?.value"
          [class.bg-primary/5]="form.get('hasChildren')?.value"
          [class.border-border]="!form.get('hasChildren')?.value"
          (click)="toggleHasChildren()"
        >
          <p-checkbox
            [binary]="true"
            [ngModel]="form.get('hasChildren')?.value"
            (ngModelChange)="form.patchValue({ hasChildren: $event })"
          />
          <div>
            <div class="text-sm font-medium text-foreground">Has Children</div>
            <div class="text-xs text-muted-foreground mt-0.5">
              Creates a dropdown or submenu container
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <ng-template pTemplate="footer">
        <div class="flex justify-end gap-2">
          <p-button
            label="Cancel"
            severity="secondary"
            [outlined]="true"
            (onClick)="onCancel()"
          />
          <p-button
            label="Save"
            icon="pi pi-check"
            (onClick)="onSave()"
          />
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class ItemFormComponent implements OnInit, OnChanges {
  @Input() title = 'Add Item';
  @Input() visible = false;
  @Input() initial?: Partial<ItemFormData>;

  @Output() saved = new EventEmitter<ItemFormData>();
  @Output() cancelled = new EventEmitter<void>();

  protected readonly predefinedColors = PREDEFINED_COLORS;
  protected readonly selectedColor = signal<string | undefined>(undefined);
  protected readonly iconPickerOpen = signal(false);
  protected readonly iconSearch = signal('');

  protected form!: FormGroup;
  private readonly fb = inject(FormBuilder);

  // Pre-built icon URLs for chrome elements
  protected readonly chevronDownUrl = iconIdToSvgUrl('lucide:chevron-down', '#5c5c6e');
  protected readonly chevronUpUrl   = iconIdToSvgUrl('lucide:chevron-up',   '#5c5c6e');
  protected readonly sunMoonUrl     = iconIdToSvgUrl('lucide:sun-moon',     '#8b8b9e');
  protected readonly pipetteUrl     = iconIdToSvgUrl('lucide:pipette',      '#8b8b9e');

  protected readonly filteredIcons = signal<IconOption[]>(ICON_OPTIONS);

  protected readonly isCustom = isCustomColor;

  ngOnInit(): void {
    this.form = this.fb.group({
      label:       ['', Validators.required],
      iconId:      [DEFAULT_ICON.icon],
      actionId:    [''],
      hasChildren: [false],
    });
  }

  ngOnChanges(): void {
    if (this.visible && this.form) {
      this.form.patchValue({
        label:       this.initial?.label       ?? '',
        iconId:      this.initial?.iconId      ?? DEFAULT_ICON.icon,
        actionId:    this.initial?.actionId    ?? '',
        hasChildren: this.initial?.hasChildren ?? false,
      });
      this.selectedColor.set(this.initial?.iconColor);
      this.iconPickerOpen.set(false);
      this.iconSearch.set('');
      this.updateFilteredIcons();
      this.form.markAsUntouched();
    }
  }

  protected getIconUrl(iconId: string): string {
    return iconIdToSvgUrl(iconId, '#8b8b9e');
  }

  protected getSelectedIconUrl(): string {
    return iconIdToSvgUrl(this.form?.get('iconId')?.value ?? DEFAULT_ICON.icon, '#8b8b9e');
  }

  protected getSelectedIconName(): string {
    const id = this.form?.get('iconId')?.value ?? DEFAULT_ICON.icon;
    const found = ICON_OPTIONS.find(o => o.icon === id);
    return found?.name ?? id;
  }

  protected selectIcon(icon: IconOption): void {
    this.form.patchValue({ iconId: icon.icon });
    this.iconPickerOpen.set(false);
  }

  protected setIconColor(hex: string | undefined): void {
    this.selectedColor.set(hex);
  }

  protected toggleHasChildren(): void {
    const current = this.form.get('hasChildren')?.value;
    this.form.patchValue({ hasChildren: !current });
  }

  protected onIconSearch(value: string): void {
    this.iconSearch.set(value);
    this.updateFilteredIcons();
  }

  protected onSave(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { label, iconId, actionId, hasChildren } = this.form.value;
    this.saved.emit({
      label: label.trim(),
      iconId: iconId.trim() || DEFAULT_ICON.icon,
      actionId: actionId?.trim() ?? '',
      hasChildren: !!hasChildren,
      iconColor: this.selectedColor(),
    });
  }

  protected onCancel(): void {
    this.cancelled.emit();
  }

  private updateFilteredIcons(): void {
    const q = this.iconSearch().toLowerCase();
    if (!q) {
      this.filteredIcons.set(ICON_OPTIONS);
    } else {
      this.filteredIcons.set(ICON_OPTIONS.filter(i => i.name.toLowerCase().includes(q)));
    }
  }
}
