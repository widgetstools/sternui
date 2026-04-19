/**
 * Column Groups panel — recursive tree editor.
 *
 * Left: list of top-level groups with + to add. Right: editor for the
 * selected group — headerName, openByDefault / marryChildren, child
 * management (add leaf, add subgroup, remove), and a style sub-editor
 * via StyleEditor(sections=['text','color','border']).
 *
 * Nested subgroups are edited by selecting the group on the left then
 * clicking into a child subgroup pill (stateful in-panel navigation).
 */
import { useCallback, useMemo, useState } from 'react';
import { Plus, Trash2, ChevronRight, Folder, Columns } from 'lucide-react';
import { useGridApi } from '../../hooks/useGridApi';
import { useModuleState } from '../../hooks/useModuleState';
import {
  Band,
  Caps,
  IconInput,
  ItemCard,
  Row,
  SharpBtn,
} from '../../ui/settings';
import { StyleEditor, type StyleEditorValue } from '../../ui/StyleEditor';
import { Switch } from '../../ui/shadcn/switch';
import type { SettingsPanelProps } from '../../platform/types';
import {
  type ColumnGroupChild,
  type ColumnGroupNode,
  type ColumnGroupsState,
  type GroupChildShow,
  type GroupHeaderStyle,
} from './state';
import { collectAssignedColIds } from './composeGroups';

const MODULE_ID = 'column-groups';

export function ColumnGroupsPanel(_props: SettingsPanelProps) {
  const [state, setState] = useModuleState<ColumnGroupsState>(MODULE_ID);
  // Path into the tree — array of groupIds from root → current.
  const [path, setPath] = useState<string[]>(
    () => (state.groups[0] ? [state.groups[0].groupId] : []),
  );

  const selected = findByPath(state.groups, path);

  const update = useCallback(
    (nextGroups: ColumnGroupNode[]) => setState((prev) => ({ ...prev, groups: nextGroups })),
    [setState],
  );

  const updateSelected = useCallback(
    (patch: Partial<ColumnGroupNode>) => {
      if (path.length === 0) return;
      update(mutateByPath(state.groups, path, (g) => ({ ...g, ...patch })));
    },
    [path, state.groups, update],
  );

  const addTopLevel = useCallback(() => {
    const groupId = `grp-${Date.now().toString(36)}`;
    const next: ColumnGroupNode = { groupId, headerName: 'New group', children: [] };
    update([...state.groups, next]);
    setPath([groupId]);
  }, [state.groups, update]);

  const removeSelected = useCallback(() => {
    if (path.length === 0) return;
    update(deleteByPath(state.groups, path));
    setPath(path.slice(0, -1));
  }, [path, state.groups, update]);

  return (
    <div className="gc-sheet gc-panel-column-groups" style={{ display: 'flex', height: '100%' }}>
      <aside style={{
        width: 240,
        borderRight: '1px solid var(--ck-border)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <header style={{ display: 'flex', alignItems: 'center', padding: '10px 12px' }}>
          <Caps size={11} style={{ flex: 1 }}>Groups ({state.groups.length})</Caps>
          <SharpBtn variant="action" onClick={addTopLevel} title="Add group" testId="cg-new-group">
            <Plus size={12} strokeWidth={2.25} />
          </SharpBtn>
        </header>
        {state.groups.map((g) => (
          <GroupListItem
            key={g.groupId}
            group={g}
            path={[g.groupId]}
            currentPath={path}
            onSelect={setPath}
            depth={0}
          />
        ))}
      </aside>

      <section style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {selected ? (
          <GroupEditor
            group={selected}
            onChange={updateSelected}
            onDelete={removeSelected}
            onAddSubgroup={(child) => {
              const updated: ColumnGroupNode = {
                ...selected,
                children: [...selected.children, child],
              };
              updateSelected(updated);
            }}
            onRemoveChild={(idx) => {
              const children = selected.children.slice();
              children.splice(idx, 1);
              updateSelected({ children });
            }}
            onUpdateChildShow={(idx, show) => {
              const children = selected.children.slice();
              const child = children[idx];
              if (!child || child.kind !== 'col') return;
              children[idx] = { ...child, show };
              updateSelected({ children });
            }}
            onEnterSubgroup={(subId) => setPath([...path, subId])}
            allGroups={state.groups}
          />
        ) : (
          <div style={{ padding: 24, color: 'var(--ck-t3)' }}>
            Select a group or press <strong>+</strong> to create one.
          </div>
        )}
      </section>
    </div>
  );
}

// ─── List item (recursive) ─────────────────────────────────────────────────

function GroupListItem({
  group, path, currentPath, onSelect, depth,
}: {
  group: ColumnGroupNode;
  path: string[];
  currentPath: string[];
  onSelect: (path: string[]) => void;
  depth: number;
}) {
  const active = currentPath.length === path.length && currentPath.every((p, i) => p === path[i]);
  const onPath = path.every((p, i) => p === currentPath[i]);
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(path)}
        data-testid={`cg-list-${group.groupId}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', textAlign: 'left',
          padding: `6px 12px 6px ${12 + depth * 14}px`,
          background: active ? 'var(--ck-card)' : 'transparent',
          color: active ? 'var(--ck-t0)' : 'var(--ck-t1)',
          border: 'none',
          borderLeft: active ? '2px solid var(--ck-green)' : '2px solid transparent',
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        {depth > 0 && <ChevronRight size={10} />}
        <Folder size={12} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.headerName}
        </span>
        <span style={{ color: 'var(--ck-t3)', fontSize: 9 }}>{group.children.length}</span>
      </button>
      {onPath && group.children.map((c, i) =>
        c.kind === 'group' ? (
          <GroupListItem
            key={c.group.groupId}
            group={c.group}
            path={[...path, c.group.groupId]}
            currentPath={currentPath}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ) : null,
      ).filter(Boolean)}
    </>
  );
}

// ─── Editor ────────────────────────────────────────────────────────────────

function GroupEditor({
  group, onChange, onDelete, onAddSubgroup, onRemoveChild, onUpdateChildShow, onEnterSubgroup,
}: {
  group: ColumnGroupNode;
  onChange: (patch: Partial<ColumnGroupNode>) => void;
  onDelete: () => void;
  onAddSubgroup: (child: ColumnGroupChild) => void;
  onRemoveChild: (idx: number) => void;
  onUpdateChildShow: (idx: number, show: GroupChildShow) => void;
  onEnterSubgroup: (groupId: string) => void;
  allGroups: ColumnGroupNode[];
}) {
  const api = useGridApi();
  const availableCols = useMemo(() => {
    if (!api) return [];
    const assigned = new Set<string>();
    const walk = (list: ColumnGroupNode[]) => {
      for (const g of list) for (const c of g.children) {
        if (c.kind === 'col') assigned.add(c.colId);
        else walk([c.group]);
      }
    };
    // Note: show currently-assigned cols too — user might want to move one.
    return (api.getColumns() ?? []).map((c) => c.getColId());
  }, [api]);

  const styleValue = useMemo<StyleEditorValue>(
    () => headerStyleToEditorValue(group.headerStyle),
    [group.headerStyle],
  );

  return (
    <ItemCard
      title={group.headerName}
      onDelete={onDelete}
      testId={`cg-card-${group.groupId}`}
    >
      <Band index="01" title="Identity">
        <Row
          label="Header name"
          control={<IconInput value={group.headerName} onCommit={(v) => onChange({ headerName: v || group.headerName })} />}
        />
        <Row
          label="groupId"
          control={<IconInput value={group.groupId} onCommit={(v) => onChange({ groupId: v || group.groupId })} />}
        />
        <Row
          label="Open by default"
          control={<Switch checked={!!group.openByDefault} onChange={(e) => onChange({ openByDefault: (e.target as HTMLInputElement).checked })} />}
        />
        <Row
          label="Marry children"
          hint="Prevents dragging cols out of the group"
          control={<Switch checked={!!group.marryChildren} onChange={(e) => onChange({ marryChildren: (e.target as HTMLInputElement).checked })} />}
        />
      </Band>

      <Band index="02" title={`Children (${group.children.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {group.children.map((child, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px',
                background: 'var(--ck-card)',
                border: '1px solid var(--ck-border)',
                borderRadius: 2,
              }}
            >
              {child.kind === 'col' ? (
                <>
                  <Columns size={12} color="var(--ck-t2)" />
                  <span style={{ flex: 1, fontFamily: 'var(--ck-font-mono)', fontSize: 11 }}>{child.colId}</span>
                  <select
                    value={child.show ?? 'always'}
                    onChange={(e) => onUpdateChildShow(idx, e.target.value as GroupChildShow)}
                    style={{
                      height: 22, fontSize: 10,
                      background: 'var(--ck-bg)', color: 'var(--ck-t0)',
                      border: '1px solid var(--ck-border-hi)', borderRadius: 2,
                    }}
                  >
                    <option value="always">Always</option>
                    <option value="open">When open</option>
                    <option value="closed">When closed</option>
                  </select>
                </>
              ) : (
                <>
                  <Folder size={12} color="var(--ck-green)" />
                  <button
                    type="button"
                    onClick={() => onEnterSubgroup(child.group.groupId)}
                    style={{
                      flex: 1, textAlign: 'left', border: 'none',
                      background: 'transparent', color: 'var(--ck-t0)',
                      fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    {child.group.headerName} <span style={{ color: 'var(--ck-t3)', fontSize: 9 }}>· {child.group.children.length}</span>
                  </button>
                </>
              )}
              <SharpBtn variant="ghost" onClick={() => onRemoveChild(idx)} title="Remove">
                <Trash2 size={10} strokeWidth={2} />
              </SharpBtn>
            </div>
          ))}
          {group.children.length === 0 && (
            <div style={{ padding: 12, color: 'var(--ck-t3)', fontSize: 11 }}>No children yet.</div>
          )}
        </div>

        <AddChildRow
          availableCols={availableCols}
          onAddCol={(colId) => onAddSubgroup({ kind: 'col', colId })}
          onAddSubgroup={() => {
            const subId = `grp-${Date.now().toString(36)}`;
            onAddSubgroup({ kind: 'group', group: { groupId: subId, headerName: 'New subgroup', children: [] } });
          }}
        />
      </Band>

      <StyleEditor
        value={styleValue}
        onChange={(patch) => {
          const next: StyleEditorValue = { ...styleValue, ...patch };
          onChange({ headerStyle: editorValueToHeaderStyle(next) });
        }}
        sections={['text', 'color', 'border']}
        startIndex={3}
      />

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <SharpBtn variant="danger" onClick={onDelete} testId="cg-delete">
          <Trash2 size={12} strokeWidth={2.25} /> Delete group
        </SharpBtn>
      </div>
    </ItemCard>
  );
}

function AddChildRow({
  availableCols, onAddCol, onAddSubgroup,
}: {
  availableCols: string[];
  onAddCol: (colId: string) => void;
  onAddSubgroup: () => void;
}) {
  const [colId, setColId] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select
        value={colId}
        onChange={(e) => setColId(e.target.value)}
        style={{
          flex: 1, height: 26, fontSize: 11,
          background: 'var(--ck-bg)', color: 'var(--ck-t0)',
          border: '1px solid var(--ck-border-hi)', borderRadius: 2,
        }}
      >
        <option value="">— pick a column —</option>
        {availableCols.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <SharpBtn
        variant="default"
        disabled={!colId}
        onClick={() => { if (colId) { onAddCol(colId); setColId(''); } }}
      >+ Col</SharpBtn>
      <SharpBtn variant="default" onClick={onAddSubgroup}>+ Group</SharpBtn>
    </div>
  );
}

// ─── Path helpers ──────────────────────────────────────────────────────────

function findByPath(groups: ColumnGroupNode[], path: string[]): ColumnGroupNode | null {
  if (path.length === 0) return null;
  const head = groups.find((g) => g.groupId === path[0]);
  if (!head) return null;
  if (path.length === 1) return head;
  const sub = head.children
    .filter((c): c is Extract<ColumnGroupChild, { kind: 'group' }> => c.kind === 'group')
    .map((c) => c.group);
  return findByPath(sub, path.slice(1));
}

function mutateByPath(
  groups: ColumnGroupNode[],
  path: string[],
  mut: (g: ColumnGroupNode) => ColumnGroupNode,
): ColumnGroupNode[] {
  if (path.length === 0) return groups;
  return groups.map((g) => {
    if (g.groupId !== path[0]) return g;
    if (path.length === 1) return mut(g);
    return {
      ...g,
      children: g.children.map((c) =>
        c.kind === 'group'
          ? { kind: 'group', group: mutateByPath([c.group], path.slice(1), mut)[0] }
          : c,
      ),
    };
  });
}

function deleteByPath(groups: ColumnGroupNode[], path: string[]): ColumnGroupNode[] {
  if (path.length === 0) return groups;
  if (path.length === 1) return groups.filter((g) => g.groupId !== path[0]);
  return groups.map((g) => {
    if (g.groupId !== path[0]) return g;
    return {
      ...g,
      children: g.children
        .map((c) => {
          if (c.kind !== 'group') return c;
          if (path.length === 2 && c.group.groupId === path[1]) return null;
          return {
            kind: 'group' as const,
            group: deleteByPath([c.group], path.slice(1))[0] ?? c.group,
          };
        })
        .filter((c): c is ColumnGroupChild => c !== null),
    };
  });
}

// ─── Header style bridge (GroupHeaderStyle ↔ StyleEditorValue) ─────────────

function headerStyleToEditorValue(s: GroupHeaderStyle | undefined): StyleEditorValue {
  if (!s) return {};
  return {
    bold: s.bold,
    italic: s.italic,
    underline: s.underline,
    fontSize: s.fontSize,
    color: s.color,
    backgroundColor: s.background,
    align: s.align,
    borders: s.borders,
  };
}

function editorValueToHeaderStyle(v: StyleEditorValue): GroupHeaderStyle | undefined {
  const out: GroupHeaderStyle = {};
  if (v.bold) out.bold = true;
  if (v.italic) out.italic = true;
  if (v.underline) out.underline = true;
  if (v.fontSize !== undefined) out.fontSize = v.fontSize;
  if (v.color !== undefined) out.color = v.color;
  if (v.backgroundColor !== undefined) out.background = v.backgroundColor;
  if (v.align !== undefined && v.align !== 'justify') out.align = v.align;
  if (v.borders) out.borders = v.borders;
  return Object.keys(out).length > 0 ? out : undefined;
}

// collectAssignedColIds is imported to silence "unused" warnings if the
// panel later needs it.
void collectAssignedColIds;
