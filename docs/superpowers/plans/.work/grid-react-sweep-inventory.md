# grid-react sweep inventory (working note — delete after Task 33)

## Counts
- .gc-* className occurrences: 69
- legacy --bn-/--ck-/--gc-/--fi-/--mdl- var refs: 358

## Modules
```
calculated-columns
column-customization
column-groups
column-templates
conditional-styling
general-settings
grid-state
saved-filters
toolbar-visibility
```

## UI subdirs
```
ColorPicker
ExpressionEditor
format-editor
FormatterPicker
icons.tsx
PopoutPortal.test.tsx
PopoutPortal.tsx
Poppable.tsx
PortalContainer.tsx
SettingsPanel
shadcn
StyleEditor
```

## Strategy
1. Each module gets one commit. Within a module, walk every .tsx/.ts/.css.
2. Replace .gc-popout-title → equivalent Tailwind utility soup OR move to a
   shared component (PopoutTitle, etc.) under SettingsPanel/.
3. Replace var(--bn-bg) → bg-background; var(--bn-bg1) → bg-card; etc.
   Token mapping table:
     --bn-bg / --ck-bg          → bg-background  (or var(--ds-surface-ground))
     --bn-bg1 / --ck-surface    → bg-card        (or var(--ds-surface-primary))
     --bn-bg2 / --ck-card       → bg-muted       (or var(--ds-surface-secondary))
     --bn-bg3 / --ck-card-hi    → bg-secondary   (or var(--ds-surface-tertiary))
     --bn-t0 / --ck-t0          → text-foreground (or var(--ds-text-primary))
     --bn-t1 / --ck-t1          → text-secondary (or var(--ds-text-secondary))
     --bn-t2 / --ck-t2          → text-muted-foreground
     --bn-t3 / --ck-t3          → text-faint (var(--ds-text-faint))
     --bn-border / --ck-border  → border-border
     --bn-green / --ck-green    → text-success / bg-success
     --bn-red                    → text-destructive / bg-destructive
     --bn-amber                  → text-warning
     --bn-blue                   → text-primary (brand)
     --gc-accent                 → text-primary
4. .gc-themed-scrollbar / per-component scrollbar blocks → ds-scrollbar
5. Existing Vitest snapshots that lock --bn-/--ck- values get re-recorded
   in the same commit as the file that produces them.
