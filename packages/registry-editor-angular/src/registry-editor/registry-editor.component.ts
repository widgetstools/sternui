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
import {
  generateTemplateConfigId,
  deriveSingletonConfigId,
  validateEntry,
  validateSingletonUniqueness,
  type RegistryEntry,
} from '@marketsui/openfin-platform';
import { ICON_NAMES, ICON_META } from '@marketsui/icons-svg';
import { iconIdToSvgUrl } from '@marketsui/angular-dock-editor';
import { dark, light } from '@marketsui/design-system/tokens/semantic';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';


/**
 * Registry-editor design tokens — 100% derived from @marketsui/design-system.
 *
 * Every `--de-*` variable below resolves to a design-system token
 * (`--bn-*` for colors/surfaces/text, `--fi-*` for typography). The
 * `--de-*` names are kept as internal aliases so the component styles
 * (below) can reference familiar semantic names while the resolved
 * values come from the one source of truth.
 *
 * Consumers must have the design-system theme CSS loaded at the app
 * root (see `packages/design-system/README.md`).
 */
// Scoped to :root, [data-dock-editor] so modal portals render with tokens.
const EDITOR_CSS = `
:root, [data-dock-editor] {
  --de-font: var(--fi-sans);
  --de-mono: var(--fi-mono);

  --de-bg-deep:    var(--bn-bg);
  --de-bg:         var(--bn-bg1);
  --de-bg-raised:  var(--bn-bg1);
  --de-bg-surface: var(--bn-bg2);
  --de-bg-hover:   var(--bn-bg3);
  --de-bg-active:  var(--bn-bg3);

  --de-border:         var(--bn-border);
  --de-border-subtle:  var(--bn-border);
  --de-border-strong:  var(--bn-border2);

  --de-text:           var(--bn-t0);
  --de-text-secondary: var(--bn-t1);
  --de-text-tertiary:  var(--bn-t2);
  --de-text-ghost:     var(--bn-t3);

  /* --de-accent is the PRIMARY BRAND accent — maps to --bn-blue
     (NOT --bn-amber, which is WARNING semantic). */
  --de-accent:         var(--bn-blue);
  --de-accent-dim:     var(--bn-info-soft);
  --de-accent-subtle:  var(--bn-info-soft);

  --de-danger:         var(--bn-red);
  --de-danger-dim:     var(--bn-negative-soft);
  --de-success:        var(--bn-green);

  --de-radius-sm: 6px;
  --de-radius-md: 10px;
  --de-radius-lg: 14px;

  --de-shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --de-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --de-shadow-lg: 0 8px 32px rgba(0,0,0,0.5);

  font-family: var(--de-font);
  color: var(--de-text);
  -webkit-font-smoothing: antialiased;
}

/* Match the root-level [data-theme="light"] selector so portal content inherits. */
[data-theme="light"], [data-dock-editor][data-theme="light"] {
  --de-shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --de-shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --de-shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
}

/* ── PrimeNG chrome overrides ─────────────────────────────────────
 * Force PrimeNG components (rendered via portals) to use design-system
 * tokens so they track [data-theme] together with the rest of the UI. */
.p-dialog,
.p-dialog-content,
.p-dialog-header,
.p-dialog-footer {
  background: var(--bn-bg1) !important;
  color: var(--bn-t0) !important;
}
.p-dialog { border: 1px solid var(--bn-border) !important; }
.p-dialog-header { border-bottom: 1px solid var(--bn-border) !important; }
.p-dialog-footer { border-top: 1px solid var(--bn-border) !important; }
.p-dialog-title { color: var(--bn-t0) !important; }
.p-dialog-mask { background: rgba(0, 0, 0, 0.55) !important; }

.p-inputtext {
  background: var(--bn-bg2) !important;
  color: var(--bn-t0) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-inputtext:focus,
.p-inputtext:enabled:focus {
  border-color: var(--bn-blue) !important;
  box-shadow: 0 0 0 2px var(--bn-info-soft) !important;
}
.p-inputtext::placeholder { color: var(--bn-t2) !important; }

.p-button.p-button-text {
  background: transparent !important;
  color: var(--bn-t0) !important;
  border: 1px solid var(--bn-border) !important;
}
.p-button.p-button-text:enabled:hover { background: var(--bn-bg3) !important; }
.p-button:not(.p-button-text):not(.p-button-secondary):not(.p-button-danger) {
  background: var(--bn-blue) !important;
  color: #fff !important;
  border: 1px solid var(--bn-blue) !important;
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
  // v2 fields
  type: 'internal' | 'external';
  usesHostConfig: boolean;
  appId: string;
  configServiceUrl: string;
  singleton: boolean;
}

const EMPTY_FORM: FormData = {
  displayName: '', hostUrl: '',
  iconId: 'lucide:box', componentType: '', componentSubType: '',
  configId: '',
  type: 'internal',
  usesHostConfig: true,
  appId: '',
  configServiceUrl: '',
  singleton: false,
};

/**
 * Pure pipe — resolves an icon ID to a themed data URL or Iconify CDN URL.
 * Used in templates to avoid method calls that recalculate on every CD cycle.
 * Pure pipes only re-evaluate when their input values change.
 */
@Pipe({ name: 'iconUrl', standalone: true, pure: true })
export class IconUrlPipe implements PipeTransform {
  transform(iconId: string, theme: 'dark' | 'light'): string {
    // Icon tint sourced from the design-system accent.info tokens
    // (the brand blue — NOT accent.warning/amber). SVG data URLs need
    // literal hex values at generation time, so we import resolved
    // values from @marketsui/design-system rather than hardcoding them.
    const accentColor = (theme === 'dark' ? dark : light).accent.info;
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
    ButtonModule, InputTextModule, ToggleSwitchModule,
    IconUrlPipe,
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

    /* v2 toggle row — elegant switch + label + subtitle, dark/light compatible via tokens */
    .form-toggle-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px;
      background: var(--de-bg-surface);
      border: 1px solid var(--de-border);
      border-radius: var(--de-radius-md);
      transition: border-color 0.15s ease;
    }
    .form-toggle-row:hover { border-color: var(--de-border-strong); }
    .form-toggle-text {
      flex: 1; display: flex; flex-direction: column; gap: 2px;
      min-width: 0;
    }
    .form-toggle-title {
      font-size: 13px; font-weight: 500; color: var(--de-text); line-height: 1.2;
    }
    .form-toggle-subtitle {
      font-size: 11px; color: var(--de-text-tertiary); line-height: 1.2;
    }

    /* PrimeNG ToggleSwitch — force design-system tokens so it tracks [data-theme] */
    :host ::ng-deep .p-toggleswitch .p-toggleswitch-slider {
      background: var(--de-bg-hover) !important;
      border: 1px solid var(--de-border-strong) !important;
    }
    :host ::ng-deep .p-toggleswitch.p-toggleswitch-checked .p-toggleswitch-slider {
      background: var(--de-accent) !important;
      border-color: var(--de-accent) !important;
    }
    :host ::ng-deep .p-toggleswitch .p-toggleswitch-handle {
      background: var(--de-bg-raised) !important;
    }
    :host ::ng-deep .p-toggleswitch.p-toggleswitch-checked .p-toggleswitch-handle {
      background: #fff !important;
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
              @if (entry.singleton) {
                <span class="reg-tag" title="Singleton — focus existing instance on launch"
                  [style.background]="'var(--de-accent-dim)'"
                  [style.color]="'var(--de-accent)'">1x</span>
              }
              @if (entry.type === 'external') {
                <span class="reg-tag" title="External hosting — foreign URL"
                  [style.background]="'var(--de-bg-surface)'"
                  [style.color]="'var(--de-danger)'">EXT</span>
              }
              @if (!entry.usesHostConfig) {
                <span class="reg-tag" title="Own config — does not use host ConfigService"
                  [style.background]="'var(--de-bg-surface)'"
                  [style.color]="'var(--de-text-secondary)'">OWN CFG</span>
              }
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
                  <label class="form-label">
                    Component SubType
                    @if (singletonUniquenessError()) {
                      <span style="color: var(--de-danger); margin-left: 4px; font-weight: 400;">
                        {{ singletonUniquenessError() }}
                      </span>
                    }
                  </label>
                  <input pInputText [ngModel]="form().componentSubType"
                    (ngModelChange)="updateForm('componentSubType', $event); onTypeSubTypeChange()"
                    placeholder="e.g., CREDIT" />
                </div>
              </div>

              <!-- v2: External + Singleton toggle rows -->
              <div class="form-field">
                <div class="form-toggle-row">
                  <div class="form-toggle-text">
                    <div class="form-toggle-title">External component</div>
                    <div class="form-toggle-subtitle">Hosted at a foreign URL, may use its own ConfigService</div>
                  </div>
                  <p-toggleswitch [ngModel]="form().type === 'external'"
                    (ngModelChange)="onExternalToggle($event)"></p-toggleswitch>
                </div>
              </div>

              <div class="form-field">
                <div class="form-toggle-row">
                  <div class="form-toggle-text">
                    <div class="form-toggle-title">Singleton</div>
                    <div class="form-toggle-subtitle">Re-launching focuses the existing instance instead of spawning a new one</div>
                  </div>
                  <p-toggleswitch [ngModel]="form().singleton"
                    (ngModelChange)="updateForm('singleton', $event); onTypeSubTypeChange()"></p-toggleswitch>
                </div>
              </div>

              <!-- External-only fields: AppId + ConfigServiceUrl (optional edits) -->
              @if (form().type === 'external') {
                <div class="form-field">
                  <label class="form-label">App ID</label>
                  <input pInputText [ngModel]="form().appId"
                    (ngModelChange)="updateForm('appId', $event)"
                    placeholder="e.g., tradingApp1" />
                  <div style="font-size: 10px; color: var(--de-text-tertiary); margin-top: 4px;">
                    Defaults to the host app's appId. Edit only if this external component targets a different app.
                  </div>
                </div>

                <div class="form-field">
                  <label class="form-label">Config Service URL</label>
                  <input pInputText [ngModel]="form().configServiceUrl"
                    (ngModelChange)="updateForm('configServiceUrl', $event)"
                    placeholder="https://…" />
                  <div style="font-size: 10px; color: var(--de-text-tertiary); margin-top: 4px;">
                    Defaults to the host's ConfigService. Leave empty if the component is self-contained.
                  </div>
                </div>
              }

              <!-- Config ID (disabled when singleton — auto-derived) -->
              <div class="form-field">
                <label class="form-label">Config ID</label>
                <input pInputText class="mono" [ngModel]="form().configId"
                  (ngModelChange)="updateForm('configId', $event); configIdEdited.set(true)"
                  [disabled]="form().singleton"
                  [style.opacity]="form().singleton ? '0.6' : '1'"
                  [placeholder]="form().singleton ? 'Derived from component type + subtype' : 'Auto-generated from type/subtype'" />
                @if (form().singleton) {
                  <div style="font-size: 10px; color: var(--de-text-tertiary); margin-top: 4px;">
                    Singleton configId is auto-derived and must be unique per appId
                  </div>
                }
              </div>
            </div>

            <!-- Footer — pinned at bottom -->
            <div class="form-actions">
              <button pButton (click)="dialogVisible.set(false)" label="Cancel"
                severity="secondary" size="small"></button>
              <button pButton (click)="handleSave()" label="Save"
                [disabled]="!!singletonUniquenessError()"
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

  /** Update a string form field immutably — triggers OnPush CD */
  updateForm<K extends keyof FormData>(field: K, value: FormData[K]): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  /** Typed update — semantic alias for non-string-valued fields in templates. */
  updateFormTyped<K extends keyof FormData>(field: K, value: FormData[K]): void {
    this.updateForm(field, value);
  }

  /** Toggling the External switch flips `type` and resets the
   *  appId/configServiceUrl fields to host defaults so the user
   *  starts from a sensible baseline they can then tweak. When
   *  switching back to internal, the values revert to host values
   *  (internal components always use host config). */
  onExternalToggle(checked: boolean): void {
    const env = this.svc.hostEnv();
    this.form.update(prev => ({
      ...prev,
      type: checked ? 'external' : 'internal',
      // Always reset to host defaults on toggle — prevents stale
      // foreign values from leaking into an internal entry on save.
      appId: env.appId,
      configServiceUrl: env.configServiceUrl,
    }));
  }

  onTypeSubTypeChange(): void {
    const f = this.form();
    if (!f.componentType || !f.componentSubType) return;

    // Singleton: configId is always derived, overrides any manual edit.
    if (f.singleton) {
      const derived = deriveSingletonConfigId(f.componentType, f.componentSubType);
      this.form.update(prev => ({ ...prev, configId: derived }));
      return;
    }

    // Non-singleton: auto-fill unless user manually edited.
    if (!this.configIdEdited()) {
      this.form.update(prev => ({
        ...prev,
        configId: generateTemplateConfigId(prev.componentType.toUpperCase(), prev.componentSubType.toUpperCase()),
      }));
    }
  }

  /** Live singleton-uniqueness check — returns an error string if the
   *  current form state would collide with an existing entry. */
  readonly singletonUniquenessError = computed<string | null>(() => {
    const f = this.form();
    if (!f.singleton || !f.componentType.trim() || !f.componentSubType.trim()) return null;

    const editingId = this.editingId();
    const allEntries = this.svc.entries();
    const hypothetical: RegistryEntry[] = allEntries.map(e =>
      e.id === editingId
        ? {
            ...e, ...f,
            componentType: f.componentType.toUpperCase(),
            componentSubType: f.componentSubType.toUpperCase(),
          }
        : e,
    );
    if (!editingId) {
      hypothetical.push({
        ...f,
        componentType: f.componentType.toUpperCase(),
        componentSubType: f.componentSubType.toUpperCase(),
        id: '__new__',
        createdAt: new Date().toISOString(),
        configId: deriveSingletonConfigId(f.componentType, f.componentSubType),
      });
    }

    const errs = validateSingletonUniqueness(hypothetical, f.appId);
    return errs.length > 0 ? errs[0].message : null;
  });

  openAddDialog(): void {
    const env = this.svc.hostEnv();
    this.editingId.set(null);
    this.form.set({
      ...EMPTY_FORM,
      appId: env.appId,
      configServiceUrl: env.configServiceUrl,
    });
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
      type: entry.type,
      usesHostConfig: entry.usesHostConfig,
      appId: entry.appId,
      configServiceUrl: entry.configServiceUrl,
      singleton: entry.singleton,
    });
    this.configIdEdited.set(true);
    this.iconSearch.set('');
    this.iconPickerOpen.set(false);
    this.dialogTitle.set('Edit Component');
    this.dialogVisible.set(true);
  }

  handleSave(): void {
    const f = this.form();
    if (this.singletonUniquenessError()) return;

    const currentEditingId = this.editingId();
    const componentType = f.componentType.toUpperCase();
    const componentSubType = f.componentSubType.toUpperCase();

    // Derive usesHostConfig:
    //   internal → always uses host config (by definition)
    //   external + appId/configUrl match host → uses host config (shared service)
    //   external + user edited either → doesn't use host config
    const env = this.svc.hostEnv();
    const usesHostConfig = f.type === 'internal'
      || (f.appId === env.appId && f.configServiceUrl === env.configServiceUrl);

    // Both `id` and `configId` derive from componentType +
    // componentSubType — single canonical formula. The registry
    // entry id IS the template configId; one row per
    // (componentType, componentSubType) pair.
    const derivedId = `${componentType}-${componentSubType}`.toLowerCase();
    const entry: RegistryEntry = {
      id: derivedId,
      displayName: f.displayName,
      hostUrl: f.hostUrl,
      iconId: f.iconId,
      componentType,
      componentSubType,
      configId: derivedId,
      createdAt: currentEditingId
        ? (this.svc.entries().find((e) => e.id === currentEditingId)?.createdAt ?? new Date().toISOString())
        : new Date().toISOString(),
      type: f.type,
      usesHostConfig,
      // Internal entries always store the host's values — external
      // entries store whatever the user entered (may equal host,
      // may differ).
      appId: f.type === 'internal' ? env.appId : f.appId,
      configServiceUrl: f.type === 'internal' ? env.configServiceUrl : f.configServiceUrl,
      singleton: f.singleton,
    };

    // Final entry-level validation against host env — belt-and-suspenders.
    const errs = validateEntry(entry, this.svc.hostEnv());
    if (errs.length > 0) {
      console.warn('Registry entry validation failed:', errs);
      return;
    }

    if (currentEditingId) {
      this.svc.updateEntry(currentEditingId, entry);
    } else {
      this.svc.addEntry(entry);
    }

    this.dialogVisible.set(false);
  }
}
