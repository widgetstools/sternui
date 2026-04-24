/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import type { CellStyle, ColDef, RowClickedEvent, Theme } from 'ag-grid-community';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  colorSchemeDark,
  colorSchemeLight,
} from 'ag-grid-community';

// PrimeNG imports — shadcn's Angular counterpart per repo rules.
// We deliberately do NOT use `p-drawer` for the row editor — it portals to
// <body> and pulls in tailwind-adjacent chrome that breaks inside the
// child window. An inline right-docked panel (see template) is simpler
// and stays inside the `[data-dock-editor]` token scope.
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import { ConfigBrowserService } from './config-browser.service';
import { TABLES, type TableKey, type TableMeta } from './tables';

ModuleRegistry.registerModules([AllCommunityModule]);

// ─── `--de-*` token bridge (same as dock-editor / registry-editor) ──

const EDITOR_CSS = `
:root, [data-dock-editor] {
  --de-font: var(--fi-sans);
  --de-mono: var(--fi-mono);

  --de-bg-deep:    var(--bn-bg);
  --de-bg:         var(--bn-bg1);
  --de-bg-raised:  var(--bn-bg1);
  --de-bg-surface: var(--bn-bg2);
  --de-bg-hover:   var(--bn-bg3);

  --de-border:         var(--bn-border);
  --de-border-strong:  var(--bn-border2);

  --de-text:           var(--bn-t0);
  --de-text-secondary: var(--bn-t1);
  --de-text-tertiary:  var(--bn-t2);
  --de-text-ghost:     var(--bn-t3);

  --de-accent:         var(--bn-blue);
  --de-accent-dim:     var(--bn-info-soft);
  --de-danger:         var(--bn-red);

  --de-radius-sm: 6px;
  --de-radius-md: 10px;

  font-family: var(--de-font);
  color: var(--de-text);
  -webkit-font-smoothing: antialiased;
}

/* PrimeNG input/button chrome */
.p-inputtext { background: var(--bn-bg2) !important; color: var(--bn-t0) !important; border: 1px solid var(--bn-border) !important; }
.p-inputtext:focus, .p-inputtext:enabled:focus {
  border-color: var(--bn-blue) !important;
  box-shadow: 0 0 0 2px var(--bn-info-soft) !important;
}
.p-inputtext::placeholder { color: var(--bn-t2) !important; }
.p-button { font-family: var(--fi-sans) !important; }
.p-button:not(.p-button-text):not(.p-button-secondary):not(.p-button-danger) {
  background: var(--bn-blue) !important;
  color: var(--bn-cta-text, #fff) !important;
  border: 1px solid var(--bn-blue) !important;
}
.p-button.p-button-text {
  background: transparent !important;
  color: var(--bn-t1) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-button.p-button-text:enabled:hover { background: var(--bn-bg3) !important; }
.p-button.p-button-danger {
  background: var(--bn-red) !important;
  color: #fff !important;
  border: 1px solid var(--bn-red) !important;
}
`;

let cssInjected = false;
function injectStyles(): void {
  if (cssInjected) return;
  const style = document.createElement('style');
  style.setAttribute('data-config-browser-styles', '');
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);
  cssInjected = true;
}

// ─── AG-Grid theme (design-system driven) ───────────────────────────

const AG_THEME_DARK: Theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: 'var(--bn-bg1)',
  foregroundColor: 'var(--bn-t0)',
  headerBackgroundColor: 'var(--bn-bg2)',
  headerTextColor: 'var(--bn-t1)',
  rowHoverColor: 'var(--bn-bg3)',
  selectedRowBackgroundColor: 'var(--bn-info-soft)',
  borderColor: 'var(--bn-border)',
  accentColor: 'var(--bn-blue)',
  fontFamily: 'var(--fi-sans)',
  fontSize: 12,
});
const AG_THEME_LIGHT: Theme = themeQuartz.withPart(colorSchemeLight).withParams({
  backgroundColor: 'var(--bn-bg1)',
  foregroundColor: 'var(--bn-t0)',
  headerBackgroundColor: 'var(--bn-bg2)',
  headerTextColor: 'var(--bn-t1)',
  rowHoverColor: 'var(--bn-bg3)',
  selectedRowBackgroundColor: 'var(--bn-info-soft)',
  borderColor: 'var(--bn-border)',
  accentColor: 'var(--bn-blue)',
  fontFamily: 'var(--fi-sans)',
  fontSize: 12,
});

// ─── Component ──────────────────────────────────────────────────────

@Component({
  selector: 'mkt-config-browser',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, AgGridAngular, ButtonModule, InputTextModule, TextareaModule],
  providers: [ConfigBrowserService],
  template: `
    <div
      data-dock-editor
      [attr.data-theme]="theme()"
      style="position: fixed; inset: 0; display: flex; flex-direction: column;
             background: var(--de-bg-deep); font-family: var(--de-font); overflow: hidden;"
    >
      <!-- Header -->
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px 20px;
                  border-bottom: 1px solid var(--de-border); background: var(--de-bg);">
        <span style="display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--de-text);">
          <i class="pi pi-database" style="color: var(--de-accent);"></i>
          Config Browser
        </span>
        <span style="font-size:10px;font-family:var(--de-mono);padding:3px 8px;border-radius:var(--de-radius-sm);
                     background: var(--de-bg-surface); color: var(--de-text-tertiary);
                     border: 1px solid var(--de-border);">
          appId: {{ hostEnv().appId || '—' }}
        </span>
        <div style="flex: 1;"></div>
        <button type="button" (click)="toggleTheme()" title="Toggle theme"
                style="background: var(--de-bg-surface); border: 1px solid var(--de-border);
                       border-radius: var(--de-radius-sm); padding: 6px; cursor: pointer;
                       color: var(--de-text-secondary); display: flex;">
          <i [class]="theme() === 'dark' ? 'pi pi-sun' : 'pi pi-moon'"></i>
        </button>
      </div>

      <!-- Body -->
      <div style="flex: 1; min-height: 0; display: flex;">
        <!-- Sidebar -->
        <aside style="width: 220px; border-right: 1px solid var(--de-border);
                      background: var(--de-bg); display: flex; flex-direction: column; overflow: hidden;">
          <div style="padding: 12px 16px 8px 16px; font-size: 10px; font-weight: 700;
                      letter-spacing: 0.8px; text-transform: uppercase; color: var(--de-text-tertiary);">
            Tables
          </div>
          <nav style="flex: 1; overflow-y: auto; padding: 0 8px 8px 8px;">
            <button *ngFor="let t of tables" type="button" (click)="setSelected(t.key)"
                    [style.background]="selected().key === t.key ? 'var(--de-accent-dim)' : 'transparent'"
                    [style.color]="selected().key === t.key ? 'var(--de-accent)' : 'var(--de-text-secondary)'"
                    [style.font-weight]="selected().key === t.key ? 600 : 500"
                    style="width: 100%; display: flex; align-items: center; justify-content: space-between;
                           gap: 8px; padding: 8px 10px; margin-bottom: 2px; border: none;
                           border-radius: var(--de-radius-sm); font-size: 12px; cursor: pointer;
                           text-align: left; font-family: var(--de-font);">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ t.label }}</span>
              <span style="font-size: 10px; font-family: var(--de-mono); padding: 1px 6px;
                           border-radius: 4px; min-width: 22px; text-align: center;"
                    [style.background]="selected().key === t.key ? 'var(--de-accent)' : 'var(--de-bg-surface)'"
                    [style.color]="selected().key === t.key ? 'var(--de-bg)' : 'var(--de-text-tertiary)'">
                {{ countOf(t.key) }}
              </span>
            </button>
          </nav>
        </aside>

        <!-- Main -->
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;
                    background: var(--de-bg-deep); position: relative;">
          <!-- Toolbar -->
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 16px;
                      border-bottom: 1px solid var(--de-border); background: var(--de-bg);">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div style="font-size: 13px; font-weight: 600; color: var(--de-text);">{{ selected().label }}</div>
              <div style="font-size: 11px; color: var(--de-text-tertiary);">
                {{ rows().length }} rows · pk {{ selected().primaryKey }}
              </div>
            </div>
            <div style="flex: 1;"></div>

            <input pInputText type="text" placeholder="Search rows…"
                   [ngModel]="quickFilter()" (ngModelChange)="quickFilter.set($event)"
                   style="height: 30px; width: 240px; font-size: 12px;" />

            <button pButton type="button" class="p-button-text" (click)="refresh()" title="Refresh"
                    style="height: 30px;">
              <i class="pi pi-refresh"></i>
            </button>
            <button pButton type="button" class="p-button-text" (click)="exportJson()" title="Export JSON"
                    style="height: 30px;">
              <i class="pi pi-download"></i>
            </button>
            <button pButton type="button" (click)="openCreate()" style="height: 30px;">
              <i class="pi pi-plus" style="margin-right: 6px;"></i> New
            </button>
          </div>

          <!-- Grid / empty / loading -->
          <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8px 12px 12px 12px;">
            <div *ngIf="isLoading()" style="flex:1;display:flex;align-items:center;justify-content:center;
                                            font-size:13px;color:var(--de-text-tertiary);">
              Loading…
            </div>

            <div *ngIf="!isLoading() && rows().length === 0"
                 style="flex:1;display:flex;flex-direction:column;align-items:center;
                        justify-content:center;gap:12px;">
              <i class="pi pi-inbox" style="font-size: 32px; color: var(--de-text-ghost);"></i>
              <div style="font-size:13px;color:var(--de-text-tertiary);">
                No rows in {{ selected().label }}
                <ng-container *ngIf="selected().scopable && hostEnv().appId">
                  for {{ hostEnv().appId }}
                </ng-container>
              </div>
              <button pButton type="button" (click)="openCreate()">Add first row</button>
            </div>

            <ag-grid-angular *ngIf="!isLoading() && rows().length > 0"
              style="width: 100%; flex: 1;"
              [theme]="agTheme()"
              [rowData]="rows()"
              [columnDefs]="columnDefs()"
              [defaultColDef]="defaultColDef"
              [quickFilterText]="quickFilter()"
              [rowHeight]="32"
              [headerHeight]="34"
              [suppressCellFocus]="true"
              [animateRows]="true"
              (rowClicked)="onRowClick($event)">
            </ag-grid-angular>
          </div>

          <!-- Right-docked JSON editor. Anchors to main pane; no portal,
               no modal overlay — slides in over the grid only. -->
          <div
            [attr.aria-hidden]="!drawerOpen"
            [style.transform]="drawerOpen ? 'translateX(0)' : 'translateX(100%)'"
            [style.box-shadow]="drawerOpen ? 'var(--de-shadow-lg)' : 'none'"
            [style.pointer-events]="drawerOpen ? 'auto' : 'none'"
            style="position: absolute; top: 0; right: 0; bottom: 0;
                   width: min(520px, 100%); background: var(--de-bg);
                   border-left: 1px solid var(--de-border);
                   display: flex; flex-direction: column;
                   transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
                   z-index: 20; color: var(--de-text); font-family: var(--de-font);">

            <!-- Header -->
            <div style="display: flex; align-items: center; gap: 8px; padding: 12px 16px;
                        border-bottom: 1px solid var(--de-border); background: var(--de-bg);">
              <i [class]="drawerMode === 'create' ? 'pi pi-plus-circle' : 'pi pi-file'"
                 style="color: var(--de-accent); font-size: 14px;"></i>
              <span style="font-size: 13px; font-weight: 600; color: var(--de-text);">
                {{ drawerMode === 'create' ? 'New row' : 'Edit row' }}
              </span>
              <span style="font-family: var(--de-mono); font-size: 11px;
                           color: var(--de-text-tertiary); overflow: hidden;
                           text-overflow: ellipsis; white-space: nowrap;">
                {{ drawerTitle() }}
              </span>
              <div style="flex: 1;"></div>
              <button type="button" (click)="closeDrawer()" title="Close"
                      style="background: transparent; border: 1px solid var(--de-border);
                             border-radius: var(--de-radius-sm); padding: 4px;
                             cursor: pointer; color: var(--de-text-secondary);
                             display: flex; align-items: center; justify-content: center;">
                <i class="pi pi-times" style="font-size: 12px;"></i>
              </button>
            </div>

            <!-- Body -->
            <div style="flex: 1; min-height: 0; display: flex; flex-direction: column;
                        padding: 14px; gap: 8px;">
              <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.8px;
                          text-transform: uppercase; color: var(--de-text-tertiary);">
                JSON payload
              </div>
              <textarea [(ngModel)]="jsonText" [spellcheck]="false"
                        style="flex: 1; min-height: 240px; width: 100%; padding: 10px;
                               font-family: var(--de-mono); font-size: 12px;
                               line-height: 1.5; background: var(--de-bg-surface);
                               border-radius: var(--de-radius-sm); color: var(--de-text);
                               resize: none; outline: none; box-sizing: border-box;"
                        [style.border]="parseError() ? '1px solid var(--de-danger)' : '1px solid var(--de-border)'">
              </textarea>
              <div *ngIf="parseError()" style="font-size: 11px; color: var(--de-danger);
                                                  font-family: var(--de-mono);">
                {{ parseError() }}
              </div>
            </div>

            <!-- Footer -->
            <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px;
                        border-top: 1px solid var(--de-border); background: var(--de-bg);">
              <button *ngIf="drawerMode === 'edit'" type="button"
                      (click)="handleDelete()" [disabled]="saving()"
                      [style.border]="confirmDelete() ? '1px solid var(--de-danger)' : '1px solid var(--de-border)'"
                      [style.background]="confirmDelete() ? 'var(--de-danger)' : 'var(--de-bg-surface)'"
                      [style.color]="confirmDelete() ? '#fff' : 'var(--de-danger)'"
                      style="height: 30px; padding: 0 12px;
                             border-radius: var(--de-radius-sm);
                             font-size: 12px; font-weight: 600; cursor: pointer;
                             font-family: var(--de-font);">
                {{ confirmDelete() ? 'Click to confirm' : 'Delete' }}
              </button>
              <div style="flex: 1;"></div>
              <button type="button" (click)="closeDrawer()" [disabled]="saving()"
                      style="height: 30px; padding: 0 12px;
                             border-radius: var(--de-radius-sm);
                             border: 1px solid var(--de-border);
                             background: var(--de-bg-surface); color: var(--de-text-secondary);
                             font-size: 12px; font-weight: 500; cursor: pointer;
                             font-family: var(--de-font);">
                Cancel
              </button>
              <button type="button" (click)="handleSave()"
                      [disabled]="saving() || !canSave()"
                      [style.background]="canSave() ? 'var(--de-accent)' : 'var(--de-bg-surface)'"
                      [style.color]="canSave() ? 'var(--bn-cta-text, #fff)' : 'var(--de-text-tertiary)'"
                      [style.cursor]="canSave() && !saving() ? 'pointer' : 'not-allowed'"
                      style="height: 30px; padding: 0 16px;
                             border-radius: var(--de-radius-sm); border: none;
                             font-size: 12px; font-weight: 600;
                             font-family: var(--de-font);">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding: 8px 20px; border-top: 1px solid var(--de-border);
                  background: var(--de-bg); display: flex; align-items: center; gap: 12px;
                  font-size: 10px; color: var(--de-text-tertiary); font-family: var(--de-mono);">
        <span>{{ rows().length }} rows</span>
        <span>·</span>
        <span>dexie</span>
        <span>·</span>
        <span>marketsui-config</span>
        <div style="flex: 1;"></div>
        <span>{{ selected().description }}</span>
      </div>

    </div>
  `,
})
export class ConfigBrowserComponent implements OnInit, OnDestroy {
  private readonly svc = inject(ConfigBrowserService);

  readonly tables = TABLES;

  // Service-derived signals
  readonly hostEnv = this.svc.hostEnv;
  readonly selected = this.svc.selected;
  readonly rows = this.svc.rows;
  readonly counts = this.svc.counts;
  readonly isLoading = this.svc.isLoading;

  // Local UI state
  readonly theme = signal<'dark' | 'light'>('dark');
  readonly quickFilter = signal('');

  // Drawer state
  drawerOpen = false;
  drawerMode: 'edit' | 'create' = 'edit';
  drawerRow: any = null;
  jsonText = '{}';
  readonly parseError = signal<string | null>(null);
  readonly confirmDelete = signal(false);
  readonly saving = signal(false);

  readonly agTheme = computed(() =>
    this.theme() === 'dark' ? AG_THEME_DARK : AG_THEME_LIGHT,
  );

  readonly columnDefs = computed<ColDef[]>(() => {
    const rows = this.rows();
    if (rows.length === 0) return [];
    const pk = this.selected().primaryKey;
    const keys = Object.keys(rows[0]);
    const ordered = [pk, ...keys.filter((k) => k !== pk)];
    return ordered.map((key) => ({
      field: key,
      headerName: key,
      sortable: true,
      filter: true,
      resizable: true,
      pinned: key === pk ? 'left' : undefined,
      width: key === pk ? 220 : undefined,
      valueFormatter: (params: any) => {
        const v = params.value;
        if (v === undefined || v === null) return '';
        if (typeof v === 'object') {
          const json = JSON.stringify(v);
          return json.length > 80 ? json.slice(0, 80) + '…' : json;
        }
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        return String(v);
      },
      cellStyle: (params: any): CellStyle | null => {
        if (params.value === undefined || params.value === null) {
          return { color: 'var(--de-text-ghost)', fontStyle: 'italic' } as CellStyle;
        }
        if (typeof params.value === 'object') {
          return { fontFamily: 'var(--fi-mono)', color: 'var(--de-text-secondary)' } as CellStyle;
        }
        if (key === pk) {
          return { fontFamily: 'var(--fi-mono)', fontWeight: '600' } as CellStyle;
        }
        return null;
      },
    }));
  });

  readonly defaultColDef: ColDef = { minWidth: 80, flex: 1 };

  readonly drawerTitle = computed(() => {
    if (this.drawerMode === 'create') return 'new';
    if (!this.drawerRow) return '';
    const pk = this.selected().primaryKey;
    return String(this.drawerRow[pk] ?? '(unknown)');
  });

  readonly canSave = computed(() => {
    try { JSON.parse(this.jsonText); return true; } catch { return false; }
  });

  private iabUnsubscribe: (() => void) | undefined;

  constructor() {
    injectStyles();

    // Reflect theme on the <html> root so fi-dark/fi-light CSS vars re-resolve
    effect(() => {
      const t = this.theme();
      document.documentElement.setAttribute('data-theme', t);
      if (t === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.svc.init();
    await this.detectInitialTheme();
    this.subscribeToThemeChanges();
  }

  ngOnDestroy(): void {
    this.iabUnsubscribe?.();
  }

  countOf(key: TableKey): number {
    return this.counts()[key];
  }

  setSelected(key: TableKey): void {
    this.svc.setSelected(key);
  }

  toggleTheme(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  async refresh(): Promise<void> {
    await this.svc.refresh();
  }

  exportJson(): void {
    const json = JSON.stringify(this.rows(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.selected().key}-${this.hostEnv().appId || 'all'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  openCreate(): void {
    const rows = this.rows();
    const templateRow: Record<string, any> = rows[0] ? { ...rows[0] } : {};
    for (const k of Object.keys(templateRow)) templateRow[k] = '';
    if (this.selected().scopable && this.hostEnv().appId) {
      templateRow['appId'] = this.hostEnv().appId;
    }
    const now = new Date().toISOString();
    if ('creationTime' in templateRow) templateRow['creationTime'] = now;
    if ('updatedTime' in templateRow) templateRow['updatedTime'] = now;
    this.drawerMode = 'create';
    this.drawerRow = templateRow;
    this.jsonText = JSON.stringify(templateRow, null, 2);
    this.parseError.set(null);
    this.confirmDelete.set(false);
    this.drawerOpen = true;
  }

  onRowClick(e: RowClickedEvent): void {
    if (!e.data) return;
    this.drawerMode = 'edit';
    this.drawerRow = e.data;
    this.jsonText = JSON.stringify(e.data, null, 2);
    this.parseError.set(null);
    this.confirmDelete.set(false);
    this.drawerOpen = true;
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    this.confirmDelete.set(false);
  }

  async handleSave(): Promise<void> {
    this.saving.set(true);
    this.parseError.set(null);
    try {
      const parsed = JSON.parse(this.jsonText);
      await this.svc.saveRow(parsed);
      this.drawerOpen = false;
    } catch (err: any) {
      this.parseError.set(err?.message ?? 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async handleDelete(): Promise<void> {
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }
    if (!this.drawerRow) return;
    this.saving.set(true);
    try {
      const pk = this.selected().primaryKey;
      await this.svc.deleteRow(this.drawerRow[pk]);
      this.drawerOpen = false;
    } catch (err: any) {
      this.parseError.set(err?.message ?? 'Delete failed');
    } finally {
      this.saving.set(false);
      this.confirmDelete.set(false);
    }
  }

  private async detectInitialTheme(): Promise<void> {
    if (typeof fin === 'undefined') return;
    try {
      const platform = fin.Platform.getCurrentSync();
      const scheme = await platform.Theme.getSelectedScheme();
      this.theme.set(scheme === 'dark' ? 'dark' : 'light');
    } catch { /* keep default */ }
  }

  private subscribeToThemeChanges(): void {
    if (typeof fin === 'undefined') return;
    const handler = (data: { isDark: boolean }) => {
      this.theme.set(data.isDark ? 'dark' : 'light');
    };
    try {
      fin.InterApplicationBus.subscribe(
        { uuid: fin.me.identity.uuid },
        'theme-changed',
        handler,
      );
      this.iabUnsubscribe = () => {
        try {
          fin.InterApplicationBus.unsubscribe(
            { uuid: fin.me.identity.uuid },
            'theme-changed',
            handler,
          );
        } catch { /* cleanup */ }
      };
    } catch { /* IAB not ready */ }
  }
}
