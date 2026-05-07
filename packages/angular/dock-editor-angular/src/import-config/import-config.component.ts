/**
 * ImportConfigComponent
 *
 * Angular equivalent of the React ImportConfig component.
 * Hosted in a small OpenFin window at /import-config.
 * Lets the user upload a JSON config exported via "Export Config".
 */

import { Component, signal, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import {
  importConfigBundle,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_REGISTRY_CONFIG_UPDATE,
  type ImportConfigBundleResult,
} from '@starui/openfin-platform';

type ImportStatus = 'idle' | 'success' | 'error';

const isInOpenFin = typeof (window as any).fin !== 'undefined';

@Component({
  selector: 'mkt-import-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule],
  template: `
    <div data-dock-editor
      class="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8"
      style="background: var(--de-bg-deep); color: var(--de-text); font-family: var(--de-font);"
    >
      <!-- Icon -->
      <div
        class="w-14 h-14 flex items-center justify-center"
        style="background: var(--de-bg-surface); border: 1px solid var(--de-border-strong);
               border-radius: var(--de-radius-lg);"
      >
        <i class="pi pi-upload" style="font-size: 24px; color: var(--de-accent);"></i>
      </div>

      <!-- Title -->
      <div class="text-center">
        <h1 class="text-lg font-semibold m-0" style="color: var(--de-text);">Import Config</h1>
        <p class="m-0 mt-1" style="color: var(--de-text-secondary); font-size: 13px;">
          Select a previously exported config JSON file
        </p>
      </div>

      <!-- Drop zone — max-width 320px to match React -->
      <div
        class="w-full p-5 text-center cursor-pointer transition-all"
        [style.border]="'1.5px dashed ' + (fileName() ? 'var(--de-accent)' : 'var(--de-border-strong)')"
        [style.background]="fileName() ? 'var(--de-accent-dim)' : 'var(--de-bg-surface)'"
        style="border-radius: var(--de-radius-md); max-width: 320px;"
        (click)="fileInput.click()"
      >
        <span style="font-size: 13px;" [style.color]="fileName() ? 'var(--de-accent)' : 'var(--de-text-secondary)'">
          {{ fileName() ?? 'Click to select a .json file' }}
        </span>
      </div>
      <input
        #fileInput
        type="file"
        accept=".json"
        class="hidden"
        (change)="onFileChange($event)"
      />

      <!-- Status message -->
      <p
        *ngIf="message()"
        class="text-center m-0"
        style="font-size: 13px;"
        [style.color]="status() === 'success' ? 'var(--de-success)' : 'var(--de-danger)'"
      >
        {{ message() }}
      </p>

      <!-- Cancel -->
      <p-button
        label="Cancel"
        severity="secondary"
        (onClick)="close()"
      />
    </div>
  `,
})
export class ImportConfigComponent {
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status   = signal<ImportStatus>('idle');
  protected readonly fileName = signal<string | null>(null);
  protected readonly message  = signal('');

  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.closeTimer !== null) {
        clearTimeout(this.closeTimer);
      }
    });
  }

  protected async onFileChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.fileName.set(file.name);
    this.status.set('idle');
    this.message.set('');

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.appConfig || !Array.isArray(importData.appConfig)) {
        this.status.set('error');
        this.message.set('No config data found in this file. Make sure it is a valid config export.');
        return;
      }

      // Bulk-import every supported section. The helper re-owns appConfig
      // rows (rewrites appId/userId to the local host environment) so
      // workspaces, registries, and per-instance markets-grid-profile-set
      // rows — including the `gridLevelData` that carries data-provider
      // selection — become readable on this machine. userProfile rows are
      // intentionally excluded from auto-import.
      const result = await importConfigBundle(importData);

      if (result.totalImported === 0) {
        this.status.set('error');
        this.message.set('No importable rows found in this file.');
        return;
      }

      if (isInOpenFin) {
        const iab = (window as any).fin.InterApplicationBus;
        await iab.publish(IAB_RELOAD_AFTER_IMPORT, {});
        if (result.appConfig.imported > 0) {
          await iab.publish(IAB_REGISTRY_CONFIG_UPDATE, {});
        }
      }

      this.status.set('success');
      this.message.set(this.formatSuccessMessage(result));

      this.closeTimer = setTimeout(() => this.close(), 1500);
    } catch (err) {
      console.error('ImportConfigComponent: Import failed.', err);
      this.status.set('error');
      this.message.set('Failed to read the file. Make sure it is a valid config export.');
    }
  }

  protected close(): void {
    if (isInOpenFin) {
      (window as any).fin.Window.getCurrentSync().close();
    }
  }

  private formatSuccessMessage(r: ImportConfigBundleResult): string {
    const parts: string[] = [];
    if (r.appConfig.imported)   parts.push(`${r.appConfig.imported} config row${r.appConfig.imported === 1 ? '' : 's'}`);
    if (r.appRegistry.imported) parts.push(`${r.appRegistry.imported} app${r.appRegistry.imported === 1 ? '' : 's'}`);
    if (r.roles.imported)       parts.push(`${r.roles.imported} role${r.roles.imported === 1 ? '' : 's'}`);
    if (r.permissions.imported) parts.push(`${r.permissions.imported} permission${r.permissions.imported === 1 ? '' : 's'}`);
    const summary = parts.length > 0 ? `Imported ${parts.join(', ')}.` : 'Import complete.';
    return r.totalFailed > 0
      ? `${summary} ${r.totalFailed} row${r.totalFailed === 1 ? '' : 's'} failed — see console for details.`
      : summary;
  }
}
