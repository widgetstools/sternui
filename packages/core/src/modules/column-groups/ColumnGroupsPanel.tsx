/**
 * Column Groups settings panel — v4 rewrite.
 *
 * Like `CalculatedColumnsPanel`, this file carried three v2-era
 * antipatterns that the v3 audit flagged:
 *
 *  1. Local `dirtyRegistry = new Set<string>()` +
 *     `window.dispatchEvent('gc-dirty-change')` for LED broadcast.
 *     Replaced by `useDirty(key)` against the per-platform DirtyBus —
 *     `useModuleDraft` auto-registers `column-groups:<groupId>`.
 *  2. A second local `useGridColumns()` hook (same name as the platform
 *     hook, different implementation) with `setTick` polling on
 *     `displayedColumnsChanged`. Replaced by the platform hook.
 *  3. `useDraftModuleItem({ store, … })` + `useModuleState(store, id)`
 *     compat shims — now `useModuleDraft` + 1-arg `useModuleState(id)`.
 *
 * Tree-mutation helpers (update / delete / move / flatten) moved to
 * `treeOps.ts` — pure data transforms deserve their own testable module.
 *
 * All `cg-*` testIds preserved character-for-character.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FolderPlus,
  Lock,
  Plus,
  Save,
  Trash2,
  X as XIcon,
} from 'lucide-react';
import { Select, Switch } from '../../ui/shadcn';
import type { EditorPaneProps, ListPaneProps } from '../../platform/types';
import { useModuleState } from '../../hooks/useModuleState';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useDirty } from '../../hooks/useDirty';
import { useGridColumns, type GridColumnInfo } from '../../hooks/useGridColumns';
import {
  Band,
  Caps,
  CockpitList,
  CockpitListItem,
  LedBar,
  MetaCell,
  Mono,
  ObjectTitleRow,
  SharpBtn,
  TitleInput,
} from '../../ui/SettingsPanel';
import { StyleEditor, type StyleEditorValue } from '../../ui/StyleEditor';
import type {
  ColumnGroupNode,
  ColumnGroupsState,
  GroupChildShow,
  GroupHeaderStyle,
} from './state';
import { collectAssignedColIds } from './composeGroups';
import {
  deleteGroupAtPath,
  flattenGroups,
  moveGroupAtPath,
  updateGroupAtPath,
  type Path,
} from './treeOps';

const MODULE_ID = 'column-groups';

// ─── Visibility cycle helpers ─────────────────────────────────────────

const SHOW_ORDER: GroupChildShow[] = ['always', 'open', 'closed'];

function nextShowMode(current: GroupChildShow | undefined): GroupChildShow {
  const cur = current ?? 'always';
  const idx = SHOW_ORDER.indexOf(cur);
  return SHOW_ORDER[(idx + 1) % SHOW_ORDER.length];
}

function showIcon(show: GroupChildShow | undefined, size = 11) {
  const mode = show ?? 'always';
  if (mode === 'open') return <EyeOff size={size} strokeWidth={1.75} />;
  if (mode === 'closed') return <Lock size={size} strokeWidth={1.75} />;
  return <Eye size={size} strokeWidth={1.75} />;
}

function showTooltip(show: GroupChildShow | undefined): string {
  const mode = show ?? 'always';
  if (mode === 'open') return 'Visible only when group is expanded';
  if (mode === 'closed') return 'Visible only when group is collapsed';
  return 'Always visible';
}

function showAccentColor(show: GroupChildShow | undefined): string {
  const mode = show ?? 'always';
  if (mode === 'open') return 'var(--ck-green)';
  if (mode === 'closed') return 'var(--ck-amber)';
  return 'var(--ck-t2)';
}

// ─── headerStyle ↔ StyleEditorValue ────────────────────────────────────

function headerStyleToEditor(style: GroupHeaderStyle | undefined): StyleEditorValue {
  if (!style) return {};
  return {
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    align: style.align,
    fontSize: style.fontSize,
    color: style.color,
    backgroundColor: style.background,
    backgroundAlpha: 100,
    // Same `BorderSpec` triplet shape as StyleEditorValue.borders.
    borders: style.borders,
  };
}

function headerStyleFromEditor(
  previous: GroupHeaderStyle | undefined,
  value: StyleEditorValue,
): GroupHeaderStyle | undefined {
  const next: GroupHeaderStyle = {
    ...(previous ?? {}),
    bold: value.bold,
    italic: value.italic,
    underline: value.underline,
    align:
      value.align === 'left' || value.align === 'center' || value.align === 'right'
        ? value.align
        : undefined,
    fontSize: value.fontSize,
    color: value.color,
    background: value.backgroundColor,
    borders: value.borders,
  };
  for (const k of Object.keys(next) as Array<keyof GroupHeaderStyle>) {
    if (next[k] === undefined || next[k] === false) delete next[k];
  }
  // Drop an empty borders map so persisted state stays lean.
  if (next.borders && Object.values(next.borders).every((v) => v === undefined)) {
    delete next.borders;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

// ─── ID generator ──────────────────────────────────────────────────────

function generateGroupId(): string {
  return `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Dirty LED for the list rail ───────────────────────────────────────

function DirtyListLed({ groupId }: { groupId: string }) {
  const { isDirty } = useDirty(`${MODULE_ID}:${groupId}`);
  if (!isDirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── List pane ─────────────────────────────────────────────────────────

export function ColumnGroupsList({ selectedId, onSelect }: ListPaneProps) {
  const [state, setState] = useModuleState<ColumnGroupsState>(MODULE_ID);
  const flat = useMemo(() => flattenGroups(state.groups), [state.groups]);

  const addTopLevelGroup = useCallback(() => {
    const newGroupId = generateGroupId();
    setState((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          groupId: newGroupId,
          headerName: 'New Group',
          children: [],
          openByDefault: true,
        },
      ],
    }));
    onSelect(newGroupId);
  }, [setState, onSelect]);

  useEffect(() => {
    if (!selectedId && flat.length > 0) onSelect(flat[0].node.groupId);
  }, [selectedId, flat, onSelect]);

  return (
    <>
      <div className="gc-popout-list-header">
        <Caps size={11}>Groups</Caps>
        <Mono color="var(--ck-t3)" size={11}>
          {String(flat.length).padStart(2, '0')}
        </Mono>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={addTopLevelGroup}
          title="Add group"
          data-testid="cg-add-group-btn"
          style={{
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--ck-green-bg)',
            color: 'var(--ck-green)',
            border: '1px solid var(--ck-green-dim)',
            borderRadius: 2,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>
      <CockpitList>
        {flat.map((fg) => {
          const active = fg.node.groupId === selectedId;
          return (
            <CockpitListItem
              key={fg.node.groupId}
              value={fg.node.groupId}
              active={active}
              onSelect={() => onSelect(fg.node.groupId)}
              data-testid={`cg-group-${fg.node.groupId}`}
              style={{ paddingLeft: 10 + fg.depth * 18 }}
            >
              <span style={{ width: 2, display: 'inline-flex' }}>
                <DirtyListLed groupId={fg.node.groupId} />
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {fg.node.headerName}
              </span>
            </CockpitListItem>
          );
        })}
      </CockpitList>
    </>
  );
}

// ─── Editor pane ───────────────────────────────────────────────────────

export function ColumnGroupsEditor({ selectedId }: EditorPaneProps) {
  const [state, setState] = useModuleState<ColumnGroupsState>(MODULE_ID);
  const columns = useGridColumns();

  const assigned = useMemo(() => collectAssignedColIds(state.groups), [state.groups]);
  const unassignedColIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of columns) if (!assigned.has(c.colId)) s.add(c.colId);
    return s;
  }, [columns, assigned]);

  if (!selectedId) {
    return (
      <div style={{ padding: '32px 24px' }}>
        <Caps size={10} style={{ marginBottom: 8, display: 'block' }}>
          No group selected
        </Caps>
        <div style={{ fontSize: 12, color: 'var(--ck-t2)' }}>
          Select a group from the list, or press <Mono size={11}>+</Mono> to add one.
        </div>
      </div>
    );
  }

  // Find the path of the selected group in the committed tree. Structural
  // ops (move / delete) always commit directly to the store — they
  // manipulate tree shape, not the draft's own fields.
  const flat = flattenGroups(state.groups);
  const selectedEntry = flat.find((f) => f.node.groupId === selectedId);
  if (!selectedEntry) return null;
  const path = selectedEntry.path;

  const onDeleteNode = (p: Path) => {
    setState((prev) => ({ ...prev, groups: deleteGroupAtPath(prev.groups, p) }));
  };
  const onMoveNode = (p: Path, direction: -1 | 1) => {
    setState((prev) => ({ ...prev, groups: moveGroupAtPath(prev.groups, p, direction) }));
  };

  return (
    <GroupEditor
      key={selectedId}
      groupId={selectedId}
      path={path}
      columns={columns}
      unassignedColIds={unassignedColIds}
      onDeleteNode={onDeleteNode}
      onMoveNode={onMoveNode}
      depth={selectedEntry.depth}
      isFirst={selectedEntry.siblingIndex === 0}
      isLast={selectedEntry.siblingIndex === selectedEntry.siblings - 1}
    />
  );
}

// ─── Per-group editor ──────────────────────────────────────────────────

interface GroupEditorProps {
  groupId: string;
  path: Path;
  depth: number;
  columns: readonly GridColumnInfo[];
  unassignedColIds: Set<string>;
  onDeleteNode: (path: Path) => void;
  onMoveNode: (path: Path, direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}

const GroupEditor = memo(function GroupEditor({
  groupId,
  path,
  depth,
  columns,
  unassignedColIds,
  onDeleteNode,
  onMoveNode,
  isFirst,
  isLast,
}: GroupEditorProps) {
  // Draft for the selected group node. `selectItem` walks the tree to
  // find the node by id; `commitItem` writes the edited node back at the
  // same path. Same Save/Dirty flow the other editors use.
  const { draft, setDraft, dirty, save, missing } = useModuleDraft<
    ColumnGroupsState,
    ColumnGroupNode
  >({
    moduleId: MODULE_ID,
    itemId: groupId,
    selectItem: (state) => {
      const flat = flattenGroups(state.groups);
      return flat.find((f) => f.node.groupId === groupId)?.node;
    },
    commitItem: (next) => (state) => ({
      ...state,
      groups: updateGroupAtPath(state.groups, path, () => next),
    }),
  });

  if (missing || !draft) return null;
  const node = draft;

  const updateDraft = (updater: (n: ColumnGroupNode) => ColumnGroupNode) => {
    setDraft((prev) => updater(prev));
  };

  const columnChildren = node.children.filter(
    (c) => c.kind === 'col',
  ) as Array<{ kind: 'col'; colId: string; show?: GroupChildShow }>;
  const subgroups = node.children.filter(
    (c) => c.kind === 'group',
  ) as Array<{ kind: 'group'; group: ColumnGroupNode }>;

  const eligibleToAdd = columns
    .filter((c) => unassignedColIds.has(c.colId) || columnChildren.some((cc) => cc.colId === c.colId))
    .filter((c) => !columnChildren.some((cc) => cc.colId === c.colId));

  const addColumn = (colId: string) => {
    if (!colId) return;
    updateDraft((n) => ({ ...n, children: [...n.children, { kind: 'col', colId }] }));
  };
  const removeColumn = (colId: string) => {
    updateDraft((n) => ({
      ...n,
      children: n.children.filter((c) => !(c.kind === 'col' && c.colId === colId)),
    }));
  };
  const cycleColumnShow = (colId: string) => {
    updateDraft((n) => ({
      ...n,
      children: n.children.map((c) => {
        if (c.kind !== 'col' || c.colId !== colId) return c;
        return { ...c, show: nextShowMode(c.show) };
      }),
    }));
  };

  // Hard cap on nesting — 3 levels total. Depth 0 = root; depth 2 is the
  // floor (no further subgroups).
  const MAX_SUBGROUP_DEPTH = 2;
  const canAddSubgroup = depth < MAX_SUBGROUP_DEPTH;

  const addSubgroup = () => {
    if (!canAddSubgroup) return;
    updateDraft((n) => ({
      ...n,
      children: [
        ...n.children,
        {
          kind: 'group',
          group: {
            groupId: generateGroupId(),
            headerName: 'New Subgroup',
            children: [],
            openByDefault: false,
          },
        },
      ],
    }));
  };

  const headerStyleValue = headerStyleToEditor(node.headerStyle);
  const onHeaderStyleChange = (patch: Partial<StyleEditorValue>) => {
    const next = headerStyleFromEditor(node.headerStyle, { ...headerStyleValue, ...patch });
    updateDraft((n) => ({ ...n, headerStyle: next }));
  };

  return (
    <div
      data-testid={`cg-group-editor-${node.groupId}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div className="gc-editor-header">
        <ObjectTitleRow
          title={
            <TitleInput
              value={node.headerName}
              onChange={(e) => updateDraft((n) => ({ ...n, headerName: e.target.value }))}
              placeholder="Group name"
              data-testid={`cg-name-${node.groupId}`}
            />
          }
          actions={
            <>
              <SharpBtn
                variant="ghost"
                onClick={() => !isFirst && onMoveNode(path, -1)}
                title="Move up"
                disabled={isFirst}
                data-testid={`cg-up-${node.groupId}`}
              >
                <ArrowUp size={11} strokeWidth={2} />
              </SharpBtn>
              <SharpBtn
                variant="ghost"
                onClick={() => !isLast && onMoveNode(path, 1)}
                title="Move down"
                disabled={isLast}
                data-testid={`cg-down-${node.groupId}`}
              >
                <ArrowDown size={11} strokeWidth={2} />
              </SharpBtn>
              <SharpBtn
                variant={dirty ? 'action' : 'ghost'}
                disabled={!dirty}
                onClick={save}
                data-testid={`cg-save-${node.groupId}`}
              >
                <Save size={13} strokeWidth={2} /> SAVE
              </SharpBtn>
              <SharpBtn
                variant="danger"
                onClick={() => onDeleteNode(path)}
                data-testid={`cg-delete-${node.groupId}`}
              >
                <Trash2 size={13} strokeWidth={2} /> DELETE
              </SharpBtn>
            </>
          }
        />
      </div>

      <div className="gc-editor-scroll">
        <div className="gc-meta-grid">
          <MetaCell
            label="OPEN BY DEFAULT"
            value={
              <Switch
                checked={!!node.openByDefault}
                onChange={() => updateDraft((n) => ({ ...n, openByDefault: !n.openByDefault }))}
              />
            }
          />
          <MetaCell
            label="MARRY CHILDREN"
            value={
              <Switch
                checked={!!node.marryChildren}
                onChange={() => updateDraft((n) => ({ ...n, marryChildren: !n.marryChildren }))}
              />
            }
          />
          <MetaCell label="DEPTH" value={<Mono>{String(depth).padStart(2, '0')}</Mono>} />
          <MetaCell
            label="CHILDREN"
            value={
              <Mono>
                {columnChildren.length} col · {subgroups.length} sub
              </Mono>
            }
          />
        </div>

        <Band
          index="01"
          title="COLUMNS"
          trailing={
            <button
              type="button"
              onClick={addSubgroup}
              disabled={!canAddSubgroup}
              data-testid={`cg-add-sub-${node.groupId}`}
              title={canAddSubgroup ? 'Add subgroup' : 'Maximum nesting depth reached (3 levels)'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '0 10px',
                height: 24,
                fontSize: 10,
                color: 'var(--ck-t1)',
                background: 'transparent',
                border: '1px solid var(--ck-border-hi)',
                borderRadius: 2,
                cursor: canAddSubgroup ? 'pointer' : 'not-allowed',
                opacity: canAddSubgroup ? 1 : 0.35,
                fontFamily: 'var(--ck-font-sans)',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <FolderPlus size={12} strokeWidth={1.75} /> SUBGROUP
            </button>
          }
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {columnChildren.map((c) => {
              const info = columns.find((a) => a.colId === c.colId);
              const show = c.show ?? 'always';
              return (
                <span
                  key={c.colId}
                  data-v2-chip=""
                  data-show={show}
                  data-testid={`cg-chip-${node.groupId}-${c.colId}`}
                  title={showTooltip(show)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 4px 3px 8px',
                    borderRadius: 2,
                    background: 'var(--ck-bg)',
                    border: '1px solid var(--ck-border-hi)',
                    fontFamily: 'var(--ck-font-mono)',
                    fontSize: 11,
                    color: 'var(--ck-t0)',
                  }}
                >
                  {info?.headerName ?? c.colId}
                  <button
                    type="button"
                    onClick={() => cycleColumnShow(c.colId)}
                    title={showTooltip(show)}
                    data-testid={`cg-chip-show-${node.groupId}-${c.colId}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: showAccentColor(show),
                      padding: 0,
                      borderRadius: 2,
                    }}
                  >
                    {showIcon(show)}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeColumn(c.colId)}
                    title="Remove"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--ck-t2)',
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    <XIcon size={11} />
                  </button>
                </span>
              );
            })}
            {eligibleToAdd.length > 0 && (
              <Select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) addColumn(v);
                }}
                data-testid={`cg-add-col-${node.groupId}`}
                style={{ width: 'auto', height: 24, fontSize: 11 }}
              >
                <option value="">+ COLUMN…</option>
                {eligibleToAdd.map((c) => (
                  <option key={c.colId} value={c.colId}>
                    {c.headerName}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </Band>

        <StyleEditor
          value={headerStyleValue}
          onChange={onHeaderStyleChange}
          sections={['text', 'color', 'border']}
          dataType="text"
          data-testid={`cg-hdr-style-${node.groupId}`}
        />

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// ─── Legacy flat composition ───────────────────────────────────────────

export function ColumnGroupsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div
      data-testid="cg-panel"
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--ck-border)',
          overflowY: 'auto',
          background: 'var(--ck-surface)',
        }}
      >
        <ColumnGroupsList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section style={{ overflowY: 'auto' }}>
        <ColumnGroupsEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
