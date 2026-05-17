import { useState } from "react";
import {
  MarketsGrid,
  createMarketsGridLocalStorageStorage,
} from "@starui/markets-grid";
import { buildBondInventory } from "../data/mockBonds";
import { bondColumnDefs, bondDefaultColDef } from "../data/bondColumns";

const GRID_ID = "{{name}}-default-blotter";
const storage = createMarketsGridLocalStorageStorage();

export function GridPanel() {
  const [rows] = useState(() => buildBondInventory(180));

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <MarketsGrid
        gridId={GRID_ID}
        rowData={rows}
        columnDefs={bondColumnDefs}
        defaultColDef={bondDefaultColDef}
        rowIdField="id"
        storage={storage}
        showFiltersToolbar
        showFormattingToolbar
        showProfileSelector
        showSaveButton
        showSettingsButton
        componentName="Bond Blotter"
        sideBar={{ toolPanels: ["columns", "filters"] }}
        statusBar={{
          statusPanels: [
            { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
            { statusPanel: "agFilteredRowCountComponent", align: "left" },
            { statusPanel: "agSelectedRowCountComponent", align: "center" },
            { statusPanel: "agAggregationComponent", align: "right" },
          ],
        }}
      />
    </div>
  );
}
