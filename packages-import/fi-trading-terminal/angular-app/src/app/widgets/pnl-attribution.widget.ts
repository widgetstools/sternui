import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIChart } from 'primeng/chart';
import { PNL_DATA } from '../services/trading-data.service';

const pnlTotal = PNL_DATA.reduce((a, d) => a + d.pnl, 0);
const chartItems = [
  ...PNL_DATA.map((d) => ({ attr: d.attr, pnl: d.pnl })),
  { attr: 'Total', pnl: pnlTotal },
];

@Component({
  selector: 'pnl-attribution-widget',
  standalone: true,
  imports: [CommonModule, UIChart],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div
      style="display:flex;flex-direction:column;height:100%;background:var(--bn-bg1);overflow:hidden"
    >
      <div style="flex:1;padding:8px 6px 0">
        <p-chart
          type="bar"
          [data]="chartData"
          [options]="chartOptions"
          width="100%"
          height="100%"
        />
      </div>
      <div
        style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-top:1px solid var(--bn-border);flex-shrink:0"
      >
        <span style="font-size:9px;color:var(--bn-t1)">NET P&L MTD</span>
        <span class="font-mono-fi font-bold" style="font-size:18px;color:#6ba4e8">{{
          netPnlLabel
        }}</span>
      </div>
    </div>
  `,
})
export class PnlAttributionWidget implements OnInit {
  @Input() api: any;
  @Input() panel: any;
  netPnlLabel = `+$${pnlTotal}K`;

  chartData: any = {};
  chartOptions: any = {};

  ngOnInit() {
    const colors = chartItems.map((d) => {
      if (d.attr === 'Total') return d.pnl >= 0 ? '#3dbfa0' : '#e56464';
      return d.pnl >= 0 ? 'rgba(107,164,232,0.75)' : 'rgba(229,100,100,0.75)';
    });

    this.chartData = {
      labels: chartItems.map((d) => d.attr),
      datasets: [
        {
          label: 'P&L ($K)',
          data: chartItems.map((d) => d.pnl),
          backgroundColor: colors,
          borderRadius: 3,
          barPercentage: 0.6,
        },
      ],
    };

    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(30,35,45,0.95)',
          titleFont: { size: 11, family: 'JetBrains Mono,monospace' },
          bodyFont: { size: 11, family: 'JetBrains Mono,monospace' },
          padding: 8,
          cornerRadius: 3,
          callbacks: {
            label: (ctx: any) => ` ${ctx.raw >= 0 ? '+' : ''}$${ctx.raw}K`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#8a8f98', font: { size: 9, family: 'JetBrains Mono,monospace' } },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: '#8a8f98',
            font: { size: 9, family: 'JetBrains Mono,monospace' },
            callback: (v: number) => `${v > 0 ? '+' : ''}$${v}K`,
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
      },
    };
  }
}
