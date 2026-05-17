import type { ReactNode } from "react";
import { HostedMarketsGrid } from "@starui/widgets-react/hosted";
import { dataServices } from "../dataServices.mainThread";

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

function {{ViewName}}(): ReactNode {
  return (
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="{{gridId}}"
      documentTitle="MarketsGrid · {{ViewName}}"
      withStorage
      theme="auto"
      dataServices={dataServices}
      gridId="{{gridId}}"
      showFiltersToolbar
      showFormattingToolbar
      defaultColDef={DEFAULT_COL_DEF}
    />
  );
}

export default {{ViewName}};
