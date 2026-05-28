export interface EditingToolbarAllow {
  /** Show the unified editing toolbar row. */
  rowVisible: boolean;
  /** Host allows the edit-history segment (still requires module enabled). */
  allowHistory: boolean;
  allowSmartEdit: boolean;
  allowBulkUpdate: boolean;
}

export interface EditingToolbarHostProps {
  showEditingToolbar?: boolean;
  showSmartEditToolbar?: boolean;
  showBulkUpdateToolbar?: boolean;
  showEditHistoryToolbar?: boolean;
}

/**
 * Resolve host-level editing toolbar visibility.
 * Legacy per-module props act as an allow-list; `showEditingToolbar` alone
 * enables all three segments (each still gated by module settings.enabled).
 */
export function resolveEditingToolbarAllow(
  props: EditingToolbarHostProps,
): EditingToolbarAllow {
  const {
    showEditingToolbar,
    showSmartEditToolbar,
    showBulkUpdateToolbar,
    showEditHistoryToolbar,
  } = props;

  const legacySpecified =
    showSmartEditToolbar !== undefined
    || showBulkUpdateToolbar !== undefined
    || showEditHistoryToolbar !== undefined;

  const legacyAny = Boolean(
    showSmartEditToolbar || showBulkUpdateToolbar || showEditHistoryToolbar,
  );

  // `??` would treat explicit `showEditingToolbar: false` (MarketsGrid default) as
  // set — use `||` so legacy props still enable the row when the unified prop is off.
  const rowVisible = Boolean(showEditingToolbar) || legacyAny;

  if (showEditingToolbar && !legacySpecified) {
    return {
      rowVisible,
      allowHistory: true,
      allowSmartEdit: true,
      allowBulkUpdate: true,
    };
  }

  return {
    rowVisible,
    allowHistory: Boolean(showEditHistoryToolbar),
    allowSmartEdit: Boolean(showSmartEditToolbar),
    allowBulkUpdate: Boolean(showBulkUpdateToolbar),
  };
}
