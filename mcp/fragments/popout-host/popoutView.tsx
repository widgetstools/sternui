import type { ReactNode } from "react";
import { useHost } from "@starui/host-wrapper-react";

function {{Name}}Popout(): ReactNode {
  const { runtime } = useHost();
  void runtime;

  return (
    <div className="flex h-screen w-screen flex-col gap-3 p-6 text-[color:var(--ds-text-primary)]">
      <h1 className="text-lg font-semibold">{{Name}} Popout</h1>
      <p className="text-sm text-[color:var(--ds-text-secondary)]">
        Scaffolded popout content. The opener passed{" "}
        <code>customData</code> via <code>runtime.openSurface</code> —
        read it from <code>fin.me.customData</code> in OpenFin, or from
        the URL search params in browser mode.
      </p>
    </div>
  );
}

export default {{Name}}Popout;
