import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ECON_EVENTS } from '../services/trading-data.service';

@Component({
  selector: 'econ-calendar-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--bn-bg1);overflow:hidden"
    >
      <div style="flex:1;overflow-y:auto">
        <div
          *ngFor="let e of events"
          style="display:flex;align-items:flex-start;gap:8px;padding:7px 14px;border-bottom:1px solid rgba(43,49,57,0.5)"
        >
          <span
            style="font-size:9px;color:var(--bn-t2);font-family:JetBrains Mono,monospace;flex-shrink:0;width:36px"
            >{{ e.time }}</span
          >
          <div style="flex:1">
            <div style="font-size:11px;color:var(--bn-t0);font-family:JetBrains Mono,monospace">
              {{ e.event }}
            </div>
            <div style="display:flex;gap:8px;margin-top:2px">
              <span style="font-size:9px;color:var(--bn-t2);font-family:JetBrains Mono,monospace"
                >Act: <span style="color:var(--bn-green)">{{ e.actual }}</span></span
              >
              <span style="font-size:9px;color:var(--bn-t2);font-family:JetBrains Mono,monospace"
                >Exp: <span style="color:var(--bn-t1)">{{ e.exp }}</span></span
              >
              <span style="font-size:9px;color:var(--bn-t2);font-family:JetBrains Mono,monospace"
                >Prev: <span style="color:var(--bn-t1)">{{ e.prev }}</span></span
              >
            </div>
          </div>
          <span
            style="font-size:9px;font-family:JetBrains Mono,monospace;padding:1px 5px;border-radius:2px;flex-shrink:0"
            [style.background]="impactBg(e.impact)"
            [style.color]="impactColor(e.impact)"
            [style.border]="'1px solid ' + impactBorder(e.impact)"
            >{{ e.impact }}</span
          >
        </div>
      </div>
    </div>
  `,
})
export class EconCalendarWidget {
  @Input() api: any;
  @Input() panel: any;
  events = ECON_EVENTS;
  impactColor(i: string) {
    return i === 'High' ? 'var(--bn-red)' : i === 'Med' ? '#c97b3f' : 'var(--bn-green)';
  }
  impactBg(i: string) {
    return this.impactColor(i) + '20';
  }
  impactBorder(i: string) {
    return this.impactColor(i) + '40';
  }
}
