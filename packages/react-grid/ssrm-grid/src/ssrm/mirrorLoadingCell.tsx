import type {
  ILoadingCellRendererComp,
  ILoadingCellRendererParams,
  IRowNode,
} from "ag-grid-community";

/**
 * Sync leaf lookup by absolute root-view index — the engine capability
 * (`SsrmEngine.tryLeafAt`) behind loading-stub paint. Engine-agnostic: no
 * RowMirror types leak here.
 */
export type SsrmStubLeafReader = (
  viewIndex: number,
) => Record<string, unknown> | null;

export type MirrorLoadingContext = {
  ssrmLeafAt?: SsrmStubLeafReader | null;
};

/** Set by SSRMGrid so loaders do not depend on context surviving setGridOption merges. */
let activeLeafReader: SsrmStubLeafReader | null = null;

export function setActiveStubLeafReader(
  reader: SsrmStubLeafReader | null,
): void {
  activeLeafReader = reader;
}

export function getActiveStubLeafReader(): SsrmStubLeafReader | null {
  return activeLeafReader;
}

/**
 * Text for an SSRM stub/loading cell from the engine's sync leaf book.
 * Root store / stubs only — grouped child stores use local indices.
 */
export function stubDisplayFromLeafReader(
  reader: SsrmStubLeafReader | null | undefined,
  node: Pick<IRowNode, "rowIndex" | "parent" | "stub" | "level">,
  field: string | undefined | null,
): string {
  const leafAt = reader ?? activeLeafReader;
  if (!leafAt || field == null || field === "") return "";
  if (node.rowIndex == null || node.rowIndex < 0) return "";

  // Grouped child stores use local indices that may not match the root view.
  // Stubs always paint (they are placeholders for a store index about to load).
  if (!node.stub) {
    const level = node.level ?? 0;
    if (level > 0) return "";
    if (node.parent != null && node.parent.level !== -1) return "";
  }

  const row = leafAt(node.rowIndex);
  if (!row) return "";
  const v = row[field];
  if (v == null) return "";
  return String(v);
}

function fieldFromParams(params: ILoadingCellRendererParams): string | undefined {
  return (
    params.colDef?.field ??
    params.column?.getColDef()?.field ??
    params.column?.getColId() ??
    undefined
  );
}

/**
 * Imperative loading-cell renderer. AG Grid often creates the stub before
 * `rowIndex` is assigned; functional cells that return once stay blank forever.
 * `refresh` re-paints when the node/index updates.
 */
export class MirrorLoadingCellRenderer implements ILoadingCellRendererComp {
  private gui!: HTMLSpanElement;
  private params!: ILoadingCellRendererParams;

  init(params: ILoadingCellRendererParams): void {
    this.params = params;
    this.gui = document.createElement("span");
    this.gui.className = "ssrm-mirror-loading-cell";
    this.paint();
  }

  getGui(): HTMLElement {
    return this.gui;
  }

  refresh(params: ILoadingCellRendererParams): boolean {
    this.params = params;
    this.paint();
    return true;
  }

  private paint(): void {
    const ctx = this.params.context as MirrorLoadingContext | undefined;
    const reader = ctx?.ssrmLeafAt ?? activeLeafReader;
    this.gui.textContent = stubDisplayFromLeafReader(
      reader,
      this.params.node,
      fieldFromParams(this.params),
    );
  }
}
