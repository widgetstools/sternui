import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { DividerModule } from 'primeng/divider';
import { AccordionModule } from 'primeng/accordion';
import { MessageModule } from 'primeng/message';
import { AvatarModule } from 'primeng/avatar';
import { CheckboxModule } from 'primeng/checkbox';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ProgressBarModule } from 'primeng/progressbar';
import { SliderModule } from 'primeng/slider';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { MenuModule } from 'primeng/menu';
import { SkeletonModule } from 'primeng/skeleton';
import { DatePickerModule } from 'primeng/datepicker';

/* ── Token data ── */
interface ColorSwatch { name: string; cssVar: string; }
interface FontSize { label: string; size: string; }
interface FontWeight { label: string; weight: number; }
interface HeightToken { label: string; value: string; }
interface PaddingToken { label: string; value: string; }
interface RadiusToken { label: string; value: string; }
interface OrderLevel { price: string; size: string; total: string; depth: number; gradient?: string; }
interface Position { symbol: string; qty: number; price: number; pnl: number; }

const SEMANTIC_COLORS: ColorSwatch[] = [
  { name: 'Background', cssVar: '--background' },
  { name: 'Foreground', cssVar: '--foreground' },
  { name: 'Card', cssVar: '--card' },
  { name: 'Primary', cssVar: '--primary' },
  { name: 'Secondary', cssVar: '--secondary' },
  { name: 'Muted', cssVar: '--muted' },
  { name: 'Accent', cssVar: '--accent' },
  { name: 'Brand', cssVar: '--brand' },
  { name: 'Destructive', cssVar: '--destructive' },
  { name: 'Success', cssVar: '--success' },
  { name: 'Border', cssVar: '--border' },
  { name: 'Input', cssVar: '--input' },
  { name: 'Ring', cssVar: '--ring' },
];
const TRADING_COLORS: ColorSwatch[] = [
  { name: 'Bid (Blue)', cssVar: '--mdl-bid' },
  { name: 'Ask (Red)', cssVar: '--mdl-ask' },
  { name: 'Flash Up', cssVar: '--mdl-flash-up' },
  { name: 'Flash Down', cssVar: '--mdl-flash-down' },
  { name: 'P&L Positive', cssVar: '--mdl-pnl-positive' },
  { name: 'P&L Negative', cssVar: '--mdl-pnl-negative' },
];
const FONT_SIZES: FontSize[] = [
  { label: 'xs (11px)', size: 'var(--mdl-font-xs)' },
  { label: 'sm (13px)', size: 'var(--mdl-font-sm)' },
  { label: 'base (14px)', size: 'var(--mdl-font-base)' },
  { label: 'lg (16px)', size: 'var(--mdl-font-lg)' },
  { label: 'xl (18px)', size: 'var(--mdl-font-xl)' },
];
const FONT_WEIGHTS: FontWeight[] = [
  { label: 'Light', weight: 300 },
  { label: 'Regular', weight: 400 },
  { label: 'Medium', weight: 500 },
  { label: 'Semi Bold', weight: 600 },
  { label: 'Bold', weight: 700 },
];
const HEIGHTS: HeightToken[] = [
  { label: 'sm (28px)', value: 'var(--mdl-height-sm)' },
  { label: 'default (36px)', value: 'var(--mdl-height-default)' },
  { label: 'lg (44px)', value: 'var(--mdl-height-lg)' },
];
const PADDINGS: PaddingToken[] = [
  { label: 'padding-x', value: '12px' },
  { label: 'padding-x-lg', value: '16px' },
  { label: 'padding-y', value: '8px' },
];
const RADII: RadiusToken[] = [
  { label: 'sm (6px)', value: 'var(--mdl-radius-sm)' },
  { label: 'md (10px)', value: 'var(--mdl-radius-md)' },
  { label: 'lg (14px)', value: 'var(--mdl-radius-lg)' },
  { label: 'xl (18px)', value: 'var(--mdl-radius-xl)' },
];
const BID_LEVELS: OrderLevel[] = [
  { price: '182.45', size: '1,200', total: '218,940', depth: 85 },
  { price: '182.44', size: '3,500', total: '638,540', depth: 70 },
  { price: '182.43', size: '800', total: '145,944', depth: 55 },
  { price: '182.42', size: '5,100', total: '930,342', depth: 40 },
  { price: '182.41', size: '2,300', total: '419,543', depth: 25 },
];
const ASK_LEVELS: OrderLevel[] = [
  { price: '182.46', size: '2,800', total: '510,888', depth: 80 },
  { price: '182.47', size: '1,500', total: '273,705', depth: 65 },
  { price: '182.48', size: '4,200', total: '766,416', depth: 50 },
  { price: '182.49', size: '900', total: '164,241', depth: 35 },
  { price: '182.50', size: '6,000', total: '1,095,000', depth: 20 },
];
const INSTRUMENT_OPTIONS = [
  { label: 'AAPL', value: 'aapl' },
  { label: 'GOOGL', value: 'googl' },
  { label: 'MSFT', value: 'msft' },
  { label: 'TSLA', value: 'tsla' },
];
const TIME_FRAME_OPTIONS = [
  { label: '1 Minute', value: '1m' },
  { label: '5 Minutes', value: '5m' },
  { label: '1 Hour', value: '1h' },
  { label: '1 Day', value: '1d' },
  { label: '1 Week', value: '1w' },
];
const POSITIONS: Position[] = [
  { symbol: 'AAPL', qty: 500, price: 182.45, pnl: 1234.56 },
  { symbol: 'GOOGL', qty: 200, price: 141.82, pnl: -567.89 },
  { symbol: 'MSFT', qty: 350, price: 378.91, pnl: 891.23 },
  { symbol: 'TSLA', qty: 100, price: 248.12, pnl: -234.56 },
  { symbol: 'AMZN', qty: 150, price: 178.65, pnl: 456.78 },
];

@Component({
  selector: 'app-design-system',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe, FormsModule, ButtonModule, InputTextModule, SelectModule, ToggleSwitchModule,
    TagModule, DividerModule, AccordionModule, MessageModule, AvatarModule,
    CheckboxModule, RadioButtonModule, ProgressBarModule, SliderModule,
    TableModule, TextareaModule, SelectButtonModule, ToggleButtonModule, MenuModule,
    SkeletonModule, DatePickerModule,
  ],
  template: `
    <div class="space-y-8">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Design System</h2>
        <p class="text-muted-foreground">Visual reference for all MarketsUI design tokens and component patterns.</p>
      </div>

      <!-- A. Color Palette -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
            <h3 class="card-title">Color Palette</h3>
          </div>
          <p class="card-desc">Semantic color tokens using HSL channel format. All colors adapt between light and dark themes.</p>
        </div>
        <div class="card-content space-y-8">
          <div>
            <h4 class="mb-4 text-sm font-semibold">Semantic Colors</h4>
            <div class="flex flex-wrap gap-6">
              @for (c of semanticColors; track c.name) {
                <div class="flex flex-col items-center gap-2">
                  <div class="swatch" [style.background-color]="'hsl(var(' + c.cssVar + '))'"></div>
                  <div class="text-center">
                    <p class="text-xs font-medium">{{ c.name }}</p>
                    <p class="font-mono swatch-var">{{ c.cssVar }}</p>
                  </div>
                </div>
              }
            </div>
          </div>
          <hr class="border-border" />
          <div>
            <h4 class="mb-4 text-sm font-semibold">Trading Colors</h4>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
              @for (c of tradingColors; track c.name) {
                <div class="flex items-center gap-3">
                  <div class="trading-swatch" [style.background-color]="'hsl(var(' + c.cssVar + '))'"></div>
                  <div>
                    <p class="text-sm font-medium">{{ c.name }}</p>
                    <p class="font-mono text-xs text-muted-foreground">{{ c.cssVar }}</p>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- B. Typography -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
            <h3 class="card-title">Typography</h3>
          </div>
          <p class="card-desc">Font families, sizes, and weights from the design language tokens.</p>
        </div>
        <div class="card-content space-y-8">
          <div>
            <h4 class="mb-4 text-sm font-semibold">Font Families</h4>
            <div class="space-y-4">
              <div class="rounded-lg border border-border p-4">
                <p class="mb-1 text-xs font-medium text-muted-foreground">Body &mdash; DM Sans</p>
                <p style="font-family: var(--mdl-font-family); font-size: 16px">The quick brown fox jumps over the lazy dog. 0123456789</p>
              </div>
              <div class="rounded-lg border border-border p-4">
                <p class="mb-1 text-xs font-medium text-muted-foreground">Mono &mdash; JetBrains Mono</p>
                <p style="font-family: var(--mdl-font-mono); font-size: 16px">1,234.56 &nbsp; -789.01 &nbsp; AAPL &nbsp; 0xDEADBEEF</p>
              </div>
            </div>
          </div>
          <hr class="border-border" />
          <div>
            <h4 class="mb-4 text-sm font-semibold">Font Sizes</h4>
            <div class="space-y-3">
              @for (fs of fontSizes; track fs.label) {
                <div class="flex items-baseline gap-4">
                  <div class="w-16 shrink-0 text-right">
                    <span class="font-mono text-xs text-muted-foreground">{{ fs.label }}</span>
                  </div>
                  <p [style.font-size]="fs.size">The quick brown fox jumps over the lazy dog.</p>
                </div>
              }
            </div>
          </div>
          <hr class="border-border" />
          <div>
            <h4 class="mb-4 text-sm font-semibold">Heading Weights</h4>
            <div class="space-y-3">
              @for (fw of fontWeights; track fw.weight) {
                <div class="flex items-baseline gap-4">
                  <div class="w-24 shrink-0 text-right">
                    <span class="font-mono text-xs text-muted-foreground">{{ fw.weight }} &mdash; {{ fw.label }}</span>
                  </div>
                  <p class="text-lg" [style.font-weight]="fw.weight">MarketsUI Design System</p>
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- C. Spacing & Sizing -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>
            <h3 class="card-title">Spacing &amp; Sizing</h3>
          </div>
          <p class="card-desc">Height, padding, and border-radius tokens.</p>
        </div>
        <div class="card-content space-y-8">
          <div>
            <h4 class="mb-4 text-sm font-semibold">Height Tokens</h4>
            <div class="space-y-3">
              @for (h of heights; track h.label) {
                <div class="flex items-center gap-4">
                  <div class="w-28 shrink-0 text-right">
                    <span class="font-mono text-xs text-muted-foreground">{{ h.label }}</span>
                  </div>
                  <div class="height-bar" [style.height]="h.value"></div>
                </div>
              }
            </div>
          </div>
          <hr class="border-border" />
          <div>
            <h4 class="mb-4 text-sm font-semibold">Padding Tokens</h4>
            <div class="space-y-3">
              @for (p of paddings; track p.label) {
                <div class="flex items-center gap-4">
                  <div class="w-28 shrink-0 text-right">
                    <span class="font-mono text-xs text-muted-foreground">{{ p.label }} ({{ p.value }})</span>
                  </div>
                  <div class="inline-flex items-center rounded-md border border-dashed padding-outer">
                    <div class="padding-inner font-mono text-xs flex items-center justify-center"
                      [style.padding]="p.label.includes('y') ? p.value + ' 12px' : '8px ' + p.value"
                      style="min-height: 32px">
                      {{ p.value }}
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
          <hr class="border-border" />
          <div>
            <h4 class="mb-4 text-sm font-semibold">Border Radius</h4>
            <div class="flex flex-wrap gap-6">
              @for (r of radii; track r.label) {
                <div class="flex flex-col items-center gap-2">
                  <div class="radius-box" [style.border-radius]="r.value"></div>
                  <div class="text-center">
                    <p class="text-xs font-medium">{{ r.label.split(' ')[0] }}</p>
                    <p class="font-mono swatch-var">{{ r.label.split('(')[1]?.replace(')', '') }}</p>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- D. Component Showcase -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 8.5 9 12l-3.5 3.5L2 12l3.5-3.5Z"/><path d="m12 2 3.5 3.5L12 9 8.5 5.5 12 2Z"/><path d="M18.5 8.5 22 12l-3.5 3.5L15 12l3.5-3.5Z"/><path d="m12 15 3.5 3.5L12 22l-3.5-3.5L12 15Z"/></svg>
            <h3 class="card-title">Component Showcase</h3>
          </div>
          <p class="card-desc">PrimeNG components styled with MarketsUI tokens.</p>
        </div>
        <div class="card-content space-y-8">
          <!-- Buttons -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">Buttons</h4>
            <div class="flex flex-wrap gap-3">
              <button pButton label="Primary"></button>
              <button pButton label="Secondary" severity="secondary" class="secondary-btn"></button>
              <button pButton label="Destructive" severity="danger"></button>
              <button pButton label="Outline" [outlined]="true" class="outlined-btn"></button>
              <button pButton label="Ghost" [text]="true" class="ghost-btn"></button>
              <button pButton label="Link" [text]="true" class="link-btn"></button>
              <button pButton label="Disabled" [disabled]="true"></button>
            </div>
            <div class="mt-3 flex flex-wrap gap-3">
              <button pButton label="Small" size="small"></button>
              <button pButton label="Default"></button>
              <button pButton label="Large" size="large"></button>
              <button pButton icon="pi pi-arrow-up-right" size="small" class="icon-only-btn"></button>
            </div>
          </div>
          <hr class="border-border" />

          <!-- Inputs -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">Inputs</h4>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <label class="text-sm font-medium">Default</label>
                <input pInputText placeholder="Enter text..." class="w-full" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">With Value</label>
                <input pInputText value="Hello World" class="w-full" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">Disabled</label>
                <input pInputText placeholder="Disabled input" disabled class="w-full" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">Numeric (Mono)</label>
                <input pInputText value="1,234.56" class="w-full font-mono" style="font-family: var(--mdl-font-mono)" />
              </div>
            </div>
          </div>
          <hr class="border-border" />

          <!-- Selects -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">Selects</h4>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <label class="text-sm font-medium">Instrument</label>
                <p-select [options]="instrumentOptions" [(ngModel)]="selectedInstrument" optionLabel="label" optionValue="value" styleClass="w-full" />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium">Time Frame</label>
                <p-select [options]="timeFrameOptions" [(ngModel)]="selectedTimeFrame" optionLabel="label" optionValue="value" styleClass="w-full" />
              </div>
            </div>
          </div>
          <hr class="border-border" />

          <!-- Switches -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">Switches</h4>
            <div class="flex flex-wrap gap-8">
              <div class="flex items-center gap-2">
                <p-toggleswitch [(ngModel)]="switchEnabled" />
                <label class="text-sm">Enabled</label>
              </div>
              <div class="flex items-center gap-2">
                <p-toggleswitch [(ngModel)]="switchDisabled" />
                <label class="text-sm">Disabled</label>
              </div>
            </div>
          </div>
          <hr class="border-border" />

          <!-- Badges / Tags -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">Badges</h4>
            <div class="flex flex-wrap items-center gap-3">
              <p-tag value="Default" />
              <p-tag value="Secondary" severity="secondary" />
              <p-tag value="Destructive" severity="danger" />
              <p-tag value="Outline" [style]="outlineTagStyle" />
            </div>
          </div>
          <hr class="border-border" />

          <!-- Cards -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">Cards</h4>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="inner-card">
                <div class="inner-card-header">
                  <h5 class="text-base font-semibold">Card Title</h5>
                  <p class="text-sm text-muted-foreground">Card description goes here.</p>
                </div>
                <div class="inner-card-content">
                  <p class="text-sm text-muted-foreground">This is an example card with header, content, and footer sections.</p>
                </div>
                <div class="inner-card-footer">
                  <button pButton label="Action" size="small"></button>
                </div>
              </div>
              <div class="inner-card">
                <div class="inner-card-header">
                  <h5 class="text-base font-semibold">Market Summary</h5>
                  <p class="text-sm text-muted-foreground">Real-time overview</p>
                </div>
                <div class="inner-card-content">
                  <div class="space-y-2 font-mono text-sm">
                    <div class="flex justify-between">
                      <span>AAPL</span>
                      <span class="text-pnl-positive">+2.34%</span>
                    </div>
                    <div class="flex justify-between">
                      <span>GOOGL</span>
                      <span class="text-pnl-negative">-1.12%</span>
                    </div>
                    <div class="flex justify-between">
                      <span>MSFT</span>
                      <span class="text-pnl-positive">+0.87%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- E. Trading Colors Demo -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
            <h3 class="card-title">Trading Colors Demo</h3>
          </div>
          <p class="card-desc">Live trading UI patterns using bid, ask, flash, and P&amp;L color tokens.</p>
        </div>
        <div class="card-content space-y-8">
          <!-- Order Book -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">Order Book</h4>
            <div class="rounded-lg border border-border overflow-hidden">
              <!-- Header -->
              <div class="grid grid-cols-3 gap-4 border-b border-border bg-muted/50 px-4 py-2">
                <span class="text-xs font-medium text-muted-foreground">Price</span>
                <span class="text-xs font-medium text-muted-foreground text-right">Size</span>
                <span class="text-xs font-medium text-muted-foreground text-right">Total</span>
              </div>
              <!-- Asks (reversed so highest on top) -->
              <div class="divide-y divide-border/50">
                @for (row of askLevelsReversed; track row.price) {
                  <div class="relative grid grid-cols-3 gap-4 px-4 py-1.5">
                    <div class="absolute inset-0 opacity-10"
                      [style.background]="row.gradient"></div>
                    <span class="relative font-mono text-sm text-ask">{{ row.price }}</span>
                    <span class="relative font-mono text-sm text-right">{{ row.size }}</span>
                    <span class="relative font-mono text-sm text-right text-muted-foreground">{{ row.total }}</span>
                  </div>
                }
              </div>
              <!-- Spread -->
              <div class="border-y border-border bg-muted/30 px-4 py-2 text-center">
                <span class="font-mono text-sm font-semibold">182.455</span>
                <span class="ml-2 text-xs text-muted-foreground">Spread: 0.01 (0.005%)</span>
              </div>
              <!-- Bids -->
              <div class="divide-y divide-border/50">
                @for (row of bidLevels; track row.price) {
                  <div class="relative grid grid-cols-3 gap-4 px-4 py-1.5">
                    <div class="absolute inset-0 opacity-10"
                      [style.background]="row.gradient"></div>
                    <span class="relative font-mono text-sm text-bid">{{ row.price }}</span>
                    <span class="relative font-mono text-sm text-right">{{ row.size }}</span>
                    <span class="relative font-mono text-sm text-right text-muted-foreground">{{ row.total }}</span>
                  </div>
                }
              </div>
            </div>
          </div>

          <hr class="border-border" />

          <!-- P&L Display -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">P&amp;L Display</h4>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-lg border border-border p-4">
                <p class="text-xs text-muted-foreground mb-1">Unrealized P&amp;L</p>
                <div class="flex items-center gap-2">
                  <svg class="h-5 w-5" style="color: hsl(var(--mdl-pnl-positive))" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                  <span class="font-mono text-2xl font-semibold" style="color: hsl(var(--mdl-pnl-positive))">+$1,234.56</span>
                </div>
                <p class="font-mono text-sm mt-1" style="color: hsl(var(--mdl-pnl-positive))">+2.34%</p>
              </div>
              <div class="rounded-lg border border-border p-4">
                <p class="text-xs text-muted-foreground mb-1">Realized P&amp;L</p>
                <div class="flex items-center gap-2">
                  <svg class="h-5 w-5" style="color: hsl(var(--mdl-pnl-negative))" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>
                  <span class="font-mono text-2xl font-semibold" style="color: hsl(var(--mdl-pnl-negative))">-$567.89</span>
                </div>
                <p class="font-mono text-sm mt-1" style="color: hsl(var(--mdl-pnl-negative))">-1.07%</p>
              </div>
            </div>
          </div>

          <hr class="border-border" />

          <!-- Flash Animation Demo -->
          <div>
            <h4 class="mb-4 text-sm font-semibold">Flash Animation</h4>
            <p class="mb-4 text-sm text-muted-foreground">Price tick animations using CSS keyframes with flash-up (green) and flash-down (red) tokens.</p>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-lg border border-border p-4 text-center">
                <p class="text-xs text-muted-foreground mb-2">Flash Up (Price Increase)</p>
                <div class="flash-up-demo rounded-md px-4 py-3">
                  <span class="font-mono text-xl font-semibold">182.46</span>
                  <svg class="inline-block ml-1 h-4 w-4" style="color: hsl(var(--mdl-flash-up))" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>
                </div>
              </div>
              <div class="rounded-lg border border-border p-4 text-center">
                <p class="text-xs text-muted-foreground mb-2">Flash Down (Price Decrease)</p>
                <div class="flash-down-demo rounded-md px-4 py-3">
                  <span class="font-mono text-xl font-semibold">182.44</span>
                  <svg class="inline-block ml-1 h-4 w-4" style="color: hsl(var(--mdl-flash-down))" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 7 10 10"/><path d="M17 7v10H7"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- F. Accordion -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
            <h3 class="card-title">Accordion</h3>
          </div>
          <p class="card-desc">Collapsible content panels for organizing information.</p>
        </div>
        <div class="card-content">
          <p-accordion>
            <p-accordion-panel value="0">
              <p-accordion-header>What is MarketsUI?</p-accordion-header>
              <p-accordion-content>
                <p class="text-sm text-muted-foreground">
                  MarketsUI is a design system and component library purpose-built for
                  financial trading applications. It provides themed, accessible UI
                  primitives with trading-specific color tokens for bid/ask, P&amp;L, and
                  price flash animations.
                </p>
              </p-accordion-content>
            </p-accordion-panel>
            <p-accordion-panel value="1">
              <p-accordion-header>How does theming work?</p-accordion-header>
              <p-accordion-content>
                <p class="text-sm text-muted-foreground">
                  Theming uses HSL CSS custom properties that adapt between light and
                  dark modes. All shadcn/ui components automatically pick up theme
                  changes through Tailwind utility classes that reference these
                  semantic tokens.
                </p>
              </p-accordion-content>
            </p-accordion-panel>
            <p-accordion-panel value="2">
              <p-accordion-header>What trading data providers are supported?</p-accordion-header>
              <p-accordion-content>
                <p class="text-sm text-muted-foreground">
                  MarketsUI is provider-agnostic. It works with any data feed
                  including Bloomberg, Refinitiv, OpenFin, and custom WebSocket
                  streams. The component layer is decoupled from the data layer.
                </p>
              </p-accordion-content>
            </p-accordion-panel>
          </p-accordion>
        </div>
      </div>

      <!-- G. Alert / Message -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            <h3 class="card-title">Alert</h3>
          </div>
          <p class="card-desc">Contextual feedback messages for user actions.</p>
        </div>
        <div class="card-content space-y-4">
          <p-message severity="info">
            <span class="font-semibold">Market Data Connected</span> &mdash;
            Real-time feed is active. You are receiving live price updates for
            all subscribed instruments.
          </p-message>
          <p-message severity="error">
            <span class="font-semibold">Connection Lost</span> &mdash;
            The market data feed has been disconnected. Prices shown may be
            stale. Attempting to reconnect...
          </p-message>
        </div>
      </div>

      <!-- H. Avatar -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 8.5 9 12l-3.5 3.5L2 12l3.5-3.5Z"/><path d="m12 2 3.5 3.5L12 9 8.5 5.5 12 2Z"/><path d="M18.5 8.5 22 12l-3.5 3.5L15 12l3.5-3.5Z"/><path d="m12 15 3.5 3.5L12 22l-3.5-3.5L12 15Z"/></svg>
            <h3 class="card-title">Avatar</h3>
          </div>
          <p class="card-desc">User profile images with fallback initials.</p>
        </div>
        <div class="card-content">
          <div class="flex gap-4">
            @for (a of avatars; track a.initials) {
              <p-avatar [label]="a.initials" shape="circle" [style]="{ 'background-color': a.bg, color: '#fff' }" />
            }
          </div>
        </div>
      </div>

      <!-- I. Checkbox & Radio Group -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>
            <h3 class="card-title">Checkbox &amp; Radio Group</h3>
          </div>
          <p class="card-desc">Selection controls for forms and settings.</p>
        </div>
        <div class="card-content space-y-8">
          <div>
            <h4 class="mb-4 text-sm font-semibold">Checkboxes</h4>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <p-checkbox [(ngModel)]="cbTerms" [binary]="true" inputId="cb-terms" />
                <label for="cb-terms" class="text-sm">Accept terms</label>
              </div>
              <div class="flex items-center gap-2">
                <p-checkbox [(ngModel)]="cbNotifications" [binary]="true" inputId="cb-notif" />
                <label for="cb-notif" class="text-sm">Enable notifications</label>
              </div>
              <div class="flex items-center gap-2">
                <p-checkbox [(ngModel)]="cbAutoSave" [binary]="true" inputId="cb-autosave" />
                <label for="cb-autosave" class="text-sm">Auto-save</label>
              </div>
            </div>
          </div>
          <hr class="border-border" />
          <div>
            <h4 class="mb-4 text-sm font-semibold">Radio Group</h4>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <p-radioButton name="dataFeed" value="realtime" [(ngModel)]="radioFeed" inputId="r-rt" />
                <label for="r-rt" class="text-sm">Realtime</label>
              </div>
              <div class="flex items-center gap-2">
                <p-radioButton name="dataFeed" value="delayed" [(ngModel)]="radioFeed" inputId="r-del" />
                <label for="r-del" class="text-sm">Delayed</label>
              </div>
              <div class="flex items-center gap-2">
                <p-radioButton name="dataFeed" value="eod" [(ngModel)]="radioFeed" inputId="r-eod" />
                <label for="r-eod" class="text-sm">End of Day</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- J. Progress & Slider -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>
            <h3 class="card-title">Progress &amp; Slider</h3>
          </div>
          <p class="card-desc">Visual indicators for progress and range selection.</p>
        </div>
        <div class="card-content space-y-8">
          <div>
            <h4 class="mb-4 text-sm font-semibold">Progress</h4>
            <div class="space-y-2">
              <p-progressBar [value]="65" />
              <p class="text-xs text-muted-foreground">65% complete</p>
            </div>
          </div>
          <hr class="border-border" />
          <div>
            <h4 class="mb-4 text-sm font-semibold">Slider</h4>
            <div class="space-y-2">
              <p-slider [(ngModel)]="sliderValue" [max]="100" [step]="1" styleClass="w-full" />
              <p class="text-xs text-muted-foreground">Value: {{ sliderValue }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- K. Table -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>
            <h3 class="card-title">Table</h3>
          </div>
          <p class="card-desc">Data tables for displaying positions and trading data.</p>
        </div>
        <div class="card-content">
          <p-table [value]="positions" [tableStyle]="{ 'min-width': '100%' }">
            <ng-template #header>
              <tr>
                <th>Symbol</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Price</th>
                <th class="text-right">P&amp;L</th>
              </tr>
            </ng-template>
            <ng-template #body let-pos>
              <tr>
                <td class="font-medium font-mono">{{ pos.symbol }}</td>
                <td class="text-right font-mono">{{ pos.qty | number }}</td>
                <td class="text-right font-mono">{{ pos.price | number:'1.2-2' }}</td>
                <td class="text-right font-mono font-medium"
                    [class.text-pnl-positive]="pos.pnl >= 0"
                    [class.text-pnl-negative]="pos.pnl < 0">
                  {{ pos.pnl >= 0 ? '+' : '' }}{{ pos.pnl | number:'1.2-2' }}
                </td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      </div>

      <!-- L. Textarea -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <h3 class="card-title">Textarea</h3>
          </div>
          <p class="card-desc">Multi-line text input for notes and comments.</p>
        </div>
        <div class="card-content">
          <div class="space-y-2">
            <label class="text-sm font-medium">Trading Notes</label>
            <textarea pTextarea rows="4" placeholder="Enter trading notes..." class="w-full"></textarea>
          </div>
        </div>
      </div>

      <!-- M. Toggle & Toggle Group -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="8" cy="12" r="2"/></svg>
            <h3 class="card-title">Toggle &amp; Toggle Group</h3>
          </div>
          <p class="card-desc">Pressable buttons for toggling options on and off.</p>
        </div>
        <div class="card-content space-y-8">
          <div>
            <h4 class="mb-4 text-sm font-semibold">Single Toggle</h4>
            <p-toggleButton [(ngModel)]="toggleBold" onIcon="pi pi-bold" offIcon="pi pi-bold" class="toggle-single" />
          </div>
          <hr class="border-border" />
          <div>
            <h4 class="mb-4 text-sm font-semibold">Toggle Group</h4>
            <p-selectButton [options]="timePeriods" [(ngModel)]="selectedPeriod" optionLabel="label" optionValue="value" />
          </div>
        </div>
      </div>

      <!-- N. Dropdown Menu -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            <h3 class="card-title">Dropdown Menu</h3>
          </div>
          <p class="card-desc">Contextual menus for actions and navigation.</p>
        </div>
        <div class="card-content">
          <button pButton label="Actions" [outlined]="true" class="outlined-btn" icon="pi pi-ellipsis-h" (click)="menu.toggle($event)"></button>
          <p-menu #menu [model]="menuItems" [popup]="true" />
        </div>
      </div>

      <!-- O. Skeleton -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <svg class="h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <h3 class="card-title">Skeleton</h3>
          </div>
          <p class="card-desc">Placeholder loading states for content.</p>
        </div>
        <div class="card-content">
          <div class="flex items-center gap-4">
            <p-skeleton shape="circle" size="3rem" />
            <div class="space-y-2">
              <p-skeleton width="250px" height="1rem" />
              <p-skeleton width="200px" height="1rem" />
            </div>
          </div>
          <div class="mt-4 space-y-3">
            <p-skeleton width="100%" height="1rem" />
            <p-skeleton width="80%" height="1rem" />
            <p-skeleton width="120px" height="2.5rem" borderRadius="6px" />
          </div>
        </div>
      </div>

      <!-- P. Calendar & DatePicker -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title text-lg">Calendar &amp; Date Picker</h3>
          <p class="card-desc">Date selection with calendar popover</p>
        </div>
        <div class="card-content">
          <div class="flex flex-wrap gap-8">
            <div>
              <p class="text-sm font-medium mb-3 text-muted-foreground">Calendar</p>
              <p-datePicker [inline]="true" [(ngModel)]="calendarDate" />
            </div>
            <div class="space-y-4">
              <div>
                <p class="text-sm font-medium mb-3 text-muted-foreground">Date Picker</p>
                <p-datePicker [(ngModel)]="datePickerEmpty" placeholder="Select trade date" />
              </div>
              <div>
                <p class="text-sm font-medium mb-3 text-muted-foreground">Date Picker (with date)</p>
                <p-datePicker [(ngModel)]="datePickerFilled" placeholder="Settlement date" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .card { border-radius: var(--mdl-radius, 0.5rem); border: 1px solid hsl(var(--border)); background: hsl(var(--card)); color: hsl(var(--card-foreground)); box-shadow: 0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1); }
    .card-header { display: flex; flex-direction: column; gap: 6px; padding: 24px; }
    .card-title { font-size: 18px; font-weight: 600; line-height: 1; letter-spacing: -0.025em; }
    .card-desc { font-size: 14px; color: hsl(var(--muted-foreground)); }
    .card-content { padding: 0 24px 24px; }

    .inner-card { border-radius: var(--mdl-radius, 0.5rem); border: 1px solid hsl(var(--border)); background: hsl(var(--card)); }
    .inner-card-header { padding: 24px; padding-bottom: 0; }
    .inner-card-content { padding: 16px 24px; }
    .inner-card-footer { padding: 0 24px 24px; }

    .swatch { width: 48px; height: 48px; border-radius: 8px; border: 1px solid hsl(var(--border)); box-shadow: 0 1px 2px 0 rgba(0,0,0,.05); }
    .swatch-var { font-size: 10px; color: hsl(var(--muted-foreground)); }
    .trading-swatch { width: 32px; height: 32px; border-radius: 6px; border: 1px solid hsl(var(--border)); }

    .height-bar { width: 100%; max-width: 240px; background: hsl(var(--primary) / 0.2); border: 1px solid hsl(var(--primary) / 0.3); border-radius: 6px; }
    .radius-box { width: 64px; height: 64px; border: 2px solid hsl(var(--primary)); background: hsl(var(--primary) / 0.1); }

    .padding-outer { border-color: hsl(var(--primary) / 0.4); background: hsl(var(--primary) / 0.05); }
    .padding-inner { background: hsl(var(--primary) / 0.2); color: hsl(var(--primary)); }

    .text-bid { color: hsl(var(--mdl-bid)); }
    .text-ask { color: hsl(var(--mdl-ask)); }
    .text-pnl-positive { color: hsl(var(--mdl-pnl-positive)); }
    .text-pnl-negative { color: hsl(var(--mdl-pnl-negative)); }

    :host ::ng-deep .outlined-btn.p-button { background: transparent; border-color: hsl(var(--input)); color: hsl(var(--foreground)); }
    :host ::ng-deep .outlined-btn.p-button:hover { background: hsl(var(--secondary)); }
    :host ::ng-deep .ghost-btn.p-button { background: transparent; border-color: transparent; color: hsl(var(--foreground)); }
    :host ::ng-deep .ghost-btn.p-button:hover { background: hsl(var(--secondary)); }
    :host ::ng-deep .secondary-btn.p-button { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); border-color: hsl(var(--secondary)); }
    :host ::ng-deep .secondary-btn.p-button:hover { background: hsl(var(--secondary) / 0.8); }
    :host ::ng-deep .link-btn.p-button { background: transparent; border-color: transparent; color: hsl(var(--primary)); text-decoration: underline; }
    :host ::ng-deep .icon-only-btn.p-button { width: 2.25rem; height: 2.25rem; padding: 0; }

    :host ::ng-deep .toggle-single .p-togglebutton { background: transparent; border-color: hsl(var(--input)); color: hsl(var(--foreground)); }
    :host ::ng-deep .toggle-single .p-togglebutton.p-togglebutton-checked { background: hsl(var(--accent)); }

    :host ::ng-deep .close-position-item { color: hsl(var(--destructive)) !important; }
  `],
})
export class DesignSystemComponent {
  readonly outlineTagStyle = { background: 'transparent', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' } as const;

  semanticColors = SEMANTIC_COLORS;
  tradingColors = TRADING_COLORS;
  fontSizes = FONT_SIZES;
  fontWeights = FONT_WEIGHTS;
  heights = HEIGHTS;
  paddings = PADDINGS;
  radii = RADII;
  bidLevels = BID_LEVELS.map(row => ({ ...row, gradient: `linear-gradient(to left, hsl(var(--mdl-bid)) ${row.depth}%, transparent ${row.depth}%)` }));
  askLevels = ASK_LEVELS.map(row => ({ ...row, gradient: `linear-gradient(to left, hsl(var(--mdl-ask)) ${row.depth}%, transparent ${row.depth}%)` }));
  askLevelsReversed = [...this.askLevels].reverse();
  instrumentOptions = INSTRUMENT_OPTIONS;
  timeFrameOptions = TIME_FRAME_OPTIONS;
  positions = POSITIONS;

  /* Switch states */
  switchEnabled = true;
  switchDisabled = false;

  /* Checkbox states — match React: terms=false, notifications=true, autosave=false */
  cbTerms = false;
  cbNotifications = true;
  cbAutoSave = false;

  /* Radio state */
  radioFeed = 'realtime';

  /* Slider state */
  sliderValue = 40;

  /* Select states */
  selectedInstrument = 'aapl';
  selectedTimeFrame = '1d';

  /* Toggle bold */
  toggleBold = false;

  /* Avatar data */
  avatars = [
    { initials: 'OM', bg: '#2563eb' },
    { initials: 'JL', bg: '#059669' },
    { initials: 'IN', bg: '#d97706' },
    { initials: 'WK', bg: '#7c3aed' },
  ];

  /* Toggle Group / Select Button */
  timePeriods = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '1M', value: '1M' },
  ];
  selectedPeriod = '1D';

  /* Dropdown Menu items */
  menuItems = [
    { label: 'Position Actions', separator: false, disabled: true, styleClass: 'menu-label' },
    { separator: true },
    { label: 'View Details' },
    { label: 'Edit Position' },
    { separator: true },
    { label: 'Close Position', styleClass: 'close-position-item' },
  ];

  /* Calendar & DatePicker state */
  calendarDate: Date | null = null;
  datePickerEmpty: Date | null = null;
  datePickerFilled: Date | null = new Date();
}
