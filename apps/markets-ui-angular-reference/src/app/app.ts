import { Component, OnDestroy, effect, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

type Theme = 'dark' | 'light';

// IAB topic published by @marketsui/openfin-platform when the dock's
// theme toggle fires. Value must match IAB_THEME_CHANGED in
// packages/openfin-platform/src/dock.ts. Kept as a string literal here
// so this component doesn't need to import the OpenFin package
// (which would fail in non-OpenFin contexts).
const IAB_THEME_CHANGED = 'theme-changed';

declare const fin: any;

/**
 * AppComponent — root shell. Owns the `[data-theme]` attribute on
 * `document.documentElement` and the `agThemeMode` dataset on `body`.
 *
 * When running inside OpenFin, subscribes to the `theme-changed` IAB
 * topic so every window (provider, views, editors) re-themes together
 * whenever the dock's theme toggle fires. Pattern is documented in
 * packages/design-system/README.md.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent implements OnDestroy {
  readonly theme = signal<Theme>(
    typeof localStorage !== 'undefined' && localStorage.getItem('theme') === 'light'
      ? 'light'
      : 'dark',
  );

  private iabHandler: ((data: { isDark?: boolean }) => void) | null = null;

  constructor() {
    effect(() => {
      const t = this.theme();
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', t);
        document.body.dataset['agThemeMode'] = t;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme', t);
      }
    });

    // Subscribe to the dock's theme-toggle IAB broadcast when running
    // under OpenFin. Outside OpenFin (`fin` undefined), this is a no-op.
    const finRef = (globalThis as any).fin;
    if (finRef?.InterApplicationBus && finRef?.me?.identity?.uuid) {
      this.iabHandler = (data: { isDark?: boolean }) => {
        this.theme.set(data?.isDark === false ? 'light' : 'dark');
      };
      finRef.InterApplicationBus.subscribe(
        { uuid: finRef.me.identity.uuid },
        IAB_THEME_CHANGED,
        this.iabHandler,
      ).catch((err: unknown) => console.warn('IAB theme subscription failed', err));
    }
  }

  toggleTheme(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  ngOnDestroy(): void {
    const finRef = (globalThis as any).fin;
    if (this.iabHandler && finRef?.InterApplicationBus && finRef?.me?.identity?.uuid) {
      finRef.InterApplicationBus.unsubscribe(
        { uuid: finRef.me.identity.uuid },
        IAB_THEME_CHANGED,
        this.iabHandler,
      ).catch(() => {
        /* ignore */
      });
      this.iabHandler = null;
    }
  }
}
