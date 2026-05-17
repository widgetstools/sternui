import type { ReactNode } from "react";
{{hookImports}}

export interface {{Name}}Props {
  className?: string;
  children?: ReactNode;
}

/**
 * {{Name}} — scaffolded by @starui/mcp-server. Built on @starui/ui primitives
 * (shadcn) and @starui/design-system tokens. Replace this body with your
 * real implementation; no native <input>/<select>/<textarea> — wrap with
 * shadcn equivalents instead.
 */
export function {{Name}}({ className, children }: {{Name}}Props): ReactNode {
{{hookBody}}
  return (
    <div
      className={[
        "rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-4 text-[color:var(--ds-text-primary)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[color:var(--ds-text-tertiary)]">
        {{Name}}
      </header>
      {children ?? (
        <p className="text-sm text-[color:var(--ds-text-secondary)]">
          Replace this with your component body.
        </p>
      )}
    </div>
  );
}
