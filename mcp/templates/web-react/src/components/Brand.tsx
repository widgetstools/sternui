export function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-6 w-6 rounded-md bg-[color:var(--ds-accent-primary)] text-center text-[11px] font-bold leading-6 text-white">
        S
      </div>
      <div className="font-[var(--ds-font-sans)] text-[14px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
        {{name}}
      </div>
    </div>
  );
}
