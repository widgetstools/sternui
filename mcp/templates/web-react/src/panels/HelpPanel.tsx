export function HelpPanel() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-[13px] text-[color:var(--ds-text-secondary)]">
      <h2 className="text-[14px] font-semibold text-[color:var(--ds-text-primary)]">
        {{name}} — Help
      </h2>
      <section className="space-y-1.5">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[color:var(--ds-text-tertiary)]">
          Keyboard
        </h3>
        <ul className="space-y-1">
          <li>
            <kbd className="rounded border px-1.5 py-0.5 text-[11px]">Ctrl/Cmd + .</kbd>
            <span className="ml-2">Toggle theme</span>
          </li>
          <li>
            <kbd className="rounded border px-1.5 py-0.5 text-[11px]">Ctrl/Cmd + S</kbd>
            <span className="ml-2">Save dock layout</span>
          </li>
          <li>
            <kbd className="rounded border px-1.5 py-0.5 text-[11px]">Ctrl/Cmd + Shift + R</kbd>
            <span className="ml-2">Reset dock layout</span>
          </li>
        </ul>
      </section>
      <section className="space-y-1.5">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[color:var(--ds-text-tertiary)]">
          Profiles
        </h3>
        <p>
          The grid persists column layout, filters, and sorts per profile in
          localStorage. Use the profile selector in the grid toolbar to
          switch, save, or rename profiles.
        </p>
      </section>
    </div>
  );
}
