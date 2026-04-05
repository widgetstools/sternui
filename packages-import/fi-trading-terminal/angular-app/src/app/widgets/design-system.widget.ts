import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'design-system-widget',
  standalone: true,
  imports: [CommonModule],
  host: { style: 'display:flex;flex-direction:column;height:100%;width:100%;overflow-y:auto' },
  template: `
    <div style="padding:24px 32px;max-width:1200px">
      <!-- ══════════════════════════════════════════════════════ -->
      <!-- HEADER -->
      <!-- ══════════════════════════════════════════════════════ -->
      <div style="margin-bottom:32px">
        <h1
          style="font-size:18px;font-weight:700;color:var(--bn-t0);margin:0 0 4px 0;font-family:var(--fi-sans)"
        >
          FI Design System
        </h1>
        <p style="font-size:11px;color:var(--bn-t2);margin:0;font-family:var(--fi-mono)">
          Color palette, typography, spacing, and component reference for the MarketsUI FI trading
          terminal.
        </p>
      </div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 1. COLOR PALETTE -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">1. Color Palette</div>

        <!-- Surface Colors -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Surface Colors</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div *ngFor="let s of surfaceColors" class="ds-swatch" [style.background]="s.var">
              <span class="ds-swatch-label">{{ s.name }}</span>
              <span class="ds-swatch-hex">{{ s.hex }}</span>
            </div>
          </div>
        </div>

        <!-- Text Colors -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Text Colors</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div
              *ngFor="let t of textColors"
              style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bn-bg1);border-radius:3px;border:1px solid var(--bn-border)"
            >
              <span
                style="font-size:13px;font-family:var(--fi-mono);font-weight:600"
                [style.color]="t.var"
                >Sample Text</span
              >
              <span style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono)"
                >{{ t.name }} {{ t.hex }}</span
              >
            </div>
          </div>
        </div>

        <!-- Semantic Colors -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Semantic Colors</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <div *ngFor="let c of semanticColors" class="ds-color-chip" [style.background]="c.var">
              <span
                style="font-size:9px;font-weight:600;color:var(--bn-bg);font-family:var(--fi-mono)"
                >{{ c.name }}</span
              >
              <span
                style="font-size:9px;color:var(--bn-bg);font-family:var(--fi-mono);opacity:0.8"
                >{{ c.hex }}</span
              >
            </div>
          </div>
        </div>

        <!-- Trading Colors -->
        <div>
          <div class="ds-sub-heading">Trading Colors</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--bn-buy-bg);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--bn-cta-text);font-family:var(--fi-mono)"
                >BUY +0.125</span
              >
              <span style="font-size:9px;color:rgba(255,255,255,0.7);font-family:var(--fi-mono)"
                >--bn-buy-bg</span
              >
            </div>
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--bn-sell-bg);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--bn-cta-text);font-family:var(--fi-mono)"
                >SELL -0.250</span
              >
              <span style="font-size:9px;color:rgba(255,255,255,0.7);font-family:var(--fi-mono)"
                >--bn-sell-bg</span
              >
            </div>
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--bn-blue);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--bn-cta-text);font-family:var(--fi-mono)"
                >SEND RFQ</span
              >
              <span style="font-size:9px;color:rgba(255,255,255,0.7);font-family:var(--fi-mono)"
                >--bn-cta-text</span
              >
            </div>
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--bn-green);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--bn-green);font-family:var(--fi-mono)"
                >+2.35%</span
              >
              <span style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono)"
                >Positive</span
              >
            </div>
            <div
              style="display:flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--bn-red);border-radius:3px"
            >
              <span
                style="font-size:11px;font-weight:600;color:var(--bn-red);font-family:var(--fi-mono)"
                >-1.08%</span
              >
              <span style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono)"
                >Negative</span
              >
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 2. TYPOGRAPHY -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">2. Typography</div>

        <!-- Font Families -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Font Families</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div
              style="padding:10px 14px;background:var(--bn-bg1);border-radius:3px;border:1px solid var(--bn-border)"
            >
              <span style="font-family:var(--fi-mono);font-size:13px;color:var(--bn-t0)"
                >JetBrains Mono</span
              >
              <span
                style="font-size:9px;color:var(--bn-t2);margin-left:8px;font-family:var(--fi-mono)"
                >--fi-mono / Data, prices, tables, code</span
              >
              <div
                style="font-family:var(--fi-mono);font-size:11px;color:var(--bn-t1);margin-top:4px"
              >
                ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 $%+-.,:;
              </div>
            </div>
            <div
              style="padding:10px 14px;background:var(--bn-bg1);border-radius:3px;border:1px solid var(--bn-border)"
            >
              <span style="font-family:var(--fi-sans);font-size:13px;color:var(--bn-t0)"
                >Geist</span
              >
              <span
                style="font-size:9px;color:var(--bn-t2);margin-left:8px;font-family:var(--fi-mono)"
                >--fi-sans / Headings, labels, UI chrome</span
              >
              <div
                style="font-family:var(--fi-sans);font-size:11px;color:var(--bn-t1);margin-top:4px"
              >
                ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 $%+-.,:;
              </div>
            </div>
          </div>
        </div>

        <!-- Font Scale -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Font Scale</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div
              *ngFor="let f of fontScale"
              style="display:flex;align-items:baseline;gap:12px;padding:6px 14px;background:var(--bn-bg1);border-radius:3px;border:1px solid var(--bn-border)"
            >
              <span
                style="font-family:var(--fi-mono);color:var(--bn-t0);font-weight:600"
                [style.fontSize]="f.size"
                >{{ f.sample }}</span
              >
              <span style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono)"
                >{{ f.label }} ({{ f.size }})</span
              >
            </div>
          </div>
        </div>

        <!-- Font Weights -->
        <div>
          <div class="ds-sub-heading">Font Weights</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div
              *ngFor="let w of fontWeights"
              style="padding:8px 14px;background:var(--bn-bg1);border-radius:3px;border:1px solid var(--bn-border)"
            >
              <span
                style="font-family:var(--fi-mono);font-size:13px;color:var(--bn-t0)"
                [style.fontWeight]="w.weight"
                >{{ w.label }}</span
              >
              <span
                style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono);margin-left:6px"
                >{{ w.weight }}</span
              >
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 3. SPACING & RADIUS -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">3. Spacing &amp; Radius</div>

        <!-- Spacing -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Spacing Scale</div>
          <div style="display:flex;align-items:flex-end;gap:6px;flex-wrap:wrap">
            <div
              *ngFor="let s of spacingScale"
              style="display:flex;flex-direction:column;align-items:center;gap:4px"
            >
              <div
                [style.width.px]="s.px"
                [style.height.px]="s.px"
                style="background:var(--bn-cyan);border-radius:2px;min-width:4px;min-height:4px;opacity:0.7"
              ></div>
              <span style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono)"
                >{{ s.px }}px</span
              >
              <span style="font-size:9px;color:var(--bn-t3);font-family:var(--fi-mono)">{{
                s.label
              }}</span>
            </div>
          </div>
        </div>

        <!-- Border Radius -->
        <div>
          <div class="ds-sub-heading">Border Radius</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div
              *ngFor="let r of radiusScale"
              style="display:flex;flex-direction:column;align-items:center;gap:4px"
            >
              <div
                style="width:48px;height:48px;background:var(--bn-bg3);border:1px solid var(--bn-cyan)"
                [style.borderRadius]="r.val"
              ></div>
              <span style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono)">{{
                r.label
              }}</span>
              <span style="font-size:9px;color:var(--bn-t3);font-family:var(--fi-mono)">{{
                r.val
              }}</span>
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 4. COMPONENT EXAMPLES -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">4. Component Examples</div>

        <!-- Buttons -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Buttons</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button class="ds-btn ds-btn-buy">BUY</button>
            <button class="ds-btn ds-btn-sell">SELL</button>
            <button class="ds-btn ds-btn-ghost">Cancel Order</button>
            <button class="ds-btn ds-btn-ghost" disabled>Disabled</button>
            <button class="ds-btn ds-btn-primary">Submit RFQ</button>
          </div>
        </div>

        <!-- Inputs -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Inputs</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div style="display:flex;flex-direction:column;gap:3px">
              <label
                style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono);text-transform:uppercase;letter-spacing:0.05em"
                >Price</label
              >
              <input type="text" value="99.875" readonly class="ds-input" style="width:120px" />
            </div>
            <div style="display:flex;flex-direction:column;gap:3px">
              <label
                style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono);text-transform:uppercase;letter-spacing:0.05em"
                >Search</label
              >
              <input
                type="text"
                placeholder="Search bonds..."
                readonly
                class="ds-input"
                style="width:180px"
              />
            </div>
            <div style="display:flex;flex-direction:column;gap:3px">
              <label
                style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono);text-transform:uppercase;letter-spacing:0.05em"
                >Quantity (MM)</label
              >
              <input type="text" value="5.000" readonly class="ds-input" style="width:120px" />
            </div>
          </div>
        </div>

        <!-- Status Badges -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Status Badges</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span class="ds-badge" style="background:rgba(45,212,191,0.15);color:var(--bn-green)"
              >Filled</span
            >
            <span class="ds-badge" style="background:rgba(59,130,246,0.15);color:var(--bn-blue)"
              >Partial</span
            >
            <span class="ds-badge" style="background:rgba(240,185,11,0.15);color:var(--bn-yellow)"
              >Pending</span
            >
            <span class="ds-badge" style="background:rgba(248,113,113,0.15);color:var(--bn-red)"
              >Cancelled</span
            >
            <span class="ds-badge" style="background:rgba(192,132,252,0.15);color:var(--fi-purple)"
              >Working</span
            >
          </div>
        </div>

        <!-- Tab Navigation -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Tab Navigation</div>
          <div style="display:flex;border-bottom:1px solid var(--bn-border)">
            <div
              *ngFor="let tab of sampleTabs; let i = index"
              class="ds-tab"
              [class.ds-tab-active]="i === 0"
            >
              {{ tab }}
            </div>
          </div>
        </div>

        <!-- Panel / Card -->
        <div>
          <div class="ds-sub-heading">Panel / Card</div>
          <div
            style="background:var(--bn-bg1);border:1px solid var(--bn-border);border-radius:4px;overflow:hidden;max-width:400px"
          >
            <div
              style="padding:8px 12px;border-bottom:1px solid var(--bn-border);font-size:11px;color:var(--bn-t1);font-family:var(--fi-mono);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:var(--bn-bg2)"
            >
              Position Summary
            </div>
            <div style="padding:12px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:11px;color:var(--bn-t2);font-family:var(--fi-mono)"
                  >Notional</span
                >
                <span
                  style="font-size:11px;color:var(--bn-t0);font-family:var(--fi-mono);font-weight:600"
                  >$25,000,000</span
                >
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:11px;color:var(--bn-t2);font-family:var(--fi-mono)"
                  >Avg Price</span
                >
                <span
                  style="font-size:11px;color:var(--bn-t0);font-family:var(--fi-mono);font-weight:600"
                  >99.750</span
                >
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="font-size:11px;color:var(--bn-t2);font-family:var(--fi-mono)"
                  >P&amp;L</span
                >
                <span
                  style="font-size:11px;color:var(--bn-green);font-family:var(--fi-mono);font-weight:600"
                  >+$42,500</span
                >
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 5. DATA DISPLAY -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">5. Data Display</div>

        <!-- Sample Table -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">Bond Table</div>
          <div style="overflow-x:auto;border:1px solid var(--bn-border);border-radius:4px">
            <table class="ds-table">
              <thead>
                <tr>
                  <th>Security</th>
                  <th>Coupon</th>
                  <th>Maturity</th>
                  <th>Bid</th>
                  <th>Ask</th>
                  <th>OAS</th>
                  <th>Chg</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of tableRows">
                  <td style="color:var(--bn-cyan);font-weight:600">{{ row.security }}</td>
                  <td>{{ row.coupon }}</td>
                  <td>{{ row.maturity }}</td>
                  <td>{{ row.bid }}</td>
                  <td>{{ row.ask }}</td>
                  <td [style.color]="row.oasColor">{{ row.oas }}</td>
                  <td [style.color]="row.chgColor">{{ row.chg }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Order Book -->
        <div>
          <div class="ds-sub-heading">Order Book (Bid / Ask)</div>
          <div style="display:flex;gap:2px;max-width:500px">
            <!-- Bids -->
            <div style="flex:1">
              <div
                style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono);padding:4px 8px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--bn-border)"
              >
                Bid
              </div>
              <div
                *ngFor="let b of bids"
                style="display:flex;justify-content:space-between;padding:3px 8px;position:relative"
              >
                <div class="ds-ob-bar-bid" [style.width.%]="b.pct"></div>
                <span
                  style="font-size:11px;color:var(--bn-green);font-family:var(--fi-mono);position:relative;z-index:1;font-weight:600"
                  >{{ b.price }}</span
                >
                <span
                  style="font-size:11px;color:var(--bn-t1);font-family:var(--fi-mono);position:relative;z-index:1"
                  >{{ b.size }}</span
                >
              </div>
            </div>
            <!-- Asks -->
            <div style="flex:1">
              <div
                style="font-size:9px;color:var(--bn-t2);font-family:var(--fi-mono);padding:4px 8px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--bn-border);text-align:right"
              >
                Ask
              </div>
              <div
                *ngFor="let a of asks"
                style="display:flex;justify-content:space-between;padding:3px 8px;position:relative"
              >
                <div class="ds-ob-bar-ask" [style.width.%]="a.pct"></div>
                <span
                  style="font-size:11px;color:var(--bn-t1);font-family:var(--fi-mono);position:relative;z-index:1"
                  >{{ a.size }}</span
                >
                <span
                  style="font-size:11px;color:var(--bn-red);font-family:var(--fi-mono);position:relative;z-index:1;font-weight:600"
                  >{{ a.price }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 6. AG GRID CELL RENDERERS -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">6. AG Grid Cell Renderers</div>
        <div style="font-size:11px;color:var(--bn-t2);margin-bottom:16px">
          Shared vanilla TypeScript cell renderers from design-system/cell-renderers.ts.
          Framework-agnostic — used in both React and Angular apps via ICellRendererComp.
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          @for (r of cellRenderers; track r.name) {
            <div
              style="background:var(--bn-bg1);border:1px solid var(--bn-border);border-radius:3px;padding:8px 12px"
            >
              <div
                style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"
              >
                <span
                  style="font-size:11px;font-weight:600;color:var(--bn-t0);font-family:var(--fi-mono)"
                  >{{ r.name }}</span
                >
                <span
                  [style.color]="r.color"
                  style="font-size:11px;font-weight:700;font-family:var(--fi-mono)"
                  >{{ r.example }}</span
                >
              </div>
              <span style="font-size:9px;color:var(--bn-t2)">{{ r.desc }}</span>
            </div>
          }
        </div>

        <div class="ds-sub-heading" style="margin-top:16px">Usage</div>
        <pre class="ds-code">{{ cellRendererUsageCode }}</pre>
      </section>

      <div class="ds-divider"></div>

      <!-- ══════════════════════════════════════════════════════ -->
      <!-- 7. ANGULAR USAGE GUIDE -->
      <!-- ══════════════════════════════════════════════════════ -->
      <section style="margin-bottom:32px">
        <div class="ds-section-heading">7. Angular Usage Guide</div>

        <!-- PrimeNG Preset -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">PrimeNG Preset Setup</div>
          <pre class="ds-code">{{ primengCode }}</pre>
        </div>

        <!-- AG Grid Theming -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">AG Grid Theming</div>
          <pre class="ds-code">{{ agGridCode }}</pre>
        </div>

        <!-- CSS Variable Usage -->
        <div style="margin-bottom:20px">
          <div class="ds-sub-heading">CSS Variable Usage</div>
          <pre class="ds-code">{{ cssVarCode }}</pre>
        </div>

        <!-- Dark/Light Toggle -->
        <div>
          <div class="ds-sub-heading">Dark / Light Toggle</div>
          <pre class="ds-code">{{ themeToggleCode }}</pre>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        background: var(--bn-bg);
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb) transparent;
      }
      .ds-section-heading {
        font-size: 13px;
        font-weight: 700;
        color: var(--bn-t0);
        font-family: var(--fi-sans);
        margin-bottom: 16px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--bn-border);
      }
      .ds-sub-heading {
        font-size: 11px;
        font-weight: 600;
        color: var(--bn-t1);
        font-family: var(--fi-mono);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .ds-divider {
        height: 1px;
        background: var(--bn-border);
        margin-bottom: 32px;
      }
      .ds-swatch {
        width: 100px;
        height: 64px;
        border-radius: 4px;
        border: 1px solid var(--bn-border);
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 6px 8px;
      }
      .ds-swatch-label {
        font-size: 9px;
        color: var(--bn-t1);
        font-family: var(--fi-mono);
      }
      .ds-swatch-hex {
        font-size: 9px;
        color: var(--bn-t2);
        font-family: var(--fi-mono);
      }
      .ds-color-chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 8px 14px;
        border-radius: 3px;
        min-width: 80px;
      }
      .ds-btn {
        font-family: var(--fi-mono);
        font-size: 11px;
        font-weight: 600;
        padding: 6px 16px;
        border-radius: 3px;
        border: none;
        cursor: pointer;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .ds-btn-buy {
        background: var(--bn-buy-bg);
        color: #fff;
      }
      .ds-btn-sell {
        background: var(--bn-sell-bg);
        color: #fff;
      }
      .ds-btn-ghost {
        background: transparent;
        color: var(--bn-t1);
        border: 1px solid var(--bn-border2);
      }
      .ds-btn-ghost:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .ds-btn-primary {
        background: var(--bn-yellow);
        color: var(--bn-bg);
      }
      .ds-input {
        font-family: var(--fi-mono);
        font-size: 11px;
        color: var(--bn-t0);
        background: var(--bn-bg);
        border: 1px solid var(--bn-border2);
        border-radius: 3px;
        padding: 6px 10px;
        outline: none;
        font-variant-numeric: tabular-nums;
      }
      .ds-badge {
        font-family: var(--fi-mono);
        font-size: 9px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 3px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .ds-tab {
        font-family: var(--fi-mono);
        font-size: 11px;
        color: var(--bn-t2);
        padding: 8px 14px;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        font-weight: 500;
      }
      .ds-tab-active {
        color: var(--bn-t0);
        border-bottom-color: var(--bn-yellow);
        font-weight: 600;
      }
      .ds-table {
        width: 100%;
        border-collapse: collapse;
        font-family: var(--fi-mono);
        font-size: 11px;
      }
      .ds-table th {
        font-size: 9px;
        color: var(--bn-t2);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        text-align: left;
        padding: 6px 12px;
        background: var(--bn-bg2);
        border-bottom: 1px solid var(--bn-border);
      }
      .ds-table td {
        padding: 6px 12px;
        color: var(--bn-t0);
        border-bottom: 1px solid var(--bn-border);
        font-variant-numeric: tabular-nums;
      }
      .ds-table tr:hover td {
        background: var(--bn-bg2);
      }
      .ds-ob-bar-bid {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        background: rgba(45, 212, 191, 0.08);
      }
      .ds-ob-bar-ask {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        background: rgba(248, 113, 113, 0.08);
      }
      .ds-code {
        font-family: var(--fi-mono);
        font-size: 11px;
        color: var(--bn-t1);
        background: var(--bn-bg1);
        border: 1px solid var(--bn-border);
        border-radius: 4px;
        padding: 12px 16px;
        margin: 0;
        overflow-x: auto;
        white-space: pre;
        line-height: 1.5;
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb) transparent;
      }
    `,
  ],
})
export class DesignSystemWidget {
  @Input() api: any;
  @Input() panel: any;

  // ── 1. Color Palette data ──
  surfaceColors = [
    { name: '--bn-bg', hex: '#0b0e11', var: 'var(--bn-bg)' },
    { name: '--bn-bg1', hex: '#161a1e', var: 'var(--bn-bg1)' },
    { name: '--bn-bg2', hex: '#1e2329', var: 'var(--bn-bg2)' },
    { name: '--bn-bg3', hex: '#2b3139', var: 'var(--bn-bg3)' },
  ];

  textColors = [
    { name: '--bn-t0', hex: '#eaecef', var: 'var(--bn-t0)' },
    { name: '--bn-t1', hex: '#a0a8b4', var: 'var(--bn-t1)' },
    { name: '--bn-t2', hex: '#7a8494', var: 'var(--bn-t2)' },
    { name: '--bn-t3', hex: '#4a5568', var: 'var(--bn-t3)' },
  ];

  semanticColors = [
    { name: 'Green (Buy)', hex: '#2dd4bf', var: 'var(--bn-green)' },
    { name: 'Red (Sell)', hex: '#f87171', var: 'var(--bn-red)' },
    { name: 'Yellow (Warn)', hex: '#f0b90b', var: 'var(--bn-yellow)' },
    { name: 'Blue (Info)', hex: '#3da0ff', var: 'var(--bn-blue)' },
    { name: 'Cyan (HL)', hex: '#22d3ee', var: 'var(--bn-cyan)' },
    { name: 'Purple', hex: '#c084fc', var: 'var(--fi-purple)' },
  ];

  // ── 2. Typography data ──
  fontScale = [
    { label: 'xs', size: '9px', sample: 'Column Header / Caption' },
    { label: 'sm', size: '11px', sample: 'Body text, table cells, data values (default)' },
    { label: 'md', size: '13px', sample: 'Section titles, nav tabs, CTA buttons' },
    { label: 'lg', size: '18px', sample: 'KPI headline numbers' },
  ];

  fontWeights = [
    { label: 'Regular', weight: 400 },
    { label: 'Medium', weight: 500 },
    { label: 'SemiBold', weight: 600 },
    { label: 'Bold', weight: 700 },
  ];

  // ── 3. Spacing & Radius data ──
  spacingScale = [
    { label: '0.5', px: 2 },
    { label: '1', px: 4 },
    { label: '1.5', px: 6 },
    { label: '2', px: 8 },
    { label: '3', px: 12 },
    { label: '4', px: 16 },
    { label: '5', px: 20 },
    { label: '6', px: 24 },
    { label: '8', px: 32 },
  ];

  radiusScale = [
    { label: 'none', val: '0px' },
    { label: 'sm', val: '2px' },
    { label: 'md', val: '3px' },
    { label: 'lg', val: '4px' },
    { label: 'xl', val: '6px' },
    { label: 'full', val: '9999px' },
  ];

  // ── 4. Component data ──
  sampleTabs = ['Prices', 'Trade', 'Risk', 'Market', 'Orders'];

  // ── 5. Data display ──
  tableRows = [
    {
      security: 'T 4.500 11/30',
      coupon: '4.500%',
      maturity: '2030-11-30',
      bid: '99.875',
      ask: '99.938',
      oas: '+42bp',
      oasColor: 'var(--bn-green)',
      chg: '+0.125',
      chgColor: 'var(--bn-green)',
    },
    {
      security: 'T 3.875 08/31',
      coupon: '3.875%',
      maturity: '2031-08-15',
      bid: '97.250',
      ask: '97.375',
      oas: '+58bp',
      oasColor: 'var(--bn-green)',
      chg: '-0.063',
      chgColor: 'var(--bn-red)',
    },
    {
      security: 'T 5.000 05/34',
      coupon: '5.000%',
      maturity: '2034-05-15',
      bid: '102.500',
      ask: '102.625',
      oas: '+85bp',
      oasColor: 'var(--bn-yellow)',
      chg: '+0.250',
      chgColor: 'var(--bn-green)',
    },
    {
      security: 'T 4.250 02/29',
      coupon: '4.250%',
      maturity: '2029-02-28',
      bid: '100.125',
      ask: '100.188',
      oas: '+31bp',
      oasColor: 'var(--bn-green)',
      chg: '-0.188',
      chgColor: 'var(--bn-red)',
    },
  ];

  bids = [
    { price: '99.875', size: '5MM', pct: 80 },
    { price: '99.844', size: '12MM', pct: 100 },
    { price: '99.813', size: '8MM', pct: 65 },
    { price: '99.781', size: '3MM', pct: 40 },
    { price: '99.750', size: '7MM', pct: 55 },
  ];

  asks = [
    { price: '99.938', size: '4MM', pct: 70 },
    { price: '99.969', size: '10MM', pct: 100 },
    { price: '100.000', size: '6MM', pct: 55 },
    { price: '100.031', size: '2MM', pct: 30 },
    { price: '100.063', size: '9MM', pct: 85 },
  ];

  // ── 6. Code snippets ──
  primengCode = `// app.config.ts
import { providePrimeNG } from 'primeng/config';
import { definePreset } from 'primeng/api';
import { Aura } from 'primeng/themes';
import { generatePrimeNGPreset } from '@fi/design-system/adapters/primeng';

const FiTheme = definePreset(Aura, generatePrimeNGPreset());

export const appConfig = {
  providers: [
    providePrimeNG({
      theme: {
        preset: FiTheme,
        options: {
          darkModeSelector: '[data-theme="dark"]',
        },
      },
    }),
  ],
};`;

  agGridCode = `// In your component
import { themeQuartz } from 'ag-grid-community';
import { agGridDarkParams, agGridLightParams }
  from '@fi/design-system/adapters/ag-grid';

// Create themes from the design system params
const darkTheme  = themeQuartz.withParams(agGridDarkParams);
const lightTheme = themeQuartz.withParams(agGridLightParams);

// Bind in template:
// <ag-grid-angular [theme]="gridTheme" ... />

// Toggle with data-theme attribute:
get gridTheme() {
  const isDark = document.documentElement
    .getAttribute('data-theme') === 'dark';
  return isDark ? darkTheme : lightTheme;
}`;

  cssVarCode = `/* Use CSS variables directly in styles */
.panel-header {
  background: var(--bn-bg2);
  color: var(--bn-t1);
  font-family: var(--fi-mono);
  font-size: var(--fi-font-sm);    /* 11px */
  border-bottom: 1px solid var(--bn-border);
}

.price-positive { color: var(--bn-green); }
.price-negative { color: var(--bn-red); }
.kpi-value {
  font-size: var(--fi-font-lg);    /* 18px */
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}`;

  themeToggleCode = `// In your Angular component
import { signal, effect } from '@angular/core';

isDark = signal(true);

constructor() {
  effect(() => {
    const mode = this.isDark() ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    // AG Grid reads this attribute
    document.body.dataset['agThemeMode'] = mode;
  });
}

toggleTheme() {
  this.isDark.update(v => !v);
}

// Template:
// <button (click)="toggleTheme()">
//   {{ isDark() ? 'Light' : 'Dark' }}
// </button>`;

  // ── 6. Cell Renderers data ──
  cellRenderers = [
    {
      name: 'SideCellRenderer',
      desc: 'BUY / SELL with green / red color',
      example: 'BUY',
      color: 'var(--bn-green)',
    },
    {
      name: 'StatusBadgeRenderer',
      desc: 'Filled, Partial, Pending, Cancelled',
      example: 'FILLED',
      color: 'var(--bn-green)',
    },
    {
      name: 'ColoredValueRenderer',
      desc: 'Positive green, negative red',
      example: '+0.125',
      color: 'var(--bn-green)',
    },
    {
      name: 'OasValueRenderer',
      desc: 'OAS with warning threshold >80',
      example: '+42',
      color: 'var(--bn-green)',
    },
    {
      name: 'SignedValueRenderer',
      desc: 'Signed spread values',
      example: '+3.2',
      color: 'var(--bn-t1)',
    },
    {
      name: 'TickerCellRenderer',
      desc: 'Cyan bold ticker symbol',
      example: 'UST',
      color: 'var(--bn-cyan)',
    },
    {
      name: 'RatingBadgeRenderer',
      desc: 'Credit rating badge (Aaa-HY)',
      example: 'Aa2',
      color: 'var(--bn-green)',
    },
    {
      name: 'PnlValueRenderer',
      desc: 'P&L with K suffix',
      example: '+120K',
      color: 'var(--bn-green)',
    },
    {
      name: 'FilledAmountRenderer',
      desc: 'Green if full, yellow if partial',
      example: '5000',
      color: 'var(--bn-yellow)',
    },
    {
      name: 'BookNameRenderer',
      desc: 'Cyan book/desk name',
      example: 'IG-NYC',
      color: 'var(--bn-cyan)',
    },
    {
      name: 'ChangeValueRenderer',
      desc: 'Market index change',
      example: '+0.45',
      color: 'var(--bn-green)',
    },
    {
      name: 'RfqStatusRenderer',
      desc: 'LIVE / DONE / STALE badge',
      example: 'LIVE',
      color: 'var(--bn-blue)',
    },
  ];

  cellRendererUsageCode = `import { SideCellRenderer, StatusBadgeRenderer }
  from '../services/cell-renderers';

colDefs: ColDef[] = [
  { field: 'side',   cellRenderer: SideCellRenderer },
  { field: 'status', cellRenderer: StatusBadgeRenderer },
];`;
}
