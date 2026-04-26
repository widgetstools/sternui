/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * HostedComponent (Angular) — generic wrapper that hosts any component
 * the Angular reference app exposes via a route, regardless of whether
 * the inner component reads/writes the host's ConfigService (internal)
 * or fetches its own state from elsewhere (external).
 *
 * Mirrors `apps/markets-ui-react-reference/src/components/HostedComponent.tsx`
 * — see that file's docstring + the root README for the full spec.
 *
 * What it provides:
 *   • Auto-hide debug overlay (8px hover strip at top → header slides
 *     down on hover, hides 250ms after mouseleave) with chips for
 *     path / instanceId / appId / user.
 *   • Identity resolution: OpenFin customData → URL `?instanceId=` →
 *     supplied `defaultInstanceId`.
 *   • Document-title management restored on destroy.
 *   • A component-scoped `HostedComponentService` that inner components
 *     project via `<ng-content>` can inject to read the resolved values.
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HostedComponentService } from './hosted-component.service';

const DEFAULT_APP_ID = 'TestApp';
const DEFAULT_USER_ID = 'dev1';

@Component({
  selector: 'app-hosted-component',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  // Component-scoped provider — every `<app-hosted-component>` instance
  // gets its own HostedComponentService, isolated from siblings.
  providers: [HostedComponentService],
  template: `
    <!-- Hover strip — invisible 8px row at the top edge. Mouse enters
         here → debug overlay slides down. Sits above grid chrome but
         below the expanded header. -->
    <div
      class="hc-hover-strip"
      (mouseenter)="showHeader()"
      aria-hidden="true"
    ></div>

    <!-- Debug overlay — slides down from the top, NEVER pushes content.
         The hosted child below keeps its full height. -->
    <header
      class="hc-debug"
      [class.hc-debug--visible]="debugVisible()"
      (mouseenter)="showHeader()"
      (mouseleave)="scheduleHide()"
    >
      <div class="hc-debug-row">
        <span class="hc-title">{{ componentName }}</span>
        <span class="hc-sep">·</span>
        <span class="hc-chip">
          <span class="hc-chip-label">path</span>
          <span class="hc-chip-value hc-mono">{{ resolvedPath }}</span>
        </span>
        <span class="hc-chip">
          <span class="hc-chip-label">instanceId</span>
          <span class="hc-chip-value hc-mono hc-truncate" [title]="host.instanceId() ?? ''">
            {{ host.instanceId() ?? '…' }}
          </span>
        </span>
        <span class="hc-chip">
          <span class="hc-chip-label">appId</span>
          <span class="hc-chip-value">{{ host.appId() }}</span>
        </span>
        <span class="hc-chip">
          <span class="hc-chip-label">user</span>
          <span class="hc-chip-value">{{ host.userId() }}</span>
        </span>
      </div>
    </header>

    <!-- Hosted content — projected via ng-content, takes the full
         container; the debug overlay floats above without displacing. -->
    <div class="hc-body">
      <ng-content />
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: var(--bn-bg);
      color: var(--bn-t0);
      overflow: hidden;
    }
    .hc-hover-strip {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 8px;
      z-index: 10;
    }
    .hc-debug {
      position: absolute;
      top: 0; left: 0; right: 0;
      z-index: 20;
      padding: 10px 16px;
      background: color-mix(in srgb, var(--bn-bg1, #161a1e) 92%, transparent);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--bn-border, #313944);
      transform: translateY(-100%);
      opacity: 0;
      pointer-events: none;
      transition: transform 160ms ease-out, opacity 160ms ease-out, box-shadow 160ms ease-out;
    }
    .hc-debug--visible {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    }
    .hc-debug-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .hc-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--bn-t0);
      letter-spacing: 0.2px;
    }
    .hc-sep {
      color: var(--bn-t3, #5a6472);
      font-size: 12px;
    }
    .hc-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      background: var(--bn-bg2, #1e2329);
      border: 1px solid var(--bn-border, #313944);
      border-radius: 4px;
    }
    .hc-chip-label {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--bn-t3, #5a6472);
    }
    .hc-chip-value {
      font-size: 12px;
      color: var(--bn-t0, #eaecef);
      white-space: nowrap;
    }
    .hc-mono {
      font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
    }
    .hc-truncate {
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hc-body {
      flex: 1;
      min-height: 0;
      position: relative;
    }
  `],
})
export class HostedComponentComponent implements OnInit, OnDestroy {
  /** Logical name shown in the debug overlay's title. */
  @Input({ required: true }) componentName!: string;
  /** Default instanceId used when neither OpenFin customData nor the
   *  URL `?instanceId=` query param resolves one. */
  @Input({ required: true }) defaultInstanceId!: string;
  /** Override the path label shown in the debug chip. */
  @Input() pathLabel?: string;
  /** Override the document title while this component is mounted. */
  @Input() documentTitle?: string;

  // Same service the wrapper provides — exposes the resolved identity
  // signals to the template and to inner projected components.
  readonly host = inject(HostedComponentService);

  readonly debugVisible = signal(false);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private prevTitle = '';
  resolvedPath = '';

  async ngOnInit(): Promise<void> {
    this.resolvedPath = this.pathLabel
      ?? (typeof window !== 'undefined' ? window.location.pathname : '');

    // Document title
    this.prevTitle = document.title;
    document.title = this.documentTitle ?? this.componentName;

    // Identity resolution — OpenFin customData wins, then URL param,
    // then the supplied default.
    try {
      const [instanceId, appId, userId] = await Promise.all([
        resolveHostInstanceId(this.defaultInstanceId),
        resolveAppId(DEFAULT_APP_ID),
        resolveUserId(DEFAULT_USER_ID),
      ]);
      this.host.instanceId.set(instanceId);
      this.host.appId.set(appId);
      this.host.userId.set(userId);
    } catch (err) {
      console.error('[HostedComponent] identity resolution failed:', err);
      this.host.instanceId.set(this.defaultInstanceId);
    }
  }

  ngOnDestroy(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    document.title = this.prevTitle;
  }

  showHeader(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.debugVisible.set(true);
  }

  scheduleHide(): void {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.debugVisible.set(false);
      this.hideTimer = null;
    }, 250);
  }
}

// ─── Identity resolution helpers ─────────────────────────────────────

async function resolveHostInstanceId(defaultId: string): Promise<string> {
  if (typeof fin !== 'undefined') {
    try {
      const options = await fin.me.getOptions();
      const id = (options as { customData?: { instanceId?: string } })?.customData?.instanceId;
      if (typeof id === 'string' && id.length > 0) return id;
    } catch { /* fall through */ }
  }
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('instanceId');
    if (fromUrl && fromUrl.length > 0) return fromUrl;
  } catch { /* fall through */ }
  return defaultId;
}

async function resolveAppId(fallback: string): Promise<string> {
  if (typeof fin !== 'undefined') {
    try {
      const options = await fin.me.getOptions();
      const id = (options as { customData?: { appId?: string } })?.customData?.appId;
      if (typeof id === 'string' && id.length > 0) return id;
    } catch { /* fall through */ }
  }
  return fallback;
}

async function resolveUserId(fallback: string): Promise<string> {
  if (typeof fin !== 'undefined') {
    try {
      const options = await fin.me.getOptions();
      const id = (options as { customData?: { userId?: string } })?.customData?.userId;
      if (typeof id === 'string' && id.length > 0) return id;
    } catch { /* fall through */ }
  }
  return fallback;
}
