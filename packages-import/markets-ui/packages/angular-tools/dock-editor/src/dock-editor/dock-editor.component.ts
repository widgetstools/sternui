/**
 * DockEditorComponent
 *
 * Angular equivalent of the React DockEditorPanel.
 * Uses PrimeNG components + Tailwind CSS for layout and styling.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { DockEditorService } from './dock-editor.service';
import { TreeItemComponent, type TreeItemData } from './tree-item/tree-item.component';
import { ItemFormComponent, type ItemFormData } from './item-form/item-form.component';
import { injectEditorStyles } from './editor-styles';
import { IAB_THEME_CHANGED } from '@markets/openfin-workspace';
import {
  type DockButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
} from '@markets/openfin-workspace';
import { iconIdToSvgUrl } from './icon-utils';
import { parseIconUrl } from './icon-utils';

// ─── Helpers ────────────────────────────────────────────────────────

function menuItemToTree(item: DockMenuItemConfig): TreeItemData {
  const parsed = item.iconId
    ? { iconId: item.iconId }
    : parseIconUrl(item.iconUrl);
  return {
    id: item.id,
    label: item.tooltip,
    iconId: parsed.iconId,
    iconUrl: item.iconUrl,
    actionId: item.actionId,
    childCount: item.options?.length ?? 0,
    children: item.options?.map(menuItemToTree),
    isContainer: Array.isArray(item.options),
  };
}

function buttonToTree(btn: DockButtonConfig): TreeItemData {
  const isDropdown = btn.type === 'DropdownButton';
  const dropdown = isDropdown ? (btn as DockDropdownButtonConfig) : null;
  const parsed = btn.iconId
    ? { iconId: btn.iconId }
    : parseIconUrl(btn.iconUrl);
  return {
    id: btn.id,
    label: btn.tooltip,
    iconId: parsed.iconId,
    iconUrl: btn.iconUrl,
    childCount: dropdown?.options?.length ?? 0,
    children: dropdown?.options?.map(menuItemToTree),
    isContainer: isDropdown,
  };
}

function findMenuItemById(
  items: DockMenuItemConfig[],
  id: string,
): DockMenuItemConfig | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.options) {
      const found = findMenuItemById(item.options, id);
      if (found) return found;
    }
  }
  return undefined;
}

// ─── Component ──────────────────────────────────────────────────────

@Component({
  selector: 'mkt-dock-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DockEditorService],
  imports: [CommonModule, TreeItemComponent, ItemFormComponent, ButtonModule, TooltipModule],
  template: `
    <div
      data-dock-editor
      [attr.data-theme]="theme()"
      class="fixed inset-0 flex flex-col bg-background overflow-hidden"
    >

      <!-- ── Header ──────────────────────────────────────────────── -->
      <header class="flex items-center justify-between px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div class="flex items-center gap-3.5">
          <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <img
              [src]="layoutGridIcon()"
              width="18" height="18" alt="icon"
              class="hue-rotate-15 saturate-150 sepia"
            />
          </div>
          <div>
            <h1 class="text-base font-semibold text-foreground leading-tight tracking-tight m-0">
              Menu Editor
            </h1>
            <p class="text-xs text-muted-foreground m-0 mt-0.5">
              Configure toolbar buttons and menu hierarchy
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <p-button
            *ngIf="service.isDirty()"
            label="Save Changes"
            icon="pi pi-check"
            (onClick)="onSave()"
          />
          <p-button
            [text]="true"
            [rounded]="true"
            (onClick)="toggleTheme()"
            pTooltip="Toggle theme"
            tooltipPosition="bottom"
          >
            <img
              [src]="themeToggleIcon()"
              width="15" height="15" alt="theme"
            />
          </p-button>
        </div>
      </header>

      <!-- ── Body ─────────────────────────────────────────────────── -->
      <div class="flex-1 flex gap-px min-h-0 bg-border">

        <!-- Left: Structure -->
        <div class="flex-1 flex flex-col bg-card min-w-0 overflow-hidden">
          <!-- Section header -->
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
            <div class="flex items-center gap-2.5">
              <img [src]="listTreeIcon()" width="14" height="14" alt="" />
              <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Structure
              </span>
            </div>
            <div class="flex items-center gap-1">
              <p-button
                [text]="true"
                size="small"
                (onClick)="onImport()"
                pTooltip="Import"
                tooltipPosition="top"
              >
                <img [src]="uploadIcon()" width="12" height="12" alt="" class="mr-1" />
                Import
              </p-button>
              <p-button
                [text]="true"
                size="small"
                (onClick)="onExport()"
                pTooltip="Export"
                tooltipPosition="top"
              >
                <img [src]="downloadIcon()" width="12" height="12" alt="" class="mr-1" />
                Export
              </p-button>
            </div>
          </div>

          <!-- Add button -->
          <div class="px-4 pt-3">
            <p-button
              [outlined]="true"
              class="w-full"
              styleClass="w-full justify-center"
              (onClick)="openAddDialog()"
            >
              <img [src]="plusIcon()" width="14" height="14" alt="" class="mr-2" />
              Add Toolbar Button
            </p-button>
          </div>

          <!-- Tree -->
          <div class="flex-1 overflow-y-auto px-3 py-2.5 pb-4">
            <div
              *ngIf="!service.isLoading() && treeData().length === 0"
              class="flex flex-col items-center justify-center py-16"
            >
              <span class="text-sm font-medium text-muted-foreground">No toolbar buttons</span>
              <span class="text-xs text-muted-foreground/60 mt-1">
                Click above to create your first button
              </span>
            </div>
            <mkt-tree-item
              *ngFor="let item of treeData(); let i = index; trackBy: trackById"
              [item]="item"
              [index]="i"
              [total]="treeData().length"
              [depth]="0"
              [theme]="theme()"
              (edit)="onEditItem($event)"
              (remove)="onRemoveItem($event)"
              (moveUp)="onMoveUp($event)"
              (moveDown)="onMoveDown($event)"
              (addChild)="onAddChild($event)"
            />
          </div>
        </div>

        <!-- Right: Preview -->
        <div class="w-[340px] flex-shrink-0 flex flex-col bg-card overflow-hidden">
          <div class="px-5 py-3.5 border-b border-border flex-shrink-0 flex items-center gap-2.5">
            <img [src]="eyeIcon()" width="14" height="14" alt="" />
            <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Preview
            </span>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            <!-- Toolbar preview -->
            <div class="mb-6">
              <span class="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest block mb-2">
                Toolbar
              </span>
              <div class="flex flex-wrap gap-1.5 p-2.5 rounded-lg border border-border bg-card min-h-[44px]">
                <span
                  *ngIf="treeData().length === 0"
                  class="text-xs text-muted-foreground/50 py-1"
                >No buttons configured</span>
                <div
                  *ngFor="let item of treeData(); trackBy: trackById"
                  class="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border
                         bg-muted text-xs text-foreground"
                >
                  <img [src]="iconUrl(item.iconId)" width="13" height="13" [alt]="item.label" />
                  <span class="font-medium">{{ item.label }}</span>
                  <img
                    *ngIf="item.isContainer"
                    [src]="chevronDownIcon()"
                    width="11" height="11" alt=""
                  />
                </div>
              </div>
            </div>

            <!-- Hierarchy preview -->
            <div>
              <span class="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest block mb-2">
                Hierarchy
              </span>
              <div class="rounded-lg border border-border bg-card py-2 px-1">
                <div
                  *ngIf="treeData().length === 0"
                  class="flex items-center justify-center py-5"
                >
                  <span class="text-xs text-muted-foreground/50">Empty</span>
                </div>
                <ng-container *ngFor="let item of treeData(); trackBy: trackById">
                  <ng-container *ngTemplateOutlet="previewNode; context: { $implicit: item, depth: 0 }" />
                </ng-container>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Add/Edit dialog ── -->
      <mkt-item-form
        [visible]="dialogOpen()"
        [title]="dialogTitle()"
        [initial]="dialogInitial()"
        (saved)="onDialogSaved($event)"
        (cancelled)="dialogOpen.set(false)"
      />
    </div>

    <!-- Preview node template (recursive) -->
    <ng-template #previewNode let-item let-depth="depth">
      <div
        class="flex items-center gap-1.5 pr-2.5 py-1 text-xs rounded text-foreground"
        [style.paddingLeft.px]="depth * 16 + 10"
      >
        <img
          *ngIf="item.isContainer"
          [src]="chevronDownIcon()"
          width="12" height="12" alt="" class="text-muted-foreground flex-shrink-0"
        />
        <span *ngIf="!item.isContainer" class="w-3 flex-shrink-0"></span>
        <img [src]="iconUrl(item.iconId)" width="13" height="13" [alt]="item.label" class="flex-shrink-0" />
        <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{{ item.label }}</span>
        <span
          *ngIf="item.isContainer && item.children?.length"
          class="text-[10px] text-muted-foreground/50 font-medium"
        >{{ item.children.length }}</span>
      </div>
      <ng-container *ngIf="item.children?.length">
        <ng-container *ngFor="let child of item.children; trackBy: trackById">
          <ng-container *ngTemplateOutlet="previewNode; context: { $implicit: child, depth: depth + 1 }" />
        </ng-container>
      </ng-container>
    </ng-template>
  `,
})
export class DockEditorComponent implements OnInit, OnDestroy {
  protected readonly service = inject(DockEditorService);

  protected readonly theme = signal<'dark' | 'light'>('dark');
  protected readonly dialogOpen    = signal(false);
  protected readonly dialogTitle   = signal('Add Toolbar Button');
  protected readonly dialogInitial = signal<Partial<ItemFormData> | undefined>(undefined);

  protected readonly treeData = computed(() =>
    this.service.buttons().map(buttonToTree),
  );

  // ─── Static icon URLs computed once per theme change ─────────────
  private readonly iconColor = computed(() => this.theme() === 'dark' ? '#8b8b9e' : '#5c5c72');

  protected readonly layoutGridIcon  = computed(() => iconIdToSvgUrl('lucide:layout-grid', this.iconColor()));
  protected readonly listTreeIcon    = computed(() => iconIdToSvgUrl('lucide:list-tree', this.iconColor()));
  protected readonly uploadIcon      = computed(() => iconIdToSvgUrl('lucide:upload', this.iconColor()));
  protected readonly downloadIcon    = computed(() => iconIdToSvgUrl('lucide:download', this.iconColor()));
  protected readonly plusIcon        = computed(() => iconIdToSvgUrl('lucide:plus', this.iconColor()));
  protected readonly eyeIcon         = computed(() => iconIdToSvgUrl('lucide:eye', this.iconColor()));
  protected readonly chevronDownIcon = computed(() => iconIdToSvgUrl('lucide:chevron-down', this.iconColor()));
  protected readonly themeToggleIcon = computed(() =>
    this.theme() === 'dark'
      ? iconIdToSvgUrl('lucide:sun', this.iconColor())
      : iconIdToSvgUrl('lucide:moon', this.iconColor()),
  );

  private editTargetId: string | null = null;
  private addChildParent: { buttonId: string; parentItemId?: string } | null = null;
  private openFinApi: any = (window as any).fin;

  constructor() {
    // Sync the 'dark' class on <html> so Tailwind dark mode and PrimeNG
    // dark selectors respond to theme changes — mirrors React's useEffect.
    effect(() => {
      const isDark = this.theme() === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  ngOnInit(): void {
    injectEditorStyles();
    this.syncInitialTheme();
    this.subscribeToThemeChanges();
  }

  ngOnDestroy(): void {
    this.unsubscribeFromThemeChanges();
  }

  // ─── TrackBy ────────────────────────────────────────────────────────
  protected trackById(_: number, item: TreeItemData): string { return item.id; }

  // ─── Icon URL helper (for dynamic per-item icons) ──────────────────
  protected iconUrl(iconId: string): string {
    return iconIdToSvgUrl(iconId, this.iconColor());
  }

  // ─── Theme ──────────────────────────────────────────────────────

  private async syncInitialTheme(): Promise<void> {
    if (!this.openFinApi) return;
    try {
      const platform = this.openFinApi.Platform.getCurrentSync();
      const scheme = await platform.Theme.getSelectedScheme();
      this.theme.set(scheme === 'dark' ? 'dark' : 'light');
    } catch { /* keep default */ }
  }

  private readonly themeHandler = (data: { isDark: boolean }) => {
    this.theme.set(data.isDark ? 'dark' : 'light');
  };

  private subscribeToThemeChanges(): void {
    if (!this.openFinApi) return;
    try {
      this.openFinApi.InterApplicationBus.subscribe(
        { uuid: this.openFinApi.me.identity.uuid },
        IAB_THEME_CHANGED,
        this.themeHandler,
      );
    } catch { /* IAB may not be ready */ }
  }

  private unsubscribeFromThemeChanges(): void {
    if (!this.openFinApi) return;
    try {
      this.openFinApi.InterApplicationBus.unsubscribe(
        { uuid: this.openFinApi.me.identity.uuid },
        IAB_THEME_CHANGED,
        this.themeHandler,
      );
    } catch { /* ignore */ }
  }

  protected toggleTheme(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  // ─── Dialog handlers ────────────────────────────────────────────

  protected openAddDialog(): void {
    this.editTargetId = null;
    this.addChildParent = null;
    this.dialogTitle.set('Add Toolbar Button');
    this.dialogInitial.set(undefined);
    this.dialogOpen.set(true);
  }

  protected onAddChild(parentId: string): void {
    for (const btn of this.service.buttons()) {
      if (btn.id === parentId) {
        this.addChildParent = { buttonId: btn.id };
        break;
      }
      if (btn.type === 'DropdownButton') {
        const found = findMenuItemById((btn as DockDropdownButtonConfig).options, parentId);
        if (found) {
          this.addChildParent = { buttonId: btn.id, parentItemId: parentId };
          break;
        }
      }
    }
    this.editTargetId = null;
    this.dialogTitle.set('Add Child Item');
    this.dialogInitial.set(undefined);
    this.dialogOpen.set(true);
  }

  protected onEditItem(id: string): void {
    this.addChildParent = null;
    this.editTargetId = id;

    for (const btn of this.service.buttons()) {
      if (btn.id === id) {
        this.dialogTitle.set('Edit Button');
        this.dialogInitial.set({
          label:       btn.tooltip,
          iconId:      btn.iconId ?? 'lucide:file-text',
          actionId:    btn.type === 'ActionButton' ? (btn as any).actionId : '',
          hasChildren: btn.type === 'DropdownButton',
          iconColor:   btn.iconColor,
        });
        this.dialogOpen.set(true);
        return;
      }
      if (btn.type === 'DropdownButton') {
        const found = findMenuItemById((btn as DockDropdownButtonConfig).options, id);
        if (found) {
          this.dialogTitle.set('Edit Item');
          this.dialogInitial.set({
            label:       found.tooltip,
            iconId:      found.iconId ?? 'lucide:file-text',
            actionId:    found.actionId ?? '',
            hasChildren: Array.isArray(found.options),
            iconColor:   found.iconColor,
          });
          this.dialogOpen.set(true);
          return;
        }
      }
    }
  }

  protected onDialogSaved(data: ItemFormData): void {
    this.dialogOpen.set(false);
    const color = data.iconColor;
    const iconUrl = iconIdToSvgUrl(data.iconId, color);

    if (this.editTargetId) {
      const id = this.editTargetId;
      this.editTargetId = null;
      const btnIndex = this.service.buttons().findIndex((b) => b.id === id);
      if (btnIndex !== -1) {
        const btn = this.service.buttons()[btnIndex];
        this.service.updateButton(id, {
          ...btn,
          tooltip: data.label,
          iconUrl,
          iconId: data.iconId,
          iconColor: color,
          ...(btn.type === 'ActionButton' ? { actionId: data.actionId } : {}),
        } as DockButtonConfig);
      } else {
        for (const btn of this.service.buttons()) {
          if (btn.type === 'DropdownButton') {
            const found = findMenuItemById((btn as DockDropdownButtonConfig).options, id);
            if (found) {
              this.service.updateMenuItem(btn.id, id, {
                ...found, tooltip: data.label, iconUrl, iconId: data.iconId,
                iconColor: color, actionId: data.actionId,
              });
              break;
            }
          }
        }
      }
    } else if (this.addChildParent) {
      const { buttonId, parentItemId } = this.addChildParent;
      this.addChildParent = null;
      this.service.addMenuItem(buttonId, {
        id: `menu-${Date.now()}`, tooltip: data.label, iconUrl,
        iconId: data.iconId, iconColor: color, actionId: data.actionId,
        options: data.hasChildren ? [] : undefined,
      }, parentItemId);
    } else {
      const id = `btn-${Date.now()}`;
      if (data.hasChildren) {
        this.service.addButton({
          type: 'DropdownButton', id, tooltip: data.label,
          iconUrl, iconId: data.iconId, iconColor: color, options: [],
        });
      } else {
        this.service.addButton({
          type: 'ActionButton', id, tooltip: data.label,
          iconUrl, iconId: data.iconId, iconColor: color, actionId: data.actionId,
        });
      }
    }
  }

  // ─── Tree actions ────────────────────────────────────────────────

  protected onRemoveItem(id: string): void {
    if (!confirm('Delete this item?')) return;
    if (this.service.buttons().some((b) => b.id === id)) {
      this.service.removeButton(id);
      return;
    }
    for (const btn of this.service.buttons()) {
      if (btn.type === 'DropdownButton') {
        if (findMenuItemById((btn as DockDropdownButtonConfig).options, id)) {
          this.service.removeMenuItem(btn.id, id);
          return;
        }
      }
    }
  }

  protected onMoveUp(id: string): void {
    const idx = this.service.buttons().findIndex((b) => b.id === id);
    if (idx > 0) this.service.reorderButtons(idx, idx - 1);
  }

  protected onMoveDown(id: string): void {
    const btns = this.service.buttons();
    const idx = btns.findIndex((b) => b.id === id);
    if (idx >= 0 && idx < btns.length - 1) this.service.reorderButtons(idx, idx + 1);
  }

  protected async onSave(): Promise<void> {
    await this.service.save();
  }

  protected onExport(): void {
    const json = JSON.stringify(this.service.buttons(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dock-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected onImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (Array.isArray(data)) this.service.setButtons(data);
      } catch (err) {
        console.error('Import failed:', err);
      }
    };
    input.click();
  }
}
