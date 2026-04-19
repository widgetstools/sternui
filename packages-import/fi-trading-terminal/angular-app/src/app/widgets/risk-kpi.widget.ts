import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'risk-kpi-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);height:100%;overflow:hidden">
      <div
        *ngFor="let k of kpis; let i = index"
        style="background:var(--bn-bg1);padding:10px 14px;display:flex;flex-direction:column;justify-content:center"
        [style.borderRight]="i < 5 ? '1px solid var(--bn-border)' : 'none'"
      >
        <div
          style="font-size:11px;color:var(--bn-t1);margin-bottom:3px;text-transform:uppercase;letter-spacing:0.05em"
        >
          {{ k.label }}
        </div>
        <div
          style="font-size:18px;font-weight:600;font-family:JetBrains Mono,monospace"
          [style.color]="k.color"
        >
          {{ k.val }}
        </div>
        <div
          style="font-size:9px;color:var(--bn-t2);margin-top:2px;font-family:JetBrains Mono,monospace"
        >
          {{ k.sub }}
        </div>
      </div>
    </div>
  `,
})
export class RiskKpiWidget {
  @Input() api: any;
  @Input() panel: any;
  kpis = [
    { label: 'Portfolio DV01', val: '$18,420', sub: 'per bp', color: '#6ba4e8' },
    { label: 'Total MV', val: '$54.2M', sub: 'MTD +$1.4M', color: '#6ba4e8' },
    { label: 'VaR 95% 1D', val: '-$248K', sub: 'within limit', color: '#c97b3f' },
    { label: 'OAS Duration', val: '4.82 yrs', sub: 'mod duration', color: '#7db4e3' },
    { label: 'Spread PnL MTD', val: '+$142K', sub: 'vs bench +38K', color: 'var(--bn-green)' },
    { label: 'Credit Delta', val: '$8,240', sub: 'IG/HY blended', color: '#a48ad4' },
  ];
}
