/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import {
  Component,
  OnInit,
  DestroyRef,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  Pipe,
  PipeTransform,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RegistryEditorService } from './registry-editor.service';
import { generateTemplateConfigId, type RegistryEntry } from '@markets/openfin-workspace';
import { ICON_NAMES, ICON_META } from '@markets/icons-svg';
import { iconIdToSvgUrl } from '@markets/angular-dock-editor';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';


/** Inject the shared --de-* design system CSS at runtime. */
const EDITOR_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
[data-dock-editor] {
  --de-font: 'DM Sans', system-ui, sans-serif;
  --de-mono: 'JetBrains Mono', monospace;
  --de-bg-deep: #0c0c0e; --de-bg: #111114; --de-bg-raised: #18181c;
  --de-bg-surface: #1e1e24; --de-bg-hover: #252530; --de-bg-active: #2a2a38;
  --de-border: rgba(255,255,255,0.06); --de-border-subtle: rgba(255,255,255,0.04);
  --de-border-strong: rgba(255,255,255,0.10);
  --de-text: #e8e8ec; --de-text-secondary: #8b8b9e;
  --de-text-tertiary: #5c5c6e; --de-text-ghost: #3a3a4a;
  --de-accent: #e8a849; --de-accent-dim: rgba(232,168,73,0.12);
  --de-accent-subtle: rgba(232,168,73,0.06);
  --de-danger: #e5534b; --de-danger-dim: rgba(229,83,75,0.12);
  --de-success: #3fb950;
  --de-shadow-sm: 0 1px 2px rgba(0,0,0,0.3); --de-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --de-shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
  --de-radius-sm: 6px; --de-radius-md: 10px; --de-radius-lg: 14px;
  font-family: var(--de-font); color: var(--de-text);
  -webkit-font-smoothing: antialiased;
}
[data-dock-editor][data-theme="light"] {
  --de-bg-deep: #f5f5f7; --de-bg: #fafafa; --de-bg-raised: #ffffff;
  --de-bg-surface: #f0f0f3; --de-bg-hover: #e8e8ec; --de-bg-active: #dddde3;
  --de-border: rgba(0,0,0,0.08); --de-border-subtle: rgba(0,0,0,0.04);
  --de-border-strong: rgba(0,0,0,0.12);
  --de-text: #1a1a2e; --de-text-secondary: #5c5c72;
  --de-text-tertiary: #8e8ea0; --de-text-ghost: #b8b8c8;
  --de-accent: #c4882e; --de-accent-dim: rgba(196,136,46,0.10);
  --de-shadow-sm: 0 1px 2px rgba(0,0,0,0.06); --de-shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --de-shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
}

`;

let cssInjected = false;
function injectStyles(): void {
  if (cssInjected) return;
  const style = document.createElement('style');
  style.setAttribute('data-registry-editor-styles', '');
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);
  cssInjected = true;
}

interface FormData {
  displayName: string;
  hostUrl: string;
  iconId: string;
  componentType: string;
  componentSubType: string;
  configId: string;
}

const EMPTY_FORM: FormData = {
  displayName: '', hostUrl: '',
  iconId: 'lucide:box', componentType: '', componentSubType: '',
  configId: '',
};

/**
 * Pure pipe — resolves an icon ID to a themed data URL or Iconify CDN URL.
 * Used in templates to avoid method calls that recalculate on every CD cycle.
 * Pure pipes only re-evaluate when their input values change.
 */
@Pipe({ name: 'iconUrl', standalone: true, pure: true })
export class IconUrlPipe implements PipeTransform {
  transform(iconId: string, theme: 'dark' | 'light'): string {
    const accentColor = theme === 'dark' ? '#e8a849' : '#c4882e';
    const [prefix, name] = iconId.split(':');
    if (prefix === 'mkt' && name) {
      return iconIdToSvgUrl(iconId, accentColor);
    }
    return `https://api.iconify.design/${iconId.replace(':', '/')}.svg?color=${encodeURIComponent(accentColor)}`;
  }
}

@Component({
  selector: 'mkt-registry-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputTextModule, IconUrlPipe,
  ],
  providers: [RegistryEditorService],
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .reg-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px;
      border-radius: var(--de-radius-sm); transition: background 0.15s ease; cursor: default; }
    .reg-row:hover { background: var(--de-bg-hover); }
    .reg-row:hover .reg-actions { opacity: 1; }
    .reg-actions { opacity: 0; transition: opacity 0.15s ease; display: flex; gap: 4px; }
    .reg-icon-box { width: 28px; height: 28px; border-radius: var(--de-radius-sm);
      background: var(--de-bg-surface); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .reg-name { font-size: 13px; font-weight: 500; color: var(--de-text); line-height: 1.3; }
    .reg-url { font-size: 11px; color: var(--de-text-tertiary); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; }
    .reg-tag { padding: 2px 6px; border-radius: var(--de-radius-sm); font-size: 10px; font-weight: 500;
      text-transform: uppercase; letter-spacing: 0.04em; }
    .action-btn { background: var(--de-bg-surface); border: 1px solid var(--de-border);
      border-radius: var(--de-radius-sm); padding: 4px; cursor: pointer;
      color: var(--de-text-secondary); display: flex; align-items: center; justify-content: center; }
    .action-btn:hover { background: var(--de-bg-hover); }
    .action-btn.danger { color: var(--de-danger); }

    /* Dialog overlay + container — fixed height, scrollable body, pinned footer */
    .form-overlay { position: fixed; inset: 0; z-index: 1000;
      background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; }
    .form-dialog { background: var(--de-bg-raised); border: 1px solid var(--de-border-strong);
      border-radius: var(--de-radius-lg); width: 480px; max-width: 90vw; max-height: 85vh;
      box-shadow: var(--de-shadow-lg); font-family: var(--de-font);
      display: flex; flex-direction: column; overflow: hidden; }
    .form-header { padding: 24px 28px 0; flex-shrink: 0; }
    .form-title { font-size: 18px; font-weight: 700; color: var(--de-text); margin-bottom: 0; }
    .form-body { flex: 1; overflow-y: auto; padding: 20px 28px; }
    .form-field { margin-bottom: 18px; }
    .form-label { display: block; font-size: 12px; font-weight: 500; color: var(--de-text-secondary);
      margin-bottom: 6px; letter-spacing: 0.01em; }
    .form-row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 10px;
      padding: 12px 28px; border-top: 1px solid var(--de-border); flex-shrink: 0; }

    /* PrimeNG input overrides — match dock theme + React shadcn sizing */
    :host ::ng-deep .form-dialog .p-inputtext {
      width: 100%; background: var(--de-bg-surface); color: var(--de-text);
      border: 1px solid var(--de-border-strong); border-radius: var(--de-radius-md);
      font-family: var(--de-font); font-size: 13px; padding: 10px 14px;
      transition: border-color 0.15s ease;
    }
    :host ::ng-deep .form-dialog .p-inputtext::placeholder { color: var(--de-text-ghost); }
    :host ::ng-deep .form-dialog .p-inputtext:focus,
    :host ::ng-deep .form-dialog .p-inputtext:enabled:focus {
      border-color: var(--de-accent); box-shadow: none; outline: none;
    }
    :host ::ng-deep .form-dialog .p-inputtext.mono {
      font-family: var(--de-mono); font-size: 12px;
    }

    /* PrimeNG button overrides for dialog — compact, matching React */
    :host ::ng-deep .form-actions .p-button {
      font-size: 13px; font-weight: 600; font-family: var(--de-font);
      padding: 8px 20px; border-radius: var(--de-radius-md);
    }
    :host ::ng-deep .form-actions .p-button.p-button-secondary {
      background: var(--de-bg-surface); color: var(--de-text-secondary);
      border: 1px solid var(--de-border-strong);
    }
    :host ::ng-deep .form-actions .p-button.p-button-secondary:hover {
      background: var(--de-bg-hover);
    }

    /* Icon display row — click to open picker */
    .form-icon-display { display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      background: var(--de-bg-surface); border: 1px solid var(--de-border-strong);
      border-radius: var(--de-radius-md); cursor: pointer; transition: border-color 0.15s ease;
      font-size: 13px; color: var(--de-text); }
    .form-icon-display:hover { border-color: var(--de-accent); }

    /* Icon picker grid */
    .form-icon-grid { max-height: 160px; overflow-y: auto; display: grid;
      grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 4px;
      padding: 6px; margin-top: 8px; background: var(--de-bg-surface);
      border-radius: var(--de-radius-sm); border: 1px solid var(--de-border); }
    .form-icon-cell { width: 34px; height: 34px; display: flex; align-items: center;
      justify-content: center; border-radius: 4px; cursor: pointer;
      border: 1px solid transparent; transition: all 0.1s ease; }
    .form-icon-cell:hover { background: var(--de-bg-hover); border-color: var(--de-border-strong); }
    .form-icon-cell.selected { background: var(--de-accent-dim); border-color: var(--de-accent); }
  `],
  template: `
    <div data-dock-editor [attr.data-theme]="theme()"
      [style.position]="'fixed'" [style.inset]="'0'"
      [style.display]="'flex'" [style.flex-direction]="'column'"
      [style.background]="'var(--de-bg-deep)'" [style.overflow]="'hidden'"
      [style.font-family]="'var(--de-font)'">

      <!-- Header -->
      <div [style.display]="'flex'" [style.align-items]="'center'" [style.gap]="'12px'"
        [style.padding]="'16px 20px'" [style.border-bottom]="'1px solid var(--de-border)'"
        [style.background]="'var(--de-bg)'">
        <span [style.font-size]="'15px'" [style.font-weight]="'600'" [style.color]="'var(--de-text)'">
          Component Registry
        </span>
        <span [style.font-size]="'11px'" [style.font-weight]="'500'" [style.padding]="'2px 8px'"
          [style.border-radius]="'10px'" [style.background]="'var(--de-accent-dim)'"
          [style.color]="'var(--de-accent)'">
          {{ svc.entryCount() }} {{ svc.entryCount() === 1 ? 'component' : 'components' }}
        </span>
        <div [style.flex]="'1'"></div>
        <button class="action-btn" (click)="toggleTheme()" title="Toggle theme">
          {{ theme() === 'dark' ? '☀' : '🌙' }}
        </button>
        <button pButton [disabled]="!svc.isDirty()" (click)="svc.save()" label="Save"
          [style.font-size]="'12px'" [style.padding]="'6px 16px'"
          [severity]="svc.isDirty() ? 'warn' : 'secondary'" size="small"></button>
      </div>

      <!-- Body -->
      <div [style.flex]="'1'" [style.overflow]="'auto'" [style.padding]="'12px 16px'">
        @if (svc.isLoading()) {
          <div [style.text-align]="'center'" [style.padding]="'40px'"
            [style.color]="'var(--de-text-secondary)'">Loading...</div>
        } @else if (svc.entryCount() === 0) {
          <div [style.display]="'flex'" [style.flex-direction]="'column'" [style.align-items]="'center'"
            [style.justify-content]="'center'" [style.height]="'100%'" [style.gap]="'12px'">
            <div [style.font-size]="'13px'" [style.color]="'var(--de-text-tertiary)'">
              No components registered yet
            </div>
            <button pButton (click)="openAddDialog()" label="Add Component" severity="warn" size="small"></button>
          </div>
        } @else {
          @for (entry of svc.entries(); track entry.id) {
            <div class="reg-row">
              <div class="reg-icon-box">
                <img [src]="entry.iconId | iconUrl : theme()" width="14" height="14" alt="" />
              </div>
              <div [style.flex]="'1'" [style.min-width]="'0'">
                <div class="reg-name">{{ entry.displayName }}</div>
                <div class="reg-url">{{ entry.hostUrl }}</div>
                @if (entry.configId) {
                  <div [style.font-size]="'10px'" [style.font-family]="'var(--de-mono)'"
                    [style.color]="'var(--de-text-tertiary)'" [style.margin-top]="'2px'">
                    {{ entry.configId }}
                  </div>
                }
              </div>
              <span class="reg-tag" [style.background]="'var(--de-accent-dim)'"
                [style.color]="'var(--de-accent)'">{{ entry.componentType }}</span>
              <span class="reg-tag" [style.background]="'var(--de-bg-surface)'"
                [style.color]="'var(--de-text-secondary)'">{{ entry.componentSubType }}</span>
              <div class="reg-actions">
                <button class="action-btn" (click)="openEditDialog(entry)" title="Edit">✎</button>
                <button class="action-btn" (click)="svc.testComponent(entry)" title="Test">▶</button>
                <button class="action-btn danger" (click)="svc.removeEntry(entry.id)" title="Delete">✕</button>
              </div>
            </div>
          }
        }
      </div>

      <!-- Footer -->
      @if (svc.entryCount() > 0) {
        <div [style.padding]="'12px 20px'" [style.border-top]="'1px solid var(--de-border)'"
          [style.background]="'var(--de-bg)'" [style.display]="'flex'" [style.justify-content]="'center'">
          <button pButton (click)="openAddDialog()" label="Add Component" icon="pi pi-plus"
            severity="secondary" size="small"></button>
        </div>
      }

      <!-- Custom Dialog — matches React form exactly -->
      @if (dialogVisible()) {
        <div class="form-overlay" (click)="dialogVisible.set(false)">
          <div class="form-dialog" (click)="$event.stopPropagation()">
            <!-- Header — pinned -->
            <div class="form-header">
              <div class="form-title">{{ dialogTitle() }}</div>
            </div>

            <!-- Scrollable body -->
            <div class="form-body">
              <!-- Display Name -->
              <div class="form-field">
                <label class="form-label">Display Name</label>
                <input pInputText [ngModel]="form().displayName"
                  (ngModelChange)="updateForm('displayName', $event)"
                  placeholder="e.g., Credit Blotter" />
              </div>

              <!-- Host URL -->
              <div class="form-field">
                <label class="form-label">Host URL</label>
                <input pInputText [ngModel]="form().hostUrl"
                  (ngModelChange)="updateForm('hostUrl', $event)"
                  placeholder="e.g., http://localhost:5174/views/credit-blotter" />
              </div>

              <!-- Icon — click to toggle picker -->
              <div class="form-field">
                <label class="form-label">Icon</label>
                <div class="form-icon-display" (click)="iconPickerOpen.set(!iconPickerOpen())">
                  <img [src]="form().iconId | iconUrl : theme()" width="16" height="16" alt="" />
                  <span>{{ form().iconId }}</span>
                </div>
                @if (iconPickerOpen()) {
                  <input pInputText [ngModel]="iconSearch()"
                    (ngModelChange)="iconSearch.set($event)"
                    placeholder="Search icons..." [style.margin-top]="'8px'" />
                  <div class="form-icon-grid" style="height: 160px;">
                    @for (name of filteredIcons(); track name) {
                      <div class="form-icon-cell"
                        [class.selected]="form().iconId === 'mkt:' + name"
                        (click)="updateForm('iconId', 'mkt:' + name); iconPickerOpen.set(false)"
                        [title]="name">
                        <img [src]="'mkt:' + name | iconUrl : theme()" width="16" height="16" [alt]="name" />
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Component Type / SubType — two columns -->
              <div class="form-row-2col">
                <div class="form-field">
                  <label class="form-label">Component Type</label>
                  <input pInputText [ngModel]="form().componentType"
                    (ngModelChange)="updateForm('componentType', $event); onTypeSubTypeChange()"
                    placeholder="e.g., GRID" />
                </div>
                <div class="form-field">
                  <label class="form-label">Component SubType</label>
                  <input pInputText [ngModel]="form().componentSubType"
                    (ngModelChange)="updateForm('componentSubType', $event); onTypeSubTypeChange()"
                    placeholder="e.g., CREDIT" />
                </div>
              </div>

              <!-- Config ID -->
              <div class="form-field">
                <label class="form-label">Config ID</label>
                <input pInputText class="mono" [ngModel]="form().configId"
                  (ngModelChange)="updateForm('configId', $event); configIdEdited.set(true)"
                  placeholder="Auto-generated from type/subtype" />
              </div>
            </div>

            <!-- Footer — pinned at bottom -->
            <div class="form-actions">
              <button pButton (click)="dialogVisible.set(false)" label="Cancel"
                severity="secondary" size="small"></button>
              <button pButton (click)="handleSave()" label="Save"
                severity="warn" size="small"></button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class RegistryEditorComponent implements OnInit {
  readonly svc = inject(RegistryEditorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly theme = signal<'dark' | 'light'>('dark');
  readonly dialogVisible = signal(false);
  readonly dialogTitle = signal('Add Component');
  readonly editingId = signal<string | null>(null);

  // Form state as signal — required for OnPush change detection
  readonly form = signal<FormData>({ ...EMPTY_FORM });

  readonly configIdEdited = signal(false);
  readonly iconPickerOpen = signal(false);
  readonly iconSearch = signal('');
  readonly filteredIcons = computed(() => {
    const q = this.iconSearch().toLowerCase();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((name) => {
      const meta = ICON_META[name];
      return name.includes(q) || meta?.name?.toLowerCase().includes(q) || meta?.category?.toLowerCase().includes(q);
    });
  });

  private themeHandler: ((data: { isDark: boolean }) => void) | null = null;

  ngOnInit(): void {
    injectStyles();
    this.svc.init().catch(err => console.error('RegistryEditor: init failed', err));
    this.syncTheme();
  }

  /** Subscribe to OpenFin theme. Uses DestroyRef for cleanup instead of ngOnDestroy. */
  private syncTheme(): void {
    if (typeof fin === 'undefined') return;

    let active = true;
    this.destroyRef.onDestroy(() => {
      active = false;
      // Unsubscribe IAB theme listener
      if (this.themeHandler) {
        try {
          fin.InterApplicationBus.unsubscribe(
            { uuid: fin.me.identity.uuid }, 'theme-changed', this.themeHandler,
          );
        } catch { /* cleanup */ }
      }
    });

    // Read initial theme
    (async () => {
      try {
        const platform = fin.Platform.getCurrentSync();
        const scheme = await platform.Theme.getSelectedScheme();
        if (!active) return;
        this.theme.set(scheme === 'dark' ? 'dark' : 'light');
      } catch { /* keep default */ }
    })();

    // Listen for theme changes — guarded against post-destroy writes
    this.themeHandler = (data: { isDark: boolean }) => {
      if (!active) return;
      this.theme.set(data.isDark ? 'dark' : 'light');
    };
    try {
      fin.InterApplicationBus.subscribe(
        { uuid: fin.me.identity.uuid }, 'theme-changed', this.themeHandler,
      );
    } catch { /* IAB not ready */ }
  }

  toggleTheme(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  /** Update a single form field immutably — triggers OnPush CD */
  updateForm(field: keyof FormData, value: string): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  onTypeSubTypeChange(): void {
    if (!this.configIdEdited()) {
      const f = this.form();
      if (f.componentType && f.componentSubType) {
        this.form.update(prev => ({
          ...prev,
          configId: generateTemplateConfigId(prev.componentType.toUpperCase(), prev.componentSubType.toUpperCase()),
        }));
      }
    }
  }

  openAddDialog(): void {
    this.editingId.set(null);
    this.form.set({ ...EMPTY_FORM });
    this.configIdEdited.set(false);
    this.iconSearch.set('');
    this.iconPickerOpen.set(false);
    this.dialogTitle.set('Add Component');
    this.dialogVisible.set(true);
  }

  openEditDialog(entry: RegistryEntry): void {
    this.editingId.set(entry.id);
    this.form.set({
      displayName: entry.displayName,
      hostUrl: entry.hostUrl,
      iconId: entry.iconId,
      componentType: entry.componentType,
      componentSubType: entry.componentSubType,
      configId: entry.configId ?? '',
    });
    this.configIdEdited.set(true);
    this.iconSearch.set('');
    this.iconPickerOpen.set(false);
    this.dialogTitle.set('Edit Component');
    this.dialogVisible.set(true);
  }

  handleSave(): void {
    const f = this.form();
    if (!f.displayName || !f.hostUrl || !f.componentType || !f.componentSubType) {
      return;
    }

    const currentEditingId = this.editingId();

    const entry: RegistryEntry = {
      id: currentEditingId ?? crypto.randomUUID(),
      displayName: f.displayName,
      hostUrl: f.hostUrl,
      iconId: f.iconId,
      componentType: f.componentType.toUpperCase(),
      componentSubType: f.componentSubType.toUpperCase(),
      configId: f.configId || generateTemplateConfigId(
        f.componentType.toUpperCase(),
        f.componentSubType.toUpperCase(),
      ),
      createdAt: currentEditingId
        ? (this.svc.entries().find((e) => e.id === currentEditingId)?.createdAt ?? new Date().toISOString())
        : new Date().toISOString(),
    };

    if (currentEditingId) {
      this.svc.updateEntry(currentEditingId, entry);
    } else {
      this.svc.addEntry(entry);
    }

    this.dialogVisible.set(false);
  }
}
