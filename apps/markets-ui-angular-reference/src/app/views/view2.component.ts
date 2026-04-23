/**
 * View2Component — sample view that listens for FDC3 context.
 * Angular equivalent of the React View2.
 */

import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-view2',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col gap-4 p-4">
      <h1 class="text-lg font-bold">Angular View 2</h1>
      <p class="text-sm text-muted-foreground">
        Listening for FDC3 context broadcasts from other views.
      </p>
      <div
        class="p-3 rounded border text-sm font-mono"
        style="background: hsl(var(--card)); border-color: hsl(var(--border));"
      >
        {{ lastContext() || 'No context received yet.' }}
      </div>
    </div>
  `,
})
export class View2Component implements OnInit, OnDestroy {
  protected readonly lastContext = signal('');
  private listener: any;

  async ngOnInit(): Promise<void> {
    try {
      const fdc3 = (window as any).fdc3;
      if (fdc3) {
        this.listener = await fdc3.addContextListener(null, (ctx: any) => {
          this.lastContext.set(JSON.stringify(ctx, null, 2));
        });
      }
    } catch (err) {
      console.error('FDC3 listener failed:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.listener?.unsubscribe) {
      this.listener.unsubscribe();
    }
  }
}
