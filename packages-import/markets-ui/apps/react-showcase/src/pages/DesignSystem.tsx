import { useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Type,
  Palette,
  Ruler,
  Component,
  BarChart3,
  Terminal,
  AlertCircle,
  Bold,
  ChevronDown,
  MoreHorizontal,
  Layers,
  ListChecks,
  SlidersHorizontal,
  TableIcon,
  MessageSquare,
  ToggleLeft,
  Menu,
  Loader2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../components/ui/accordion";
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Checkbox } from "../components/ui/checkbox";
import { Progress } from "../components/ui/progress";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Skeleton } from "../components/ui/skeleton";
import { Calendar } from "../components/ui/calendar";
import { DatePicker } from "../components/ui/date-picker";
import { Slider } from "../components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { Toggle } from "../components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "../components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Color Swatch
// ---------------------------------------------------------------------------

interface ColorSwatchProps {
  label: string;
  cssVar: string;
  /** If true, renders white text on the swatch */
  lightText?: boolean;
}

function ColorSwatch({ label, cssVar, lightText }: ColorSwatchProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="h-12 w-12 rounded-lg border border-border shadow-sm"
        style={{ backgroundColor: `hsl(var(${cssVar}))` }}
      />
      <div className="text-center">
        <p className="text-xs font-medium">{label}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{cssVar}</p>
      </div>
    </div>
  );
}

function TradingColorSwatch({ label, cssVar }: { label: string; cssVar: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-8 w-8 rounded-md border border-border"
        style={{ backgroundColor: `hsl(var(${cssVar}))` }}
      />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="font-mono text-xs text-muted-foreground">{cssVar}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Color Palette
// ---------------------------------------------------------------------------

function ColorPaletteSection() {
  const semanticColors: ColorSwatchProps[] = [
    { label: "Background", cssVar: "--background" },
    { label: "Foreground", cssVar: "--foreground", lightText: true },
    { label: "Card", cssVar: "--card" },
    { label: "Primary", cssVar: "--primary", lightText: true },
    { label: "Secondary", cssVar: "--secondary" },
    { label: "Muted", cssVar: "--muted" },
    { label: "Accent", cssVar: "--accent" },
    { label: "Brand", cssVar: "--brand", lightText: true },
    { label: "Destructive", cssVar: "--destructive", lightText: true },
    { label: "Success", cssVar: "--success", lightText: true },
    { label: "Border", cssVar: "--border" },
    { label: "Input", cssVar: "--input" },
    { label: "Ring", cssVar: "--ring", lightText: true },
  ];

  const tradingColors = [
    { label: "Bid (Blue)", cssVar: "--mdl-bid" },
    { label: "Ask (Red)", cssVar: "--mdl-ask" },
    { label: "Flash Up", cssVar: "--mdl-flash-up" },
    { label: "Flash Down", cssVar: "--mdl-flash-down" },
    { label: "P&L Positive", cssVar: "--mdl-pnl-positive" },
    { label: "P&L Negative", cssVar: "--mdl-pnl-negative" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <CardTitle>Color Palette</CardTitle>
        </div>
        <CardDescription>
          Semantic color tokens using HSL channel format. All colors adapt between light and dark themes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Semantic Colors */}
        <div>
          <h4 className="mb-4 text-sm font-semibold text-foreground">Semantic Colors</h4>
          <div className="flex flex-wrap gap-6">
            {semanticColors.map((color) => (
              <ColorSwatch key={color.cssVar} {...color} />
            ))}
          </div>
        </div>

        <Separator />

        {/* Trading Colors */}
        <div>
          <h4 className="mb-4 text-sm font-semibold text-foreground">Trading Colors</h4>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {tradingColors.map((color) => (
              <TradingColorSwatch key={color.cssVar} {...color} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Typography
// ---------------------------------------------------------------------------

function TypographySection() {
  const fontSizes = [
    { label: "xs", size: "11px", var: "--mdl-font-xs" },
    { label: "sm", size: "13px", var: "--mdl-font-sm" },
    { label: "base", size: "14px", var: "--mdl-font-base" },
    { label: "lg", size: "16px", var: "--mdl-font-lg" },
    { label: "xl", size: "18px", var: "--mdl-font-xl" },
  ];

  const fontWeights = [
    { label: "Light", weight: 300 },
    { label: "Regular", weight: 400 },
    { label: "Medium", weight: 500 },
    { label: "Semi Bold", weight: 600 },
    { label: "Bold", weight: 700 },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Type className="h-5 w-5 text-primary" />
          <CardTitle>Typography</CardTitle>
        </div>
        <CardDescription>
          Font families, sizes, and weights from the design language tokens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Font Families */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Font Families</h4>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Body &mdash; DM Sans</p>
              <p style={{ fontFamily: "var(--mdl-font-family)", fontSize: "16px" }}>
                The quick brown fox jumps over the lazy dog. 0123456789
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Mono &mdash; JetBrains Mono
              </p>
              <p style={{ fontFamily: "var(--mdl-font-mono)", fontSize: "16px" }}>
                1,234.56 &nbsp; -789.01 &nbsp; AAPL &nbsp; 0xDEADBEEF
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Font Sizes */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Font Sizes</h4>
          <div className="space-y-3">
            {fontSizes.map((fs) => (
              <div key={fs.label} className="flex items-baseline gap-4">
                <div className="w-16 shrink-0 text-right">
                  <span className="font-mono text-xs text-muted-foreground">
                    {fs.label} ({fs.size})
                  </span>
                </div>
                <p style={{ fontSize: `var(${fs.var})` }}>
                  The quick brown fox jumps over the lazy dog.
                </p>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Font Weights */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Heading Weights</h4>
          <div className="space-y-3">
            {fontWeights.map((fw) => (
              <div key={fw.weight} className="flex items-baseline gap-4">
                <div className="w-24 shrink-0 text-right">
                  <span className="font-mono text-xs text-muted-foreground">
                    {fw.weight} &mdash; {fw.label}
                  </span>
                </div>
                <p className="text-lg" style={{ fontWeight: fw.weight }}>
                  MarketsUI Design System
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Spacing & Sizing
// ---------------------------------------------------------------------------

function SpacingSizingSection() {
  const heights = [
    { label: "sm", value: "28px", var: "--mdl-height-sm" },
    { label: "default", value: "36px", var: "--mdl-height-default" },
    { label: "lg", value: "44px", var: "--mdl-height-lg" },
  ];

  const paddings = [
    { label: "padding-x", value: "12px", var: "--mdl-padding-x" },
    { label: "padding-x-lg", value: "16px", var: "--mdl-padding-x-lg" },
    { label: "padding-y", value: "8px", var: "--mdl-padding-y" },
  ];

  const radii = [
    { label: "sm", value: "6px", var: "--mdl-radius-sm" },
    { label: "md", value: "10px", var: "--mdl-radius-md" },
    { label: "lg", value: "14px", var: "--mdl-radius-lg" },
    { label: "xl", value: "18px", var: "--mdl-radius-xl" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-primary" />
          <CardTitle>Spacing & Sizing</CardTitle>
        </div>
        <CardDescription>Height, padding, and border-radius tokens.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Heights */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Height Tokens</h4>
          <div className="space-y-3">
            {heights.map((h) => (
              <div key={h.label} className="flex items-center gap-4">
                <div className="w-28 shrink-0 text-right">
                  <span className="font-mono text-xs text-muted-foreground">
                    {h.label} ({h.value})
                  </span>
                </div>
                <div
                  className="rounded-md bg-primary/20 border border-primary/30"
                  style={{ height: h.value, width: "100%", maxWidth: "240px" }}
                />
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Padding */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Padding Tokens</h4>
          <div className="space-y-3">
            {paddings.map((p) => (
              <div key={p.label} className="flex items-center gap-4">
                <div className="w-28 shrink-0 text-right">
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.label} ({p.value})
                  </span>
                </div>
                <div className="inline-flex items-center rounded-md border border-dashed border-primary/40 bg-primary/5">
                  <div
                    className="bg-primary/20 text-xs text-primary font-mono flex items-center justify-center"
                    style={{
                      padding: p.label.includes("y") ? `${p.value} 12px` : `8px ${p.value}`,
                      minHeight: "32px",
                    }}
                  >
                    {p.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Radius */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Border Radius</h4>
          <div className="flex flex-wrap gap-6">
            {radii.map((r) => (
              <div key={r.label} className="flex flex-col items-center gap-2">
                <div
                  className="h-16 w-16 border-2 border-primary bg-primary/10"
                  style={{ borderRadius: r.value }}
                />
                <div className="text-center">
                  <p className="text-xs font-medium">{r.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{r.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Component Showcase
// ---------------------------------------------------------------------------

function ComponentShowcaseSection() {
  const [switchOn, setSwitchOn] = useState(true);
  const [switchOff, setSwitchOff] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Component className="h-5 w-5 text-primary" />
          <CardTitle>Component Showcase</CardTitle>
        </div>
        <CardDescription>
          shadcn/ui components styled with MarketsUI tokens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Buttons */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Buttons</h4>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Inputs */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Inputs</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ds-default">Default</Label>
              <Input id="ds-default" placeholder="Enter text..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-with-value">With Value</Label>
              <Input id="ds-with-value" defaultValue="Hello World" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-disabled">Disabled</Label>
              <Input id="ds-disabled" disabled placeholder="Disabled input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-number">Numeric (Mono)</Label>
              <Input
                id="ds-number"
                defaultValue="1,234.56"
                className="font-mono"
                style={{ fontFamily: "var(--mdl-font-mono)" }}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Selects */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Selects</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Instrument</Label>
              <Select defaultValue="aapl">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aapl">AAPL</SelectItem>
                  <SelectItem value="googl">GOOGL</SelectItem>
                  <SelectItem value="msft">MSFT</SelectItem>
                  <SelectItem value="tsla">TSLA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Time Frame</Label>
              <Select defaultValue="1d">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">1 Minute</SelectItem>
                  <SelectItem value="5m">5 Minutes</SelectItem>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="1d">1 Day</SelectItem>
                  <SelectItem value="1w">1 Week</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* Switches */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Switches</h4>
          <div className="flex flex-wrap gap-8">
            <div className="flex items-center gap-2">
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} id="ds-switch-on" />
              <Label htmlFor="ds-switch-on">Enabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={switchOff} onCheckedChange={setSwitchOff} id="ds-switch-off" />
              <Label htmlFor="ds-switch-off">Disabled</Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Badges */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Badges</h4>
          <div className="flex flex-wrap gap-3">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </div>

        <Separator />

        {/* Cards */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Cards</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Card Title</CardTitle>
                <CardDescription>Card description goes here.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This is an example card with header, content, and footer sections.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Action</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Market Summary</CardTitle>
                <CardDescription>Real-time overview</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between">
                    <span>AAPL</span>
                    <span style={{ color: "hsl(var(--mdl-pnl-positive))" }}>+2.34%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GOOGL</span>
                    <span style={{ color: "hsl(var(--mdl-pnl-negative))" }}>-1.12%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>MSFT</span>
                    <span style={{ color: "hsl(var(--mdl-pnl-positive))" }}>+0.87%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Trading Colors Demo
// ---------------------------------------------------------------------------

const orderBookBids = [
  { price: "182.45", size: "1,200", total: "218,940", depth: 85 },
  { price: "182.44", size: "3,500", total: "638,540", depth: 70 },
  { price: "182.43", size: "800", total: "145,944", depth: 55 },
  { price: "182.42", size: "5,100", total: "930,342", depth: 40 },
  { price: "182.41", size: "2,300", total: "419,543", depth: 25 },
];

const orderBookAsks = [
  { price: "182.46", size: "2,800", total: "510,888", depth: 80 },
  { price: "182.47", size: "1,500", total: "273,705", depth: 65 },
  { price: "182.48", size: "4,200", total: "766,416", depth: 50 },
  { price: "182.49", size: "900", total: "164,241", depth: 35 },
  { price: "182.50", size: "6,000", total: "1,095,000", depth: 20 },
];

function TradingColorsDemoSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle>Trading Colors Demo</CardTitle>
        </div>
        <CardDescription>
          Live trading UI patterns using bid, ask, flash, and P&L color tokens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Order Book */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Order Book</h4>
          <div className="rounded-lg border border-border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-3 gap-4 border-b border-border bg-muted/50 px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">Price</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Size</span>
              <span className="text-xs font-medium text-muted-foreground text-right">Total</span>
            </div>

            {/* Asks (reversed so highest is on top) */}
            <div className="divide-y divide-border/50">
              {[...orderBookAsks].reverse().map((row) => (
                <div key={row.price} className="relative grid grid-cols-3 gap-4 px-4 py-1.5">
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      background: `linear-gradient(to left, hsl(var(--mdl-ask)) ${row.depth}%, transparent ${row.depth}%)`,
                    }}
                  />
                  <span
                    className="relative font-mono text-sm"
                    style={{ color: "hsl(var(--mdl-ask))" }}
                  >
                    {row.price}
                  </span>
                  <span className="relative font-mono text-sm text-right">{row.size}</span>
                  <span className="relative font-mono text-sm text-right text-muted-foreground">
                    {row.total}
                  </span>
                </div>
              ))}
            </div>

            {/* Spread */}
            <div className="border-y border-border bg-muted/30 px-4 py-2 text-center">
              <span className="font-mono text-sm font-semibold">182.455</span>
              <span className="ml-2 text-xs text-muted-foreground">Spread: 0.01 (0.005%)</span>
            </div>

            {/* Bids */}
            <div className="divide-y divide-border/50">
              {orderBookBids.map((row) => (
                <div key={row.price} className="relative grid grid-cols-3 gap-4 px-4 py-1.5">
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      background: `linear-gradient(to left, hsl(var(--mdl-bid)) ${row.depth}%, transparent ${row.depth}%)`,
                    }}
                  />
                  <span
                    className="relative font-mono text-sm"
                    style={{ color: "hsl(var(--mdl-bid))" }}
                  >
                    {row.price}
                  </span>
                  <span className="relative font-mono text-sm text-right">{row.size}</span>
                  <span className="relative font-mono text-sm text-right text-muted-foreground">
                    {row.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* P&L Display */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">P&L Display</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Unrealized P&L</p>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" style={{ color: "hsl(var(--mdl-pnl-positive))" }} />
                <span
                  className="font-mono text-2xl font-semibold"
                  style={{ color: "hsl(var(--mdl-pnl-positive))" }}
                >
                  +$1,234.56
                </span>
              </div>
              <p
                className="font-mono text-sm mt-1"
                style={{ color: "hsl(var(--mdl-pnl-positive))" }}
              >
                +2.34%
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Realized P&L</p>
              <div className="flex items-center gap-2">
                <TrendingDown
                  className="h-5 w-5"
                  style={{ color: "hsl(var(--mdl-pnl-negative))" }}
                />
                <span
                  className="font-mono text-2xl font-semibold"
                  style={{ color: "hsl(var(--mdl-pnl-negative))" }}
                >
                  -$567.89
                </span>
              </div>
              <p
                className="font-mono text-sm mt-1"
                style={{ color: "hsl(var(--mdl-pnl-negative))" }}
              >
                -1.07%
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Flash Animation Demo */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Flash Animation</h4>
          <p className="mb-4 text-sm text-muted-foreground">
            Price tick animations using CSS keyframes with flash-up (green) and flash-down (red) tokens.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">Flash Up (Price Increase)</p>
              <div className="flash-up-demo rounded-md px-4 py-3">
                <span className="font-mono text-xl font-semibold">182.46</span>
                <ArrowUpRight
                  className="inline-block ml-1 h-4 w-4"
                  style={{ color: "hsl(var(--mdl-flash-up))" }}
                />
              </div>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">Flash Down (Price Decrease)</p>
              <div className="flash-down-demo rounded-md px-4 py-3">
                <span className="font-mono text-xl font-semibold">182.44</span>
                <ArrowDownRight
                  className="inline-block ml-1 h-4 w-4"
                  style={{ color: "hsl(var(--mdl-flash-down))" }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Accordion
// ---------------------------------------------------------------------------

function AccordionSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <CardTitle>Accordion</CardTitle>
        </div>
        <CardDescription>
          Collapsible content panels for organizing information.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>What is MarketsUI?</AccordionTrigger>
            <AccordionContent>
              MarketsUI is a design system and component library purpose-built for
              financial trading applications. It provides themed, accessible UI
              primitives with trading-specific color tokens for bid/ask, P&L, and
              price flash animations.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>How does theming work?</AccordionTrigger>
            <AccordionContent>
              Theming uses HSL CSS custom properties that adapt between light and
              dark modes. All shadcn/ui components automatically pick up theme
              changes through Tailwind utility classes that reference these
              semantic tokens.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>
              What trading data providers are supported?
            </AccordionTrigger>
            <AccordionContent>
              MarketsUI is provider-agnostic. It works with any data feed
              including Bloomberg, Refinitiv, OpenFin, and custom WebSocket
              streams. The component layer is decoupled from the data layer.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Alert
// ---------------------------------------------------------------------------

function AlertSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-primary" />
          <CardTitle>Alert</CardTitle>
        </div>
        <CardDescription>
          Contextual feedback messages for user actions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>Market Data Connected</AlertTitle>
          <AlertDescription>
            Real-time feed is active. You are receiving live price updates for
            all subscribed instruments.
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Lost</AlertTitle>
          <AlertDescription>
            The market data feed has been disconnected. Prices shown may be
            stale. Attempting to reconnect...
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Avatar
// ---------------------------------------------------------------------------

function AvatarSection() {
  const avatars = [
    { initials: "OM", bg: "bg-blue-600" },
    { initials: "JL", bg: "bg-emerald-600" },
    { initials: "IN", bg: "bg-amber-600" },
    { initials: "WK", bg: "bg-violet-600" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Component className="h-5 w-5 text-primary" />
          <CardTitle>Avatar</CardTitle>
        </div>
        <CardDescription>
          User profile images with fallback initials.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          {avatars.map((a) => (
            <Avatar key={a.initials}>
              <AvatarFallback className={`${a.bg} text-white text-sm font-medium`}>
                {a.initials}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Checkbox & Radio Group
// ---------------------------------------------------------------------------

function CheckboxRadioSection() {
  const [terms, setTerms] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [autoSave, setAutoSave] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <CardTitle>Checkbox & Radio Group</CardTitle>
        </div>
        <CardDescription>
          Selection controls for forms and settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Checkboxes */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Checkboxes</h4>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="terms"
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
              />
              <Label htmlFor="terms">Accept terms</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="notifications"
                checked={notifications}
                onCheckedChange={(v) => setNotifications(v === true)}
              />
              <Label htmlFor="notifications">Enable notifications</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="autosave"
                checked={autoSave}
                onCheckedChange={(v) => setAutoSave(v === true)}
              />
              <Label htmlFor="autosave">Auto-save</Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Radio Group */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Radio Group</h4>
          <RadioGroup defaultValue="realtime">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="realtime" id="r1" />
              <Label htmlFor="r1">Realtime</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="delayed" id="r2" />
              <Label htmlFor="r2">Delayed</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="eod" id="r3" />
              <Label htmlFor="r3">End of Day</Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Progress & Slider
// ---------------------------------------------------------------------------

function ProgressSliderSection() {
  const [sliderValue, setSliderValue] = useState([40]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          <CardTitle>Progress & Slider</CardTitle>
        </div>
        <CardDescription>
          Visual indicators for progress and range selection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Progress */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Progress</h4>
          <div className="space-y-2">
            <Progress value={65} />
            <p className="text-xs text-muted-foreground">65% complete</p>
          </div>
        </div>

        <Separator />

        {/* Slider */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Slider</h4>
          <div className="space-y-2">
            <Slider
              defaultValue={[40]}
              max={100}
              step={1}
              value={sliderValue}
              onValueChange={setSliderValue}
            />
            <p className="text-xs text-muted-foreground">
              Value: {sliderValue[0]}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Table
// ---------------------------------------------------------------------------

const PNL_POSITIVE_STYLE = { color: "hsl(var(--mdl-pnl-positive))" } as const;
const PNL_NEGATIVE_STYLE = { color: "hsl(var(--mdl-pnl-negative))" } as const;

const positions = [
  { symbol: "AAPL", qty: 500, price: 182.45, pnl: 1234.56 },
  { symbol: "GOOGL", qty: 200, price: 141.82, pnl: -567.89 },
  { symbol: "MSFT", qty: 350, price: 378.91, pnl: 891.23 },
  { symbol: "TSLA", qty: 100, price: 248.12, pnl: -234.56 },
  { symbol: "AMZN", qty: 150, price: 178.65, pnl: 456.78 },
];

function TableSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TableIcon className="h-5 w-5 text-primary" />
          <CardTitle>Table</CardTitle>
        </div>
        <CardDescription>
          Data tables for displaying positions and trading data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((pos) => (
              <TableRow key={pos.symbol}>
                <TableCell className="font-medium font-mono">
                  {pos.symbol}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {pos.qty.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {pos.price.toFixed(2)}
                </TableCell>
                <TableCell
                  className="text-right font-mono font-medium"
                  style={pos.pnl >= 0 ? PNL_POSITIVE_STYLE : PNL_NEGATIVE_STYLE}
                >
                  {pos.pnl >= 0 ? "+" : ""}
                  {pos.pnl.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Textarea
// ---------------------------------------------------------------------------

function TextareaSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <CardTitle>Textarea</CardTitle>
        </div>
        <CardDescription>
          Multi-line text input for notes and comments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="trading-notes">Trading Notes</Label>
          <Textarea
            id="trading-notes"
            placeholder="Enter trading notes..."
            rows={4}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Toggle & Toggle Group
// ---------------------------------------------------------------------------

function ToggleSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ToggleLeft className="h-5 w-5 text-primary" />
          <CardTitle>Toggle & Toggle Group</CardTitle>
        </div>
        <CardDescription>
          Pressable buttons for toggling options on and off.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Single Toggle */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Single Toggle</h4>
          <Toggle aria-label="Toggle bold">
            <Bold className="h-4 w-4" />
          </Toggle>
        </div>

        <Separator />

        {/* Toggle Group */}
        <div>
          <h4 className="mb-4 text-sm font-semibold">Toggle Group</h4>
          <ToggleGroup type="single" defaultValue="1D" variant="outline">
            <ToggleGroupItem value="1D">1D</ToggleGroupItem>
            <ToggleGroupItem value="1W">1W</ToggleGroupItem>
            <ToggleGroupItem value="1M">1M</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Dropdown Menu
// ---------------------------------------------------------------------------

function DropdownMenuSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Menu className="h-5 w-5 text-primary" />
          <CardTitle>Dropdown Menu</CardTitle>
        </div>
        <CardDescription>
          Contextual menus for actions and navigation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <MoreHorizontal className="mr-2 h-4 w-4" />
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Position Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View Details</DropdownMenuItem>
            <DropdownMenuItem>Edit Position</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Close Position
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Skeleton
// ---------------------------------------------------------------------------

function SkeletonSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 text-primary" />
          <CardTitle>Skeleton</CardTitle>
        </div>
        <CardDescription>
          Placeholder loading states for content.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[80%]" />
          <Skeleton className="h-10 w-[120px] rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Calendar & Date Picker
// ---------------------------------------------------------------------------

function CalendarDatePickerSection() {
  const [demoDate, setDemoDate] = useState<Date | undefined>(new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Calendar & Date Picker</CardTitle>
        <CardDescription>Date selection with calendar popover</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-sm font-medium mb-3 text-muted-foreground">Calendar</p>
            <Calendar mode="single" className="rounded-md border" />
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-3 text-muted-foreground">Date Picker</p>
              <DatePicker placeholder="Select trade date" />
            </div>
            <div>
              <p className="text-sm font-medium mb-3 text-muted-foreground">Date Picker (with date)</p>
              <DatePicker date={demoDate} onSelect={setDemoDate} placeholder="Settlement date" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Design System Page
// ---------------------------------------------------------------------------

export default function DesignSystem() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Design System</h2>
        <p className="text-muted-foreground">
          Visual reference for all MarketsUI design tokens and component patterns.
        </p>
      </div>

      <ColorPaletteSection />
      <TypographySection />
      <SpacingSizingSection />
      <ComponentShowcaseSection />
      <TradingColorsDemoSection />
      <AccordionSection />
      <AlertSection />
      <AvatarSection />
      <CheckboxRadioSection />
      <ProgressSliderSection />
      <TableSection />
      <TextareaSection />
      <ToggleSection />
      <DropdownMenuSection />
      <SkeletonSection />
      <CalendarDatePickerSection />
    </div>
  );
}
