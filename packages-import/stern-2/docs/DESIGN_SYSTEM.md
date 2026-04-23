# Stern Design System

Prescriptive design guide for all UI components in the Stern Widget Framework. Every form, panel, toolbar, and dialog must follow these tokens to ensure visual consistency across the platform.

## Foundation

- **Theme**: Coinbase-inspired dark-first design (see `packages/ui/src/styles/stern-theme.css`)
- **Font**: Inter, -apple-system, sans-serif
- **Radius**: `--radius: 0.5rem` (8px)
- **Primary**: Coinbase Blue (`#0052FF` light / `#578BFA` dark)
- **Component library**: shadcn/ui via `@stern/ui`

## Form Fields

All form fields across the platform use the same sizing and color tokens.

### Labels

```
className="text-xs font-medium text-muted-foreground"
```

- Size: `text-xs` (12px) — not `text-sm`
- Weight: `font-medium` (500)
- Color: `text-muted-foreground` — never bright foreground

### Inputs

```
className="h-8 text-sm"
```

- Height: `h-8` (32px) — compact
- Font: `text-sm` (14px)
- Use on `<Input>`, `<Textarea>` (omit `h-8` for Textarea), and `<SelectTrigger>`

### Select (Dropdown)

Always use the shadcn `<Select>` component from `@stern/ui` — never native `<select>`.

```tsx
<Select value={value} onValueChange={onChange}>
  <SelectTrigger className="h-8 text-sm">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

### Switch / Checkbox Labels

```
className="text-xs font-normal text-muted-foreground"
```

Slightly lighter than field labels (`font-normal` vs `font-medium`) since they sit inline.

### Helper Text

```
className="text-[11px] text-muted-foreground"
```

Placed below the input for additional context. Use sparingly.

### Alert / Info Boxes

```tsx
<Alert>
  <Info className="h-3.5 w-3.5" />
  <AlertDescription className="text-[11px]">
    Informational text here
  </AlertDescription>
</Alert>
```

## Spacing

### Label → Input Gap

```
space-y-1.5  (6px)
```

Tight coupling between label and its input.

```tsx
<div className="space-y-1.5">
  <Label className="text-xs font-medium text-muted-foreground">Field Name</Label>
  <Input className="h-8 text-sm" />
</div>
```

### Between Fields

```
space-y-4  (16px)
```

Standard gap between adjacent field groups within a section.

### Between Sections

```
space-y-5  (20px)
```

Gap between distinct sections (e.g., "Basic Configuration" and "Topic Configuration").

### Container Padding

```
p-6  (24px)     — Full form containers (ConnectionTab, ProviderForm name header)
p-4  (16px)     — Section cards, properties panels, toolbar areas
px-4 py-3       — Toolbars and action bars
```

### Column Gaps

```
gap-8  (32px)   — Between grid columns in multi-column layouts
gap-3  (12px)   — Between items in toolbar rows
gap-2  (8px)    — Between buttons in action groups
```

## Section Grouping

Use bordered cards for visual grouping of related fields. Do NOT use heavy `<Separator />` between sections — use cards instead.

```tsx
<section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
    Section Title
  </h3>
  {/* fields here */}
</section>
```

### Section Headers

```
className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
```

- Size: `text-xs` (12px)
- Weight: `font-semibold` (600)
- Transform: `uppercase`
- Tracking: `tracking-wider`
- Color: `text-muted-foreground`

## Buttons

### Footer Action Bar

All footer buttons use `size="sm"` for a compact, professional action bar.

```tsx
<div className="border-t bg-card px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
  <div className="flex items-center gap-2">
    {/* Context-specific left actions */}
    <Button size="sm" variant="outline">Secondary Action</Button>
  </div>
  <div className="flex items-center gap-2">
    <Button size="sm" variant="outline">Cancel</Button>
    <Button size="sm">Primary Action</Button>
  </div>
</div>
```

- Button `size="sm"`: `h-8 px-3 text-xs`
- Gap between buttons: `gap-2` (8px)
- Footer padding: `px-4 py-3`
- Background: `bg-card` with `border-t`
- No `shadow-sm` on footer

### Toolbar Buttons

Same `size="sm"` as footer. Icon buttons use `size="icon"` with `h-7 w-7`.

### Icon Button (Toolbar)

```tsx
<Button variant="ghost" size="icon" className="h-7 w-7">
  <IconName className="h-3.5 w-3.5" />
</Button>
```

## Toolbars

Toolbars with input fields use labeled stacked layout aligned at the bottom.

```tsx
<div className="px-4 py-3 border-b border-border flex-shrink-0 bg-muted/30">
  <div className="flex items-end gap-3">
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Field</Label>
      <Input className="h-8 text-sm w-[160px]" />
    </div>
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Type</Label>
      <Select>
        <SelectTrigger className="h-8 w-[120px] text-sm">
          <SelectValue />
        </SelectTrigger>
        ...
      </Select>
    </div>
    <Button size="sm">Add</Button>
    <div className="flex-1" />
    <Button size="sm" variant="ghost">Clear All</Button>
  </div>
</div>
```

Key patterns:
- `flex items-end gap-3` — aligns inputs at their baseline
- Fixed widths on inputs (`w-[160px]`, `w-[120px]`) for predictable layout
- `flex-1` spacer pushes right-aligned actions to the edge

## Tree Views

Used for hierarchical data (field selection, dock menu items).

```
Row height:     h-8 (32px)
Field names:    text-[13px]
Type badges:    text-[11px] font-mono, in fixed w-[60px] container
Indent:         20px per depth level + 8px base padding
Chevrons:       w-3.5 h-3.5
Checkboxes:     Default Checkbox from @stern/ui
```

### Type Badge Colors

```
string:   bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/20
number:   bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20
boolean:  bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20
date:     bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20
object:   bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20
array:    bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/20
```

## AG Grid

### Theme

AG Grid uses custom Stern themes built on `themeQuartz`. The themes and a hook are exported from `@stern/widgets`.

```typescript
import { useAgGridTheme } from '@stern/widgets';

const { theme } = useAgGridTheme(); // auto-switches dark/light
<AgGridReact theme={theme} ... />
```

Or import themes directly:

```typescript
import { sternDarkTheme, sternLightTheme } from '@stern/widgets';
```

**Dark theme** (`sternDarkTheme`):
| Parameter | Value |
|-----------|-------|
| backgroundColor | `#1f2836` |
| foregroundColor | `#FFF` |
| oddRowBackgroundColor | `#1B2433` |
| chromeBackgroundColor | foreground 7% mix onto background |
| browserColorScheme | `dark` |
| borderRadius | 2 |
| columnBorder | true |
| spacing | 6 |
| wrapperBorderRadius | 4 |

**Light theme** (`sternLightTheme`):
| Parameter | Value |
|-----------|-------|
| oddRowBackgroundColor | `#EEF4FF` |
| headerFontFamily | IBM Plex Sans (Google Font) |
| browserColorScheme | `light` |
| borderRadius | 2 |
| columnBorder | true |
| spacing | 6 |
| wrapperBorderRadius | 4 |

Theme source: `packages/widgets/src/theme/sternAgGridTheme.ts`

### Grid Defaults

```
headerHeight:   32
rowHeight:      32
domLayout:      "normal"
```

Suppress: `suppressMovableColumns`, `suppressCellFocus`

## Tab Bars

```tsx
<TabsList className="grid w-full grid-cols-3 rounded-none h-10 bg-muted/50 border-b">
  <TabsTrigger
    value="tab1"
    className="rounded-none text-sm data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
  >
    Tab Label
  </TabsTrigger>
</TabsList>
```

- Height: `h-10` (40px)
- Font: `text-sm` (14px)
- Active indicator: `border-b-2 border-primary`
- Background: `bg-muted/50` inactive, `bg-background` active
- Badge counts: `<Badge variant="secondary" className="ml-2 text-xs">`

## Badges

```
Tab counts:        variant="secondary" className="ml-2 text-xs"
Toolbar counts:    variant="secondary" className="text-xs"
Status (unsaved):  variant="outline" className="text-[10px] h-4 px-1.5 text-yellow-500 border-yellow-500/50"
Tree child count:  variant="secondary" className="text-[10px] h-4 px-1.5"
```

## Empty States

Centered with icon, heading, description, and optional CTA.

```tsx
<div className="flex items-center justify-center h-full">
  <div className="text-center max-w-md p-8">
    <IconName className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
    <h3 className="text-lg font-semibold mb-2">Title</h3>
    <p className="text-sm text-muted-foreground mb-4">Description text.</p>
    <Button>CTA Label</Button>
  </div>
</div>
```

## Reference Implementations

These components exemplify the design system and should be used as references:

| Component | File | Demonstrates |
|-----------|------|-------------|
| DockConfigurator | `apps/reference-app/src/openfin/DockConfigurator.tsx` | Properties panel, tree view, toolbar icons, header |
| ConnectionTab | `apps/reference-app/src/components/provider/stomp/ConnectionTab.tsx` | Section cards, two-column layout, labels/inputs |
| ColumnsTab | `apps/reference-app/src/components/provider/stomp/ColumnsTab.tsx` | Toolbar with labeled inputs, AG Grid, Select |
| FieldsTab | `apps/reference-app/src/components/provider/stomp/FieldsTab.tsx` | Search toolbar, tree view, sidebar, empty state |
| SimpleTreeView | `apps/reference-app/src/components/provider/stomp/SimpleTreeView.tsx` | Tree rows, type badges, checkboxes, indentation |
| StompConfigurationForm | `apps/reference-app/src/components/provider/stomp/StompConfigurationForm.tsx` | Tab bar, footer action bar, badge counts |
| ProviderForm | `apps/reference-app/src/components/provider/ProviderForm.tsx` | Non-STOMP forms, Card layout, KeyValueEditor |

## Quick Reference

```
Labels:           text-xs font-medium text-muted-foreground
Inputs:           h-8 text-sm
Select triggers:  h-8 text-sm
Label→Input:      space-y-1.5
Field gap:        space-y-4
Section gap:      space-y-5
Container pad:    p-6 (forms) / p-4 (sections) / px-4 py-3 (toolbars)
Section cards:    rounded-lg border border-border bg-muted/30 p-4
Section headers:  text-xs font-semibold uppercase tracking-wider text-muted-foreground
Helper text:      text-[11px] text-muted-foreground
Footer buttons:   size="sm" with gap-2
Footer bar:       border-t bg-card px-4 py-3
AG Grid theme:    useAgGridTheme() from @stern/widgets (auto dark/light)
```
