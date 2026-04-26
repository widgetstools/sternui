/**
 * HostedComponentService — DI surface that the Angular `<app-hosted-component>`
 * wrapper provides at component-level scope so inner components can
 * read the resolved hosting context (instanceId, appId, userId) the
 * wrapper has computed.
 *
 * Usage (inner component):
 *
 * ```ts
 * @Component({ ... })
 * export class MyView {
 *   private host = inject(HostedComponentService);
 *
 *   readonly instanceId = this.host.instanceId;
 *   readonly appId = this.host.appId;
 *   // ...
 * }
 * ```
 *
 * The service is provided at the wrapper component level (not root),
 * so each `<app-hosted-component>` instance gets its own service
 * instance. Inner components projected via `<ng-content>` inject it
 * normally — Angular resolves up the injector tree and finds the
 * wrapper's provider before falling back to root.
 */

import { Injectable, signal, type WritableSignal } from '@angular/core';

@Injectable()
export class HostedComponentService {
  /** Per-instance identity. `null` while resolving on first mount. */
  readonly instanceId: WritableSignal<string | null> = signal(null);
  /** App identity used as part of the ConfigService scope key. */
  readonly appId: WritableSignal<string> = signal('TestApp');
  /** User identity used as part of the ConfigService scope key. */
  readonly userId: WritableSignal<string> = signal('dev1');
}
