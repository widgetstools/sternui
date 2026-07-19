import { describe, expect, it } from "vitest";

import {
  MirrorLoadingCellRenderer,
  setActiveStubLeafReader,
  stubDisplayFromLeafReader,
  type SsrmStubLeafReader,
} from "../ssrm/mirrorLoadingCell.js";
import { RowMirror } from "../ssrm/rowMirror.js";

function readerFrom(mirror: RowMirror): SsrmStubLeafReader {
  return (i) => mirror.getLeafAt(i) ?? null;
}

describe("stubDisplayFromLeafReader", () => {
  it("renders root-store stub text from the leaf reader", () => {
    const mirror = new RowMirror();
    mirror.replaceAll(
      [
        { id: "1", book: "Rates-A" },
        { id: "2", book: "FX-B" },
      ],
      "id",
    );
    expect(
      stubDisplayFromLeafReader(
        readerFrom(mirror),
        { rowIndex: 1, parent: { level: -1 } as never },
        "book",
      ),
    ).toBe("FX-B");
  });

  it("paints stubs even when parent is not the root sentinel", () => {
    const mirror = new RowMirror();
    mirror.replaceAll([{ id: "1", book: "Rates-A" }], "id");
    expect(
      stubDisplayFromLeafReader(
        readerFrom(mirror),
        { rowIndex: 0, stub: true, parent: { level: 0 } as never },
        "book",
      ),
    ).toBe("Rates-A");
  });

  it("skips grouped child-store indices", () => {
    const mirror = new RowMirror();
    mirror.replaceAll([{ id: "1", book: "A" }], "id");
    expect(
      stubDisplayFromLeafReader(
        readerFrom(mirror),
        {
          rowIndex: 0,
          level: 1,
          parent: { level: 0 } as never,
        },
        "book",
      ),
    ).toBe("");
  });

  it("falls back to the active reader registry", () => {
    const mirror = new RowMirror();
    mirror.replaceAll([{ id: "1", book: "Desk-A" }], "id");
    setActiveStubLeafReader(readerFrom(mirror));
    try {
      expect(
        stubDisplayFromLeafReader(
          null,
          { rowIndex: 0, parent: { level: -1 } as never },
          "book",
        ),
      ).toBe("Desk-A");
    } finally {
      setActiveStubLeafReader(null);
    }
  });
});

describe("MirrorLoadingCellRenderer", () => {
  it("repaints on refresh when rowIndex arrives after init", () => {
    const mirror = new RowMirror();
    mirror.replaceAll(
      [
        { id: "1", book: "A" },
        { id: "2", book: "B" },
      ],
      "id",
    );
    const reader = readerFrom(mirror);
    setActiveStubLeafReader(reader);

    // Vitest node env — stub minimal DOM for the imperative cell.
    const span = {
      className: "",
      textContent: "" as string | null,
    };
    const prevDoc = globalThis.document;
    (globalThis as { document: { createElement: (tag: string) => typeof span } }).document = {
      createElement: () => span,
    };

    try {
      const cell = new MirrorLoadingCellRenderer();
      const node = {
        rowIndex: null as number | null,
        stub: true,
        parent: { level: -1 },
      };
      cell.init({
        node: node as never,
        context: { ssrmLeafAt: reader },
        colDef: { field: "book" },
        column: undefined,
      } as never);
      expect(span.textContent).toBe("");

      node.rowIndex = 1;
      cell.refresh({
        node: node as never,
        context: { ssrmLeafAt: reader },
        colDef: { field: "book" },
        column: undefined,
      } as never);
      expect(span.textContent).toBe("B");
    } finally {
      (globalThis as { document: unknown }).document = prevDoc;
      setActiveStubLeafReader(null);
    }
  });
});
