import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import type { DockMenuItem } from '@marketsui/shared-types';

@Component({
  selector: 'stern-properties-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4 p-4" [formGroup]="form">
      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground" for="caption">Display Name</label>
        <input
          id="caption"
          formControlName="caption"
          class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground" for="url">Component URL</label>
        <input
          id="url"
          formControlName="url"
          [placeholder]="hasChildren ? '(parent items do not have URLs)' : '/blotter/orders'"
          class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground" for="icon">Icon Path</label>
        <input
          id="icon"
          formControlName="icon"
          placeholder="/icons/blotter-dark.svg"
          class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="openMode">Open Mode</label>
          <select
            id="openMode"
            formControlName="openMode"
            class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="view">View</option>
            <option value="window">Window</option>
          </select>
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="order">Sort Order</label>
          <input
            id="order"
            type="number"
            formControlName="order"
            class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <hr class="border-border my-3" />

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground">Item ID</label>
        <div class="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1.5 rounded-md break-all">
          {{ item.id }}
        </div>
      </div>
    </div>
  `,
})
export class PropertiesPanelComponent implements OnChanges {
  @Input() item!: DockMenuItem;
  @Output() onUpdate = new EventEmitter<{ id: string; updates: Partial<DockMenuItem> }>();

  form!: FormGroup;

  constructor(private fb: FormBuilder) {}

  get hasChildren(): boolean {
    return !!(this.item?.children && this.item.children.length > 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['item']) {
      this.buildForm();
    }
  }

  private buildForm(): void {
    if (this.form) {
      this.form.patchValue({
        caption: this.item.caption,
        url: this.item.url ?? '',
        icon: this.item.icon ?? '',
        openMode: this.item.openMode,
        order: this.item.order,
      }, { emitEvent: false });
    } else {
      this.form = this.fb.group({
        caption: [this.item.caption],
        url: [{ value: this.item.url ?? '', disabled: this.hasChildren }],
        icon: [this.item.icon ?? ''],
        openMode: [{ value: this.item.openMode, disabled: this.hasChildren }],
        order: [this.item.order],
      });

      this.form.valueChanges.subscribe((val) => {
        this.onUpdate.emit({ id: this.item.id, updates: val });
      });
    }

    if (this.hasChildren) {
      this.form.get('url')?.disable({ emitEvent: false });
      this.form.get('openMode')?.disable({ emitEvent: false });
    } else {
      this.form.get('url')?.enable({ emitEvent: false });
      this.form.get('openMode')?.enable({ emitEvent: false });
    }
  }
}
