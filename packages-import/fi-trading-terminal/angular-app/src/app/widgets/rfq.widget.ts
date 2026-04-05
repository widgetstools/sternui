import { Component, Input, OnInit, OnDestroy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedStateService } from '../services/shared-state.service';
import {
  BONDS,
  DEALERS,
  type Bond,
  type RfqRequest,
  type RfqQuote,
} from '../services/trading-data.service';

let rfqCounter = 1;
function makeQuote(bond: Bond, side: 'Buy' | 'Sell', dealer: string): RfqQuote {
  const spread = 0.04 + Math.random() * 0.08;
  const mid = (bond.bid + bond.ask) / 2;
  const bid = +(mid - spread / 2 + (Math.random() - 0.5) * 0.02).toFixed(3);
  const ask = +(mid + spread / 2 + (Math.random() - 0.5) * 0.02).toFixed(3);
  return {
    dealer,
    bid,
    ask,
    bidSize: `$${Math.floor(Math.random() * 8 + 2)}MM`,
    askSize: `$${Math.floor(Math.random() * 8 + 2)}MM`,
    ts: Date.now(),
    status: 'live',
  };
}

const RFQ_STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  live: { bg: 'rgba(61,158,255,0.1)', color: 'var(--fi-blue)', border: 'rgba(61,158,255,0.25)' },
  done: { bg: 'rgba(45,212,191,0.12)', color: 'var(--fi-green)', border: 'rgba(45,212,191,0.25)' },
  stale: { bg: 'rgba(74,82,117,0.2)', color: 'var(--fi-t2)', border: 'rgba(74,82,117,0.25)' },
};

@Component({
  selector: 'rfq-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%' },
  template: `
    <div style="display:flex;flex-direction:column;height:100%;background:var(--fi-bg1)">
      <!-- Live count toolbar -->
      <div
        style="display:flex;align-items:center;justify-content:flex-end;padding:0 12px;height:32px;border-bottom:1px solid var(--fi-border);flex-shrink:0"
      >
        <span
          class="font-mono-fi"
          style="font-size:9px;padding:1px 6px;border-radius:2px;background:rgba(61,158,255,0.08);color:var(--fi-blue);border:1px solid rgba(61,158,255,0.2)"
          >{{ liveCount }} live</span
        >
      </div>
      <div style="display:flex;flex:1;overflow:hidden;gap:1px;background:var(--fi-border)">
        <!-- Left: RFQ ticket -->
        <div
          style="display:flex;flex-direction:column;flex-shrink:0;width:220px;background:var(--fi-bg2)"
        >
          <div
            style="display:flex;align-items:center;padding:0 12px;height:28px;border-bottom:1px solid var(--fi-border)"
          >
            <span class="col-hdr">New RFQ</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;padding:12px">
            <!-- Instrument -->
            <div>
              <div class="col-hdr" style="margin-bottom:4px">Instrument</div>
              <div
                *ngIf="activeBond && !instrOpen"
                (click)="instrOpen = true"
                class="font-mono-fi"
                style="font-size:11px;padding:6px 8px;border-radius:2px;border:1px solid var(--fi-border2);background:var(--fi-bg3);color:var(--fi-cyan);cursor:pointer;display:flex;align-items:center;justify-content:space-between"
              >
                <span>{{ activeBond.ticker }} {{ activeBond.cpn }} {{ activeBond.mat }}</span>
              </div>
              <div *ngIf="!activeBond || instrOpen" style="position:relative">
                <input
                  [(ngModel)]="instrSearch"
                  (focus)="instrOpen = true"
                  placeholder="CUSIP, ticker, issuer..."
                  class="font-mono-fi"
                  style="font-size:11px;width:100%;padding:6px 8px;border-radius:2px;border:1px solid var(--fi-blue);background:var(--fi-bg3);color:var(--fi-t0);outline:none;box-sizing:border-box"
                />
              </div>
              <div
                *ngIf="instrOpen && instrResults.length > 0"
                style="position:relative;z-index:50;border-radius:2px;border:1px solid var(--fi-border2);background:var(--fi-bg2);max-height:200px;overflow-y:auto;margin-top:2px"
              >
                <div
                  *ngFor="let b of instrResults"
                  (click)="pickBond(b)"
                  style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--fi-border);font-size:9px;font-family:JetBrains Mono,monospace"
                  (mouseenter)="
                    $event.currentTarget &&
                      ($any($event.currentTarget).style.background = 'var(--fi-bg3)')
                  "
                  (mouseleave)="
                    $event.currentTarget &&
                      ($any($event.currentTarget).style.background = 'transparent')
                  "
                >
                  <div>
                    <span style="color:var(--fi-cyan);font-weight:700">{{ b.ticker }}</span>
                    <span style="color:var(--fi-t1);margin-left:4px">{{ b.cpn }} {{ b.mat }}</span>
                  </div>
                  <span style="color:var(--fi-t2)">{{ b.cusip }}</span>
                </div>
              </div>
            </div>
            <!-- Bid/Ask display -->
            <div
              *ngIf="activeBond && !instrOpen"
              style="display:grid;grid-template-columns:1fr 1fr;gap:4px"
            >
              <div
                class="font-mono-fi"
                style="font-size:9px;padding:4px 8px;border-radius:2px;background:var(--fi-bg3);color:var(--fi-blue);text-align:right"
              >
                Bid: {{ activeBond.bid.toFixed(3) }}
              </div>
              <div
                class="font-mono-fi"
                style="font-size:9px;padding:4px 8px;border-radius:2px;background:var(--fi-bg3);color:var(--fi-red);text-align:right"
              >
                Ask: {{ activeBond.ask.toFixed(3) }}
              </div>
            </div>
            <!-- Side -->
            <div>
              <div class="col-hdr" style="margin-bottom:4px">Side</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
                <button
                  *ngFor="let s of ['Buy', 'Sell']"
                  (click)="rfqSide = $any(s)"
                  class="font-mono-fi font-bold"
                  style="padding:6px;border-radius:2px;font-size:11px;letter-spacing:0.04em;cursor:pointer"
                  [style.background]="
                    rfqSide === s
                      ? s === 'Buy'
                        ? 'rgba(0,229,160,0.15)'
                        : 'rgba(255,61,94,0.15)'
                      : 'transparent'
                  "
                  [style.border]="
                    '1px solid ' +
                    (rfqSide === s
                      ? s === 'Buy'
                        ? 'rgba(0,229,160,0.4)'
                        : 'rgba(255,61,94,0.4)'
                      : 'var(--fi-border2)')
                  "
                  [style.color]="
                    rfqSide === s
                      ? s === 'Buy'
                        ? 'var(--fi-green)'
                        : 'var(--fi-red)'
                      : 'var(--fi-t2)'
                  "
                >
                  {{ $any(s).toUpperCase() }}
                </button>
              </div>
            </div>
            <!-- Size -->
            <div>
              <div class="col-hdr" style="margin-bottom:4px">Size (MM)</div>
              <div
                style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:4px"
              >
                <button
                  *ngFor="let v of ['2', '5', '10', '15']"
                  (click)="rfqSize = v"
                  class="font-mono-fi"
                  style="padding:4px;border-radius:2px;font-size:9px;cursor:pointer"
                  [style.background]="rfqSize === v ? 'rgba(61,158,255,0.12)' : 'var(--fi-bg3)'"
                  [style.border]="
                    '1px solid ' + (rfqSize === v ? 'var(--fi-blue)' : 'var(--fi-border2)')
                  "
                  [style.color]="rfqSize === v ? 'var(--fi-blue)' : 'var(--fi-t1)'"
                >
                  {{ v }}
                </button>
              </div>
              <input
                type="number"
                [(ngModel)]="rfqSize"
                class="font-mono-fi"
                style="font-size:11px;width:100%;padding:6px 8px;border-radius:2px;border:1px solid var(--fi-border2);background:var(--fi-bg3);color:var(--fi-t0);outline:none;box-sizing:border-box"
              />
            </div>
            <!-- Dealers -->
            <div>
              <div class="col-hdr" style="margin-bottom:4px">Dealers (all)</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                <span
                  *ngFor="let d of dealers"
                  class="font-mono-fi"
                  style="font-size:9px;padding:2px 6px;border-radius:2px;background:rgba(61,158,255,0.08);color:var(--fi-blue);border:1px solid rgba(61,158,255,0.2)"
                  >{{ d }}</span
                >
              </div>
            </div>
            <!-- Send -->
            <button
              (click)="sendRfq()"
              [disabled]="!activeBond"
              class="font-mono-fi font-bold"
              style="width:100%;padding:8px;border-radius:2px;font-size:11px;letter-spacing:0.06em;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px;border:none;cursor:pointer"
              [style.background]="activeBond ? 'var(--fi-blue)' : 'var(--fi-bg3)'"
              [style.color]="activeBond ? 'var(--bn-cta-text)' : 'var(--fi-t3)'"
            >
              SEND RFQ
            </button>
          </div>
          <!-- RFQ history -->
          <div style="border-top:1px solid var(--fi-border);flex:1;overflow-y:auto">
            <div
              style="display:flex;align-items:center;padding:0 12px;height:28px;border-bottom:1px solid var(--fi-border)"
            >
              <span class="col-hdr">RFQ History</span>
            </div>
            <div
              *ngFor="let r of requests"
              (click)="activeId = r.id"
              style="padding:8px 12px;border-bottom:1px solid var(--fi-border);cursor:pointer"
              [style.background]="activeId === r.id ? 'var(--fi-bg3)' : 'transparent'"
            >
              <div
                style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px"
              >
                <span class="font-mono-fi font-bold" style="font-size:9px;color:var(--fi-cyan)">{{
                  r.id
                }}</span>
                <span
                  class="font-mono-fi"
                  style="font-size:9px;padding:1px 6px;border-radius:2px"
                  [style.background]="statusBg(r.status)"
                  [style.color]="statusColor(r.status)"
                  [style.border]="'1px solid ' + statusBorder(r.status)"
                  >{{ r.status.toUpperCase() }}</span
                >
              </div>
              <div class="font-mono-fi" style="font-size:9px;color:var(--fi-t1)">{{ r.bond }}</div>
              <div class="font-mono-fi" style="font-size:9px;color:var(--fi-t2)">
                {{ r.side }} - {{ r.size }} - {{ r.quotes.length }} quotes
              </div>
            </div>
          </div>
        </div>
        <!-- Right: Quote ladder -->
        <div
          style="display:flex;flex-direction:column;flex:1;overflow:hidden;background:var(--fi-bg1)"
        >
          <ng-container *ngIf="activeReq">
            <!-- Active RFQ header -->
            <div
              style="display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:32px;border-bottom:1px solid var(--fi-border);flex-shrink:0"
            >
              <div style="display:flex;align-items:center;gap:12px">
                <span class="ph-title">{{ activeReq.id }}</span>
                <span class="font-mono-fi font-bold" style="font-size:11px;color:var(--fi-cyan)">{{
                  activeReq.bond
                }}</span>
                <span
                  class="font-mono-fi font-bold"
                  style="font-size:11px"
                  [style.color]="activeReq.side === 'Buy' ? 'var(--fi-green)' : 'var(--fi-red)'"
                  >{{ activeReq.side.toUpperCase() }}</span
                >
                <span class="font-mono-fi" style="font-size:11px;color:var(--fi-t1)">{{
                  activeReq.size
                }}</span>
              </div>
            </div>
            <!-- Best quote banner -->
            <div
              *ngIf="activeReq.quotes.length > 0 && activeReq.status !== 'done'"
              style="display:flex;align-items:center;gap:24px;padding:8px 16px;border-bottom:1px solid var(--fi-border);background:var(--fi-bg2);flex-shrink:0"
            >
              <div>
                <div class="col-hdr" style="margin-bottom:2px">Best Bid</div>
                <div class="font-mono-fi font-bold" style="font-size:13px;color:var(--fi-blue)">
                  {{ bestBid.toFixed(3) }}
                </div>
              </div>
              <div>
                <div class="col-hdr" style="margin-bottom:2px">Best Ask</div>
                <div class="font-mono-fi font-bold" style="font-size:13px;color:var(--fi-red)">
                  {{ bestAsk.toFixed(3) }}
                </div>
              </div>
              <div>
                <div class="col-hdr" style="margin-bottom:2px">Spread</div>
                <div class="font-mono-fi font-bold" style="font-size:13px;color:var(--fi-amber)">
                  {{ ((bestAsk - bestBid) * 100).toFixed(1) }}c
                </div>
              </div>
              <div>
                <div class="col-hdr" style="margin-bottom:2px">Quotes</div>
                <div class="font-mono-fi font-bold" style="font-size:13px;color:var(--fi-green)">
                  {{ activeReq.quotes.length }}
                </div>
              </div>
            </div>
            <!-- Quote grid -->
            <div style="flex:1;overflow:hidden">
              <div
                *ngIf="activeReq.quotes.length === 0"
                style="display:flex;align-items:center;justify-content:center;height:100%"
              >
                <div style="text-align:center">
                  <div class="font-mono-fi" style="font-size:24px;color:var(--fi-border2)">...</div>
                  <div class="font-mono-fi" style="font-size:11px;color:var(--fi-t3)">
                    Quotes incoming from dealers...
                  </div>
                </div>
              </div>
              <div *ngIf="activeReq.quotes.length > 0" style="width:100%;height:100%;overflow:auto">
                <table style="width:100%;border-collapse:collapse">
                  <thead>
                    <tr>
                      <th
                        style="font-size:9px;color:var(--fi-t1);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:left;white-space:nowrap;background:var(--fi-bg2);border-bottom:1px solid var(--fi-border)"
                      >
                        DEALER
                      </th>
                      <th
                        style="font-size:9px;color:var(--fi-t1);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--fi-bg2);border-bottom:1px solid var(--fi-border)"
                      >
                        BID
                      </th>
                      <th
                        style="font-size:9px;color:var(--fi-t1);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--fi-bg2);border-bottom:1px solid var(--fi-border)"
                      >
                        BID SIZE
                      </th>
                      <th
                        style="font-size:9px;color:var(--fi-t1);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--fi-bg2);border-bottom:1px solid var(--fi-border)"
                      >
                        ASK
                      </th>
                      <th
                        style="font-size:9px;color:var(--fi-t1);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--fi-bg2);border-bottom:1px solid var(--fi-border)"
                      >
                        ASK SIZE
                      </th>
                      <th
                        style="font-size:9px;color:var(--fi-t1);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:right;white-space:nowrap;background:var(--fi-bg2);border-bottom:1px solid var(--fi-border)"
                      >
                        SPREAD
                      </th>
                      <th
                        style="font-size:9px;color:var(--fi-t1);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:left;white-space:nowrap;background:var(--fi-bg2);border-bottom:1px solid var(--fi-border)"
                      >
                        STATUS
                      </th>
                      <th
                        style="font-size:9px;color:var(--fi-t1);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;padding:6px 8px;text-align:left;white-space:nowrap;background:var(--fi-bg2);border-bottom:1px solid var(--fi-border)"
                      >
                        ACTION
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      *ngFor="let q of sortedQuotes"
                      [style.opacity]="q.status === 'stale' || q.status === 'done' ? 0.5 : 1"
                    >
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--fi-border);white-space:nowrap;font-weight:700;color:var(--fi-cyan)"
                      >
                        {{ q.dealer }}
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--fi-border);white-space:nowrap;text-align:right"
                        [style.font-weight]="q.bid === bestBid ? '700' : '400'"
                        [style.color]="q.bid === bestBid ? 'var(--fi-blue)' : '#5a7090'"
                      >
                        {{ q.bid.toFixed(3)
                        }}<span
                          *ngIf="q.bid === bestBid"
                          style="margin-left:4px;font-size:9px;font-weight:700;color:var(--fi-blue)"
                          >&#9650;BEST</span
                        >
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--fi-border);white-space:nowrap;text-align:right;color:var(--fi-t1)"
                      >
                        {{ q.bidSize }}
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--fi-border);white-space:nowrap;text-align:right"
                        [style.font-weight]="q.ask === bestAsk ? '700' : '400'"
                        [style.color]="q.ask === bestAsk ? 'var(--fi-red)' : '#7a4050'"
                      >
                        {{ q.ask.toFixed(3)
                        }}<span
                          *ngIf="q.ask === bestAsk"
                          style="margin-left:4px;font-size:9px;font-weight:700;color:var(--fi-red)"
                          >&#9660;BEST</span
                        >
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--fi-border);white-space:nowrap;text-align:right;color:var(--fi-t1)"
                      >
                        {{ q.askSize }}
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--fi-border);white-space:nowrap;text-align:right;color:var(--fi-amber)"
                      >
                        {{ ((q.ask - q.bid) * 100).toFixed(1) }}c
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--fi-border);white-space:nowrap"
                      >
                        <span
                          style="font-size:9px;padding:1px 6px;border-radius:2px"
                          [style.background]="statusBg(q.status)"
                          [style.color]="statusColor(q.status)"
                          [style.border]="'1px solid ' + statusBorder(q.status)"
                          >{{ q.status.toUpperCase() }}</span
                        >
                      </td>
                      <td
                        style="font-family:'JetBrains Mono',monospace;font-size:11px;padding:6px 8px;border-bottom:1px solid var(--fi-border);white-space:nowrap"
                      >
                        <ng-container *ngIf="q.status === 'done'">
                          <span style="color:var(--fi-green)">&#10003;</span>
                        </ng-container>
                        <ng-container
                          *ngIf="
                            q.status !== 'done' &&
                            q.status !== 'stale' &&
                            activeReq!.status !== 'done'
                          "
                        >
                          <div style="display:flex;gap:6px">
                            <button
                              class="font-mono-fi font-bold"
                              (click)="hitLift(activeReq!.id, q.dealer, 'hit')"
                              style="font-size:11px;padding:4px 10px;border-radius:2px;background:rgba(61,158,255,0.15);color:var(--fi-blue);border:1px solid rgba(61,158,255,0.35);cursor:pointer"
                            >
                              HIT
                            </button>
                            <button
                              class="font-mono-fi font-bold"
                              (click)="hitLift(activeReq!.id, q.dealer, 'lift')"
                              style="font-size:11px;padding:4px 10px;border-radius:2px;background:rgba(0,229,160,0.15);color:var(--fi-green);border:1px solid rgba(0,229,160,0.35);cursor:pointer"
                            >
                              LIFT
                            </button>
                          </div>
                        </ng-container>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <!-- Done banner -->
            <div
              *ngIf="activeReq.status === 'done'"
              style="display:flex;align-items:center;gap:12px;padding:8px 16px;border-top:1px solid var(--fi-border);flex-shrink:0;background:rgba(45,212,191,0.05)"
            >
              <span class="font-mono-fi font-bold" style="font-size:11px;color:var(--fi-green)"
                >RFQ COMPLETE</span
              >
            </div>
          </ng-container>
          <div
            *ngIf="!activeReq"
            style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px"
          >
            <div class="font-mono-fi" style="font-size:11px;color:var(--fi-t3)">
              Select a bond from the blotter, then send an RFQ
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class RfqWidget implements OnInit, OnDestroy {
  @Input() api: any;
  @Input() panel: any;

  private shared = inject(SharedStateService);
  private quoteInterval: any;
  private staleInterval: any;

  dealers = DEALERS;
  rfqSide: 'Buy' | 'Sell' = 'Buy';
  rfqSize = '5';
  activeId = '';
  instrSearch = '';
  instrOpen = false;
  localBond: Bond | null = null;

  get activeBond(): Bond | null {
    return this.localBond || this.shared.selectedBond();
  }
  get requests(): RfqRequest[] {
    return this.shared.rfqRequests();
  }
  get activeReq(): RfqRequest | null {
    return this.requests.find((r) => r.id === this.activeId) || this.requests[0] || null;
  }
  get liveCount(): number {
    return this.requests.filter((r) => r.status === 'pending' || r.status === 'quoted').length;
  }
  get bestBid(): number {
    return this.activeReq ? Math.max(...this.activeReq.quotes.map((q) => q.bid), 0) : 0;
  }
  get bestAsk(): number {
    return this.activeReq
      ? Math.min(...this.activeReq.quotes.filter((q) => q.ask > 0).map((q) => q.ask), 9999)
      : 9999;
  }
  get sortedQuotes() {
    return this.activeReq ? [...this.activeReq.quotes].sort((a, b) => b.bid - a.bid) : [];
  }
  get instrResults(): Bond[] {
    if (this.instrSearch.length === 0) return [];
    const q = this.instrSearch.toLowerCase();
    return BONDS.filter(
      (b) =>
        b.ticker.toLowerCase().includes(q) ||
        b.issuer.toLowerCase().includes(q) ||
        b.cusip.toLowerCase().includes(q) ||
        `${b.cpn}`.includes(q) ||
        b.mat.includes(q),
    ).slice(0, 8);
  }

  constructor() {
    effect(() => {
      const bond = this.shared.selectedBond();
      this.localBond = bond;
      this.instrSearch = '';
      this.instrOpen = false;
    });
  }

  ngOnInit() {
    this.quoteInterval = setInterval(() => {
      this.shared.rfqRequests.update((prev) =>
        prev.map((r) => {
          if (r.status !== 'pending') return r;
          const elapsed = Date.now() - r.createdAt;
          if (elapsed < 800) return r;
          if (r.quotes.length < 6 && Math.random() < 0.6) {
            const remaining = DEALERS.filter((d) => !r.quotes.find((q) => q.dealer === d));
            if (remaining.length === 0) return { ...r, status: 'quoted' as const };
            const dealer = remaining[Math.floor(Math.random() * remaining.length)];
            const bond = this.activeBond || ({ bid: 100, ask: 100.25 } as Bond);
            const quote = makeQuote(bond, r.side, dealer);
            return {
              ...r,
              quotes: [...r.quotes, quote],
              status: (r.quotes.length >= 4 ? 'quoted' : 'pending') as any,
            };
          }
          if (r.quotes.length >= 4) return { ...r, status: 'quoted' as const };
          return r;
        }),
      );
    }, 600);
    this.staleInterval = setInterval(() => {
      this.shared.rfqRequests.update((prev) =>
        prev.map((r) => ({
          ...r,
          quotes: r.quotes.map((q) => ({
            ...q,
            status: (q.status === 'live' && Date.now() - q.ts > 30000 ? 'stale' : q.status) as any,
          })),
        })),
      );
    }, 5000);
  }

  ngOnDestroy() {
    if (this.quoteInterval) clearInterval(this.quoteInterval);
    if (this.staleInterval) clearInterval(this.staleInterval);
  }

  pickBond(b: Bond) {
    this.localBond = b;
    this.instrSearch = '';
    this.instrOpen = false;
  }

  sendRfq() {
    if (!this.activeBond) return;
    const id = `RFQ-${String(rfqCounter++).padStart(4, '0')}`;
    const newReq: RfqRequest = {
      id,
      bond: `${this.activeBond.ticker} ${this.activeBond.cpn} ${this.activeBond.mat}`,
      size: `$${this.rfqSize}MM`,
      side: this.rfqSide,
      status: 'pending',
      quotes: [],
      createdAt: Date.now(),
    };
    this.shared.rfqRequests.update((prev) => [newReq, ...prev]);
    this.activeId = id;
  }

  hitLift(rfqId: string, dealer: string, action: 'hit' | 'lift') {
    this.shared.rfqRequests.update((prev) =>
      prev.map((r) => {
        if (r.id !== rfqId) return r;
        return {
          ...r,
          status: 'done' as const,
          quotes: r.quotes
            .filter((q) => q.dealer === dealer)
            .map((q) => ({ ...q, status: 'done' as const })),
        };
      }),
    );
    setTimeout(() => {
      this.activeId = '';
      this.rfqSize = '5';
    }, 3000);
  }

  statusBg(s: string) {
    return s === 'pending'
      ? 'rgba(61,158,255,0.1)'
      : s === 'quoted'
        ? 'rgba(245,166,35,0.1)'
        : s === 'done'
          ? 'rgba(0,229,160,0.1)'
          : 'rgba(255,61,94,0.1)';
  }
  statusColor(s: string) {
    return s === 'pending'
      ? 'var(--fi-blue)'
      : s === 'quoted'
        ? 'var(--fi-amber)'
        : s === 'done'
          ? 'var(--fi-green)'
          : 'var(--fi-red)';
  }
  statusBorder(s: string) {
    return s === 'pending'
      ? 'rgba(61,158,255,0.25)'
      : s === 'quoted'
        ? 'rgba(245,166,35,0.25)'
        : s === 'done'
          ? 'rgba(0,229,160,0.25)'
          : 'rgba(255,61,94,0.25)';
  }
}
