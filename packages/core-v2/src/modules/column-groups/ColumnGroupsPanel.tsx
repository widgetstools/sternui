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
import { Select, Switch } from '@grid-customizer/core';
import type { EditorPaneProps, ListPaneProps } from '../../core/types';
import { useGridCore, useGridStore } from '../../ui/GridContext';
import { useDraftModuleItem } from '../../store/useDraftModuleItem';
import { useModuleState } from '../../store/useModuleState';
import {
  Band,
  Caps,
  IconInput,
  LedBar,
  MetaCell,
  Mono,
  ObjectTitleRow,
  SharpBtn,
  SubLabel,
  TitleInput,
} from '../../ui/SettingsPanel';
import { StyleEditor, type StyleEditorValue } from '../../ui/StyleEditor';
import type {
  ColumnGroupChild,
  ColumnGroupNode,
  ColumnGroupsState,
  GroupChildShow,
  GroupHeaderStyle,
} from './state';
import { collectAssignedColIds } from './composeGroups';

/**
 * Column Groups — Cockpit master-detail panel.
 *
 * Tree is flattened for the list rail (depth shown via indent). The
 * editor pane edits one selected group node. Add-subgroup acts on the
 * currently selected node. The legacy tree mutation helpers are kept;
 * only the chrome + navigation shifted.
 */

// ─── Visibility cycle helpers (unchanged from v1) ────────────────────────────

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

// ─── headerStyle ↔ StyleEditorValue ─────────────────────────────────────────

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
    // Shape-compatible with StyleEditorValue.borders (same `BorderSpec`
    // triplet of width/color/style per side).
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
  // Drop an empty borders map so the persisted state stays lean.
  if (next.borders && Object.values(next.borders).every((v) => v === undefined)) {
    delete next.borders;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

// ─── ID generator ───────────────────────────────────────────────────────────

function generateGroupId(): string {
  return `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Tree helpers (unchanged) ───────────────────────────────────────────────

type Path = number[];

function updateGroupAtPath(
  groups: ColumnGroupNode[],
  path: Path,
  updater: (node: ColumnGroupNode) => ColumnGroupNode,
): ColumnGroupNode[] {
  if (path.length === 0) return groups;
  const [idx, ...rest] = path;
  return groups.map((g, i) => {
    if (i !== idx) return g;
    if (rest.length === 0) return updater(g);
    return { ...g, children: updateChildGroup(g.children, rest, updater) };
  });
}

function updateChildGroup(
  children: ColumnGroupChild[],
  path: Path,
  updater: (node: ColumnGroupNode) => ColumnGroupNode,
): ColumnGroupChild[] {
  const [nestedIdx, ...rest] = path;
  let seen = -1;
  return children.map((child) => {
    if (child.kind !== 'group') return child;
    seen += 1;
    if (seen !== nestedIdx) return child;
    if (rest.length === 0) return { kind: 'group', group: updater(child.group) };
    return {
      kind: 'group',
      group: { ...child.group, children: updateChildGroup(child.group.children, rest, updater) },
    };
  });
}

function deleteGroupAtPath(groups: ColumnGroupNode[], path: Path): ColumnGroupNode[] {
  if (path.length === 0) return groups;
  if (path.length === 1) return groups.filter((_, i) => i !== path[0]);
  const [idx, ...rest] = path;
  return groups.map((g, i) => (i === idx ? { ...g, children: deleteChildGroup(g.children, rest) } : g));
}

function deleteChildGroup(children: ColumnGroupChild[], path: Path): ColumnGroupChild[] {
  const [nestedIdx, ...rest] = path;
  if (rest.length === 0) {
    let seen = -1;
    return children.filter((child) => {
      if (child.kind !== 'group') return true;
      seen += 1;
      return seen !== nestedIdx;
    });
  }
  let seen = -1;
  return children.map((child) => {
    if (child.kind !== 'group') return child;
    seen += 1;
    if (seen !== nestedIdx) return child;
    return {
      kind: 'group',
      group: { ...child.group, children: deleteChildGroup(child.group.children, rest) },
    };
  });
}

function moveGroupAtPath(
  groups: ColumnGroupNode[],
  path: Path,
  direction: -1 | 1,
): ColumnGroupNode[] {
  if (path.length === 0) return groups;
  if (path.length === 1) {
    const idx = path[0];
    const next = idx + direction;
    if (next < 0 || next >= groups.length) return groups;
    const copy = groups.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    return copy;
  }
  const [idx, ...rest] = path;
  return groups.map((g, i) => (i === idx ? { ...g, children: moveChildGroup(g.children, rest, direction) } : g));
}

function moveChildGroup(children: ColumnGroupChild[], path: Path, direction: -1 | 1): ColumnGroupChild[] {
  const [nestedIdx, ...rest] = path;
  if (rest.length === 0) {
    const groupIndices: number[] = [];
    children.forEach((c, i) => {
      if (c.kind === 'group') groupIndices.push(i);
    });
    if (nestedIdx < 0 || nestedIdx >= groupIndices.length) return children;
    const nextGroupIdx = nestedIdx + direction;
    if (nextGroupIdx < 0 || nextGroupIdx >= groupIndices.length) return children;
    const a = groupIndices[nestedIdx];
    const b = groupIndices[nextGroupIdx];
    const copy = children.slice();
    [copy[a], copy[b]] = [copy[b], copy[a]];
    return copy;
  }
  let seen = -1;
  return children.map((child) => {
    if (child.kind !== 'group') return child;
    seen += 1;
    if (seen !== nestedIdx) return child;
    return {
      kind: 'group',
      group: { ...child.group, children: moveChildGroup(child.group.children, rest, direction) },
    };
  });
}

// Flatten the tree in DFS order for the list rail; track depth + path.
interface FlatGroup {
  node: ColumnGroupNode;
  depth: number;
  path: Path;
  siblings: number;
  siblingIndex: number;
}

function flattenGroups(groups: ColumnGroupNode[], depth = 0, prefix: Path = []): FlatGroup[] {
  const out: FlatGroup[] = [];
  groups.forEach((node, i) => {
    const path = [...prefix, i];
    out.push({ node, depth, path, siblings: groups.length, siblingIndex: i });
    const subgroups = node.children.filter((c) => c.kind === 'group') as Array<{ kind: 'group'; group: ColumnGroupNode }>;
    const nestedGroups = subgroups.map((sg) => sg.group);
    out.push(...flattenGroups(nestedGroups, depth + 1, path));
  });
  return out;
}

// Lookup a node by path.
function findGroupByPath(groups: ColumnGroupNode[], path: Path): ColumnGroupNode | null {
  if (path.length === 0) return null;
  let current: ColumnGroupNode | undefined = groups[path[0]];
  for (let i = 1; i < path.length; i++) {
    if (!current) return null;
    const subgroups = current.children.filter((c) => c.kind === 'group') as Array<{ kind: 'group'; group: ColumnGroupNode }>;
    current = subgroups[path[i]]?.group;
  }
  return current ?? null;
}

// ─── Column enumeration ─────────────────────────────────────────────────────

interface ColumnInfo {
  colId: string;
  headerName: string;
}

function useGridColumns(): ColumnInfo[] {
  const core = useGridCore();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const handler = () => setTick((n) => n + 1);
    const events = ['displayedColumnsChanged', 'columnEverythingChanged'] as const;
    for (const evt of events) {
      try {
        api.addEventListener(evt, handler);
      } catch {
        /* */
      }
    }
    return () => {
      for (const evt of events) {
        try {
          api.removeEventListener(evt, handler);
        } catch {
          /* */
        }
      }
    };
  }, [core]);
  return useMemo(() => {
    const api = core.getGridApi();
    if (!api) return [];
    try {
      const cols = api.getColumns?.() ?? [];
      return cols.map((c) => ({
        colId: c.getColId(),
        headerName: c.getColDef().headerName ?? c.getColId(),
      }));
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, tick]);
}

// ─── List pane ──────────────────────────────────────────────────────────────

export function ColumnGroupsList({ selectedId, onSelect }: ListPaneProps) {
  const store = useGridStore();
  const [state, setState] = useModuleState<ColumnGroupsState>(store, 'column-groups');
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
      <ul className="gc-popout-list-items">
        {flat.map((fg) => {
          const active = fg.node.groupId === selectedId;
          const colCount = fg.node.children.filter((c) => c.kind === 'col').length;
          const subCount = fg.node.children.filter((c) => c.kind === 'group').length;
          return (
            <li key={fg.node.groupId}>
              <button
                type="button"
                className="gc-popout-list-item"
                aria-selected={active}
                onClick={() => onSelect(fg.node.groupId)}
                data-testid={`cg-group-${fg.node.groupId}`}
                style={{ paddingLeft: 10 + fg.depth * 18 }}
              >
                <span style={{ width: 2, display: 'inline-flex' }}>
                  <DirtyListLed itemId={fg.node.groupId} />
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
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ─── Dirty broadcaster (same pattern as the other editors) ──────────────────
//
// Module-local so the list rail can render an amber LED when the editor
// has pending edits on a specific group. Not persisted.

const dirtyRegistry = new Set<string>();
function setDirty(itemId: string, value: boolean) {
  const key = `column-groups:${itemId}`;
  const before = dirtyRegistry.has(key);
  if (value) dirtyRegistry.add(key);
  else dirtyRegistry.delete(key);
  if (before !== value) window.dispatchEvent(new CustomEvent('gc-dirty-change'));
}
function isDirty(itemId: string): boolean {
  return dirtyRegistry.has(`column-groups:${itemId}`);
}

/** LED probe for the list rail — amber when the editor reports this
 *  group has pending changes. */
function DirtyListLed({ itemId }: { itemId: string }) {
  const [dirty, setDirtyState] = useState<boolean>(() => isDirty(itemId));
  useEffect(() => {
    const handler = () => setDirtyState(isDirty(itemId));
    window.addEventListener('gc-dirty-change', handler);
    return () => window.removeEventListener('gc-dirty-change', handler);
  }, [itemId]);
  if (!dirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── Editor pane ────────────────────────────────────────────────────────────

export function ColumnGroupsEditor({ selectedId }: EditorPaneProps) {
  const store = useGridStore();
  const [state, setState] = useModuleState<ColumnGroupsState>(store, 'column-groups');
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

  // Find the path of the selected group in the tree. `flat` is still
  // read from committed state so Move/Delete operate on the real tree.
  const flat = flattenGroups(state.groups);
  const selectedEntry = flat.find((f) => f.node.groupId === selectedId);
  if (!selectedEntry) return null;
  const path = selectedEntry.path;

  // Structural ops — Delete + Move — always commit directly to the store.
  // They manipulate the tree shape, not the group's own fields.
  const onDeleteNode = (p: Path) => {
    setState((prev) => ({ ...prev, groups: deleteGroupAtPath(prev.groups, p) }));
    setDirty(selectedId, false);
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

interface GroupEditorProps {
  groupId: string;
  path: Path;
  depth: number;
  columns: ColumnInfo[];
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
  const store = useGridStore();

  // Draft for the selected group node. `selectItem` walks the tree to find
  // the node by id; `commitItem` writes the edited node back at the same
  // path. That gives us the same Save / Dirty flow the other two editors
  // use, without turning the tree editor into a full draft-per-node model.
  const { draft, setDraft, dirty, save, missing } = useDraftModuleItem<
    ColumnGroupsState,
    ColumnGroupNode
  >({
    store,
    moduleId: 'column-groups',
    selectItem: (state) => {
      const flat = flattenGroups(state.groups);
      return flat.find((f) => f.node.groupId === groupId)?.node;
    },
    commitItem: (next) => (state) => ({
      ...state,
      groups: updateGroupAtPath(state.groups, path, () => next),
    }),
  });

  // Publish dirty state so the list rail can paint its amber LED.
  useEffect(() => {
    setDirty(groupId, dirty);
    return () => setDirty(groupId, false);
  }, [groupId, dirty]);

  if (missing || !draft) return null;
  const node = draft;

  const onUpdateNode = (_p: Path, updater: (n: ColumnGroupNode) => ColumnGroupNode) => {
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
    onUpdateNode(path, (n) => ({
      ...n,
      children: [...n.children, { kind: 'col', colId }],
    }));
  };
  const removeColumn = (colId: string) => {
    onUpdateNode(path, (n) => ({
      ...n,
      children: n.children.filter((c) => !(c.kind === 'col' && c.colId === colId)),
    }));
  };
  const cycleColumnShow = (colId: string) => {
    onUpdateNode(path, (n) => ({
      ...n,
      children: n.children.map((c) => {
        if (c.kind !== 'col' || c.colId !== colId) return c;
        return { ...c, show: nextShowMode(c.show) };
      }),
    }));
  };
  // Hard cap on nesting: 3 levels total, counting the topmost node as
  // level 1. That means a depth-0 (root) group can add a subgroup, a
  // depth-1 subgroup can add one more sub-subgroup, and depth-2 is the
  // floor — no further nesting.
  const MAX_SUBGROUP_DEPTH = 2;
  const canAddSubgroup = depth < MAX_SUBGROUP_DEPTH;

  const addSubgroup = () => {
    if (!canAddSubgroup) return;
    onUpdateNode(path, (n) => ({
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
    onUpdateNode(path, (n) => ({ ...n, headerStyle: next }));
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
            onChange={(e) => onUpdateNode(path, (n) => ({ ...n, headerName: e.target.value }))}
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
            <SharpBtn variant="danger" onClick={() => onDeleteNode(path)} data-testid={`cg-delete-${node.groupId}`}>
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
              onChange={() => onUpdateNode(path, (n) => ({ ...n, openByDefault: !n.openByDefault }))}
            />
          }
        />
        <MetaCell
          label="MARRY CHILDREN"
          value={
            <Switch
              checked={!!node.marryChildren}
              onChange={() => onUpdateNode(path, (n) => ({ ...n, marryChildren: !n.marryChildren }))}
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

// Legacy flat panel fallback
export function ColumnGroupsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div data-testid="cg-panel" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}>
      <aside style={{ borderRight: '1px solid var(--ck-border)', overflowY: 'auto', background: 'var(--ck-surface)' }}>
        <ColumnGroupsList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section style={{ overflowY: 'auto' }}>
        <ColumnGroupsEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
