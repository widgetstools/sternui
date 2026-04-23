import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { OpenFinCustomEvents } from '@stern/openfin-platform';

export type Theme = 'light' | 'dark';

declare const fin: any;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _theme = new BehaviorSubject<Theme>('dark');
  readonly theme$: Observable<Theme> = this._theme.asObservable();

  get current(): Theme {
    return this._theme.value;
  }

  init(): void {
    // Apply initial theme from DOM (dock JS injection may have set it already)
    const root = document.documentElement;
    if (root.classList.contains('light')) {
      this.apply('light');
      return;
    }
    // Default: dark
    this.apply('dark');

    if (typeof window === 'undefined' || !(window as any).fin) return;

    // Sync from platform on startup
    import('@openfin/workspace-platform').then(({ getCurrentSync }) => {
      try {
        const platform = getCurrentSync();
        platform.Theme.getSelectedScheme().then((scheme: string) => {
          this.apply(scheme === 'light' ? 'light' : 'dark');
        }).catch(() => {});
      } catch { /* ignore */ }
    }).catch(() => {});

    // Listen for IAB theme change events from dock
    fin.InterApplicationBus.subscribe(
      { uuid: '*' },
      OpenFinCustomEvents.THEME_CHANGE,
      (message: { theme: Theme }) => {
        this.apply(message.theme);
      },
    ).catch(() => {});
  }

  apply(theme: Theme): void {
    this._theme.next(theme);
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.setAttribute('data-theme', theme);
    if (document.body) {
      document.body.dataset['agThemeMode'] = theme;
    }
  }

  toggle(): void {
    this.apply(this.current === 'dark' ? 'light' : 'dark');
  }
}
