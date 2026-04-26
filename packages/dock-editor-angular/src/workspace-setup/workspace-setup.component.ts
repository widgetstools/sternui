/**
 * WorkspaceSetupComponent — Angular twin of the React WorkspaceSetup.
 *
 * Three-pane editor reading L→R as a logical flow:
 *   ① COMPONENTS  (catalog · global)
 *   ② DOCK LAYOUT (per-user)
 *   ③ INSPECTOR  (context-sensitive)
 *
 * COMMIT-4 SCOPE: shell + read-only Components catalog + read-only
 * Dock layout + summary inspector. Per CLAUDE.md the Angular side
 * uses PrimeNG primitives (p-card, p-button, p-listbox, p-table)
 * themed via @marketsui/tokens-primeng — no native form inputs.
 *
 * Substantive Angular CRUD (add/edit/delete components, add-from-catalog,
 * inspector form) lands in subsequent commits — see the React side
 * for the complete behaviour spec the Angular version mirrors.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
// NOTE: Other PrimeNG modules (Card, Listbox, Tag, etc.) pull in the
// virtual scroller at compile time; the current PrimeNG/Angular pair
// has a known bug where the scroller's ChangeDetectionStrategy.Eager
// trips the Angular optimizer. Stick to the modules already proven by
// the existing dock-editor-angular and registry-editor-angular
// components (Button, InputText, ToggleSwitch, Tooltip) until that's
// resolved upstream. The visual primitives (cards, tags) are emulated
// inline with CSS classes that consume the design-system tokens.
import { DockEditorService } from '../dock-editor/dock-editor.service';
import {
  loadRegistryConfig,
  ACTION_LAUNCH_COMPONENT,
  type RegistryEntry,
  type DockButtonConfig,
  type DockDropdownButtonConfig,
} from '@marketsui/openfin-platform';

interface ComponentRow {
  entry: RegistryEntry;
  inDock: boolean;
}

@Component({
  selector: 'mkt-workspace-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule],
  template: `
    <div class="ws-shell">
      <!-- Top bar -->
      <header class="ws-topbar">
        <span class="ws-title">Workspace Setup</span>
        <span class="ws-subtitle">Angular preview · feature parity in progress</span>
      </header>

      <!-- 3-pane body -->
      <div class="ws-body">
        <!-- Pane ① COMPONENTS -->
        <section class="ws-pane ws-components">
          <header class="ws-pane-header">
            <div class="ws-pane-title">① COMPONENTS</div>
            <div class="ws-pane-subtitle">global · all users</div>
          </header>
          <div class="ws-pane-body">
            @if (rows().length === 0) {
              <p class="ws-empty">
                No components in the registry. Add some via the standalone
                Component Registry editor while the Angular twin's CRUD
                ships in subsequent commits.
              </p>
            }
            @for (row of rows(); track row.entry.id) {
              <button
                type="button"
                class="ws-component-row"
                [class.ws-selected]="selectedEntryId() === row.entry.id"
                (click)="selectComponent(row.entry.id)"
              >
                <div class="ws-component-row-content">
                  <div class="ws-component-row-title">
                    @if (row.entry.singleton) { <span title="Singleton">⭐</span> }
                    @if (row.entry.type === 'external') { <span title="External">🌐</span> }
                    {{ row.entry.displayName || '(unnamed)' }}
                  </div>
                  <div class="ws-component-row-meta">
                    {{ row.entry.componentType || '—' }} / {{ row.entry.componentSubType || '—' }}
                  </div>
                  <span
                    class="ws-tag"
                    [class.ws-tag-success]="row.inDock"
                    [class.ws-tag-warn]="!row.inDock"
                  >
                    {{ row.inDock ? '✓ in dock' : '⚠ not in dock' }}
                  </span>
                </div>
              </button>
            }
          </div>
        </section>

        <!-- Pane ② DOCK LAYOUT -->
        <section class="ws-pane ws-dock">
          <header class="ws-pane-header">
            <div class="ws-pane-title">② DOCK LAYOUT  →</div>
            <div class="ws-pane-subtitle">personal · per user</div>
          </header>
          <div class="ws-pane-body">
            @if (dockButtons().length === 0) {
              <p class="ws-empty">
                Your dock has no buttons yet. (Drag-from-catalog and
                reorder controls land in a subsequent commit.)
              </p>
            }
            @for (btn of dockButtons(); track btn.id) {
              <div class="ws-dock-button-card">
                <div class="ws-dock-button-content">
                  <strong>{{ btn.tooltip }}</strong>
                  @if (btn.type === 'DropdownButton') {
                    <span class="ws-tag ws-tag-info">dropdown</span>
                  }
                </div>
              </div>
            }
          </div>
        </section>

        <!-- Pane ③ INSPECTOR -->
        <section class="ws-pane ws-inspector">
          <header class="ws-pane-header">
            <div class="ws-pane-title">③ INSPECTOR / TEST</div>
            <div class="ws-pane-subtitle">summary · selected item</div>
          </header>
          <div class="ws-pane-body">
            @if (selectedEntry(); as entry) {
              <div class="ws-card">
                <div class="ws-card-header">{{ entry.displayName || '(unnamed)' }}</div>
                <dl class="ws-inspector-grid">
                  <dt>Type</dt><dd>{{ entry.componentType || '—' }}</dd>
                  <dt>SubType</dt><dd>{{ entry.componentSubType || '—' }}</dd>
                  <dt>Host URL</dt><dd class="ws-mono">{{ entry.hostUrl || '—' }}</dd>
                  <dt>Singleton</dt><dd>{{ entry.singleton ? 'yes' : 'no' }}</dd>
                  <dt>External</dt><dd>{{ entry.type === 'external' ? 'yes' : 'no' }}</dd>
                </dl>
              </div>
            } @else {
              <div class="ws-card">
                <div class="ws-card-header">Workspace summary</div>
                <dl class="ws-inspector-grid">
                  <dt>Components</dt><dd>{{ summary().totalComponents }}</dd>
                  <dt>In your dock</dt><dd>{{ summary().inDock }}</dd>
                  <dt>Singletons</dt><dd>{{ summary().singletons }}</dd>
                  <dt>Dock buttons</dt><dd>{{ summary().dockButtons }}</dd>
                </dl>
                <p class="ws-empty">
                  Select a component on the left to see its details.
                </p>
              </div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; width: 100vw; background: var(--bn-bg); color: var(--bn-t0); }
    .ws-shell { display: flex; flex-direction: column; height: 100%; }
    .ws-topbar {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--bn-border);
    }
    .ws-title { font-size: 14px; font-weight: 600; }
    .ws-subtitle { font-size: 11px; color: var(--bn-t2); }
    .ws-body { flex: 1; display: grid; grid-template-columns: 320px 1fr 360px; min-height: 0; }
    .ws-pane { display: flex; flex-direction: column; border-right: 1px solid var(--bn-border); }
    .ws-pane:last-child { border-right: none; }
    .ws-pane-header {
      padding: 8px 12px;
      border-bottom: 1px solid var(--bn-border);
    }
    .ws-pane-title { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--bn-t1); }
    .ws-pane-subtitle { font-size: 10px; color: var(--bn-t2); }
    .ws-pane-body { flex: 1; overflow: auto; padding: 12px; }
    .ws-empty { font-size: 12px; color: var(--bn-t2); padding: 16px 0; text-align: center; }
    .ws-component-row {
      width: 100%; text-align: left; margin-bottom: 4px;
      padding: 8px 10px;
      background: var(--bn-bg2); color: var(--bn-t0);
      border: 1px solid var(--bn-border); border-radius: 6px;
      cursor: pointer;
    }
    .ws-component-row:hover { background: var(--bn-bg3); }
    .ws-component-row.ws-selected {
      border-left: 2px solid var(--bn-accent, #14b8a6);
      background: var(--bn-bg3);
    }
    .ws-component-row-content { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
    .ws-component-row-title { font-size: 12px; font-weight: 500; }
    .ws-component-row-meta { font-size: 10px; color: var(--bn-t2); }
    .ws-dock-button-card {
      background: var(--bn-bg2); border: 1px solid var(--bn-border);
      border-radius: 6px; padding: 8px 10px; margin-bottom: 8px;
    }
    .ws-dock-button-content { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .ws-card {
      background: var(--bn-bg2); border: 1px solid var(--bn-border);
      border-radius: 6px; padding: 12px;
    }
    .ws-card-header {
      font-size: 13px; font-weight: 600;
      margin-bottom: 8px; padding-bottom: 8px;
      border-bottom: 1px solid var(--bn-border);
    }
    .ws-inspector-grid {
      display: grid; grid-template-columns: 90px 1fr; gap: 4px 8px;
      font-size: 12px; margin: 0;
    }
    .ws-inspector-grid dt { color: var(--bn-t2); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; align-self: center; }
    .ws-inspector-grid dd { margin: 0; color: var(--bn-t0); }
    .ws-mono { font-family: 'JetBrains Mono', monospace; font-size: 10px; word-break: break-all; }
    .ws-tag {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
      background: var(--bn-bg3);
      color: var(--bn-t1);
    }
    .ws-tag-success { background: var(--bn-success, #14b8a6); color: var(--bn-bg); }
    .ws-tag-warn { background: var(--bn-warn, #f59e0b); color: var(--bn-bg); }
    .ws-tag-info { background: var(--bn-info, #3b82f6); color: var(--bn-bg); }
  `],
})
export class WorkspaceSetupComponent implements OnInit {
  private readonly dockSvc = inject(DockEditorService);

  // Registry state — loaded once on init. Subsequent commits will
  // wrap this in a RegistryService that mirrors the React useRegistryEditor
  // hook's reducer, IAB subscription, and dispatch surface.
  readonly entries = signal<RegistryEntry[]>([]);
  readonly selectedEntryId = signal<string | null>(null);

  readonly dockButtons = computed<DockButtonConfig[]>(() => this.dockSvc.buttons());

  readonly inDockEntryIds = computed<Set<string>>(() => {
    const set = new Set<string>();
    const visit = (item: { actionId?: string; customData?: unknown; options?: unknown[] }) => {
      if (item.actionId === ACTION_LAUNCH_COMPONENT) {
        const cd = (item.customData ?? {}) as { registryEntryId?: string };
        if (cd.registryEntryId) set.add(cd.registryEntryId);
      }
      const opts = (item.options ?? []) as Array<typeof item>;
      for (const sub of opts) visit(sub);
    };
    for (const btn of this.dockButtons()) {
      visit(btn as never);
      if (btn.type === 'DropdownButton') {
        for (const opt of ((btn as DockDropdownButtonConfig).options ?? [])) visit(opt as never);
      }
    }
    return set;
  });

  readonly rows = computed<ComponentRow[]>(() =>
    this.entries().map((entry) => ({ entry, inDock: this.inDockEntryIds().has(entry.id) })),
  );

  readonly selectedEntry = computed<RegistryEntry | null>(() => {
    const id = this.selectedEntryId();
    if (!id) return null;
    return this.entries().find((e) => e.id === id) ?? null;
  });

  readonly summary = computed(() => ({
    totalComponents: this.entries().length,
    inDock: this.inDockEntryIds().size,
    singletons: this.entries().filter((e) => e.singleton).length,
    dockButtons: this.dockButtons().length,
  }));

  // Effect that suppresses the "unused import" lint by depending on the
  // signal — not strictly necessary in Angular but documents the
  // reactive flow.
  private readonly _readEffect = effect(() => {
    void this.dockButtons();
  });

  async ngOnInit(): Promise<void> {
    try {
      const config = await loadRegistryConfig();
      this.entries.set(config?.entries ?? []);
    } catch (err) {
      console.error('[workspace-setup] failed to load registry:', err);
    }
  }

  selectComponent(id: string): void {
    this.selectedEntryId.set(id === this.selectedEntryId() ? null : id);
  }
}
