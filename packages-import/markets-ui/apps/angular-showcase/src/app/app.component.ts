import { Component, ChangeDetectionStrategy, signal, DOCUMENT, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  template: `
    <!-- Header nav shell -->
    <header class="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div class="flex items-center gap-8">
          <h1 class="text-lg font-semibold tracking-tight">MarketsUI</h1>
          <nav class="flex items-center gap-6">
            <a routerLink="/" routerLinkActive="nav-active" [routerLinkActiveOptions]="{ exact: true }"
              class="nav-link">Dashboard</a>
            <a routerLink="/design-system" routerLinkActive="nav-active"
              class="nav-link">Design System</a>
          </nav>
        </div>
        <button pButton [text]="true" [rounded]="true"
          [icon]="isDark() ? 'pi pi-sun' : 'pi pi-moon'"
          (click)="toggleTheme()" class="!text-foreground"></button>
      </div>
    </header>

    <!-- Routed content -->
    <main class="mx-auto max-w-7xl px-6 py-8">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }

    .nav-link {
      font-size: 14px;
      font-weight: 500;
      color: hsl(var(--muted-foreground));
      text-decoration: none;
      transition: color 0.15s;
    }
    .nav-link:hover {
      color: hsl(var(--foreground));
    }
    .nav-active {
      color: hsl(var(--foreground));
    }
  `],
})
export class AppComponent {
  private document = inject(DOCUMENT);
  isDark = signal(true);

  toggleTheme(): void {
    const dark = this.document.documentElement.classList.toggle('dark');
    this.isDark.set(dark);
  }
}
