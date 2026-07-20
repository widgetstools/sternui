import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ServerFilteredRowCountPanel,
  ServerSelectedRowCountPanel,
  ServerTotalAndFilteredRowCountPanel,
  ServerTotalRowCountPanel,
  translateSsrmStatusBar,
} from "../custom/ssrmStatusBarPanels.js";

function fakeApi(ctx: {
  totalRowCount?: number;
  filteredRowCount?: number;
  selected?: number;
  selectAll?: boolean;
  toggledNodes?: string[];
}) {
  return {
    getGridOption: (key: string) => (key === "context" ? ctx : undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getServerSideSelectionState: () =>
      ctx.selectAll != null || ctx.toggledNodes
        ? {
            selectAll: ctx.selectAll ?? false,
            toggledNodes: ctx.toggledNodes ?? [],
          }
        : null,
    getSelectedNodes: () =>
      Array.from({ length: ctx.selected ?? 0 }, (_, i) => ({ id: String(i) })),
  };
}

describe("SSRM status bar panels", () => {
  it("renders Rows : N like CSRM when unfiltered", () => {
    const html = renderToStaticMarkup(
      createElement(ServerTotalAndFilteredRowCountPanel, {
        api: fakeApi({ totalRowCount: 500, filteredRowCount: 500 }) as never,
      }),
    );
    expect(html).toContain("ag-status-panel-total-and-filtered-row-count");
    expect(html).toContain(">Rows</span>");
    expect(html).toMatch(/ag-status-name-value-value[^>]*>500</);
    expect(html).not.toContain(" of ");
  });

  it("renders Rows : filtered of total when filtered", () => {
    const html = renderToStaticMarkup(
      createElement(ServerTotalAndFilteredRowCountPanel, {
        api: fakeApi({ totalRowCount: 400, filteredRowCount: 224 }) as never,
      }),
    );
    expect(html).toContain("224 of 400");
  });

  it("hides Filtered panel when unfiltered", () => {
    const html = renderToStaticMarkup(
      createElement(ServerFilteredRowCountPanel, {
        api: fakeApi({ totalRowCount: 400, filteredRowCount: 400 }) as never,
      }),
    );
    expect(html).toContain("ag-hidden");
    expect(html).toContain(">Filtered</span>");
  });

  it("shows Filtered : N when filtered", () => {
    const html = renderToStaticMarkup(
      createElement(ServerFilteredRowCountPanel, {
        api: fakeApi({ totalRowCount: 400, filteredRowCount: 224 }) as never,
      }),
    );
    expect(html).not.toContain("ag-hidden");
    expect(html).toMatch(/ag-status-name-value-value[^>]*>224</);
  });

  it("hides Selected when zero", () => {
    const html = renderToStaticMarkup(
      createElement(ServerSelectedRowCountPanel, {
        api: fakeApi({ selected: 0 }) as never,
      }),
    );
    expect(html).toContain("ag-hidden");
  });

  it("shows Selected count from SSRM selection state", () => {
    const html = renderToStaticMarkup(
      createElement(ServerSelectedRowCountPanel, {
        api: fakeApi({
          selectAll: false,
          toggledNodes: ["a", "b", "c"],
        }) as never,
      }),
    );
    expect(html).not.toContain("ag-hidden");
    expect(html).toMatch(/ag-status-name-value-value[^>]*>3</);
  });

  it("renders Total Rows : N", () => {
    const html = renderToStaticMarkup(
      createElement(ServerTotalRowCountPanel, {
        api: fakeApi({ totalRowCount: 1234 }) as never,
      }),
    );
    expect(html).toContain("ag-status-panel-total-row-count");
    expect(html).toContain(">Total Rows</span>");
    expect(html).toMatch(/ag-status-name-value-value[^>]*>1,234</);
  });
});

describe("translateSsrmStatusBar", () => {
  it("maps AG client-side count panel ids to the SSRM stand-ins", () => {
    const out = translateSsrmStatusBar({
      statusPanels: [
        { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
        { statusPanel: "agFilteredRowCountComponent" },
        { statusPanel: "agTotalRowCountComponent" },
        { statusPanel: "agSelectedRowCountComponent" },
      ],
    });
    expect(out?.statusPanels).toEqual([
      { statusPanel: ServerTotalAndFilteredRowCountPanel, align: "left" },
      { statusPanel: ServerFilteredRowCountPanel },
      { statusPanel: ServerTotalRowCountPanel },
      { statusPanel: ServerSelectedRowCountPanel },
    ]);
  });

  it("passes aggregation and custom panels through untouched", () => {
    const custom = { statusPanel: "myAppPanel", statusPanelParams: { a: 1 } };
    const agg = { statusPanel: "agAggregationComponent", align: "right" };
    const out = translateSsrmStatusBar({ statusPanels: [agg, custom] });
    expect(out?.statusPanels).toEqual([agg, custom]);
  });

  it("returns undefined for non-statusBar shapes", () => {
    expect(translateSsrmStatusBar(undefined)).toBeUndefined();
    expect(translateSsrmStatusBar(null)).toBeUndefined();
    expect(translateSsrmStatusBar(true)).toBeUndefined();
    expect(translateSsrmStatusBar({})).toBeUndefined();
    expect(translateSsrmStatusBar({ statusPanels: "x" })).toBeUndefined();
  });
});
