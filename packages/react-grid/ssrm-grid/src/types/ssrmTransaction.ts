export type GrandTotalRowMode =
  | boolean
  | "top"
  | "bottom"
  | "pinnedTop"
  | "pinnedBottom";

export type GroupTotalRowMode = "top" | "bottom";

export interface SSRMTransaction {
  add?: Record<string, unknown>[];
  update?: Record<string, unknown>[];
  remove?: (Record<string, unknown> | string | number)[];
}
