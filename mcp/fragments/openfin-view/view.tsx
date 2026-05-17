import type { ReactNode } from "react";
import { useHost } from "@starui/host-wrapper-react";

function {{ViewName}}(): ReactNode {
  const { runtime } = useHost();
  void runtime;

  return (
    <div className="flex h-full w-full flex-col gap-3 p-6 text-[color:var(--ds-text-primary)]">
      <h1 className="text-lg font-semibold">{{ViewName}}</h1>
      <p className="text-sm text-[color:var(--ds-text-secondary)]">
        Scaffolded view. Replace this with your content. Use{" "}
        <code>useHost()</code> to reach the runtime port (works in both
        OpenFin and plain-browser dev).
      </p>
    </div>
  );
}

export default {{ViewName}};
