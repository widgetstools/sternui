import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@starui/ui';
import type { RoleRow, UserProfileRow } from '@starui/config-service';

/**
 * Users × roles assignment surface from design Decision 12.2.
 *
 * Two layouts toggle via the mode pill:
 *   - "by-user" — rows = users, chips per row = their roles.
 *   - "by-role" — rows = roles, chips per row = the users assigned.
 *
 * Both views ultimately mutate `user.roleIds`. The component is
 * controlled — every change emits the next `users` array via
 * `onChange`. The host owns persistence (Save changes button outside
 * this matrix), which keeps the Session 14 optimistic-locking flow
 * simple — one saveUserProfile call per row, not one per chip toggle.
 */

export type RoleAssignmentMode = 'by-user' | 'by-role';

export interface RoleAssignmentMatrixProps {
  users: UserProfileRow[];
  roles: RoleRow[];
  onChange: (next: UserProfileRow[]) => void;
  /** Optional initial layout. Defaults to "by-user". */
  initialMode?: RoleAssignmentMode;
}

function addRoleToUser(user: UserProfileRow, roleId: string): UserProfileRow {
  if (user.roleIds.includes(roleId)) return user;
  return { ...user, roleIds: [...user.roleIds, roleId] };
}

function removeRoleFromUser(
  user: UserProfileRow,
  roleId: string,
): UserProfileRow {
  if (!user.roleIds.includes(roleId)) return user;
  return { ...user, roleIds: user.roleIds.filter((id) => id !== roleId) };
}

export function RoleAssignmentMatrix({
  users,
  roles,
  onChange,
  initialMode = 'by-user',
}: RoleAssignmentMatrixProps) {
  const [mode, setMode] = useState<RoleAssignmentMode>(initialMode);
  const [filter, setFilter] = useState('');

  const roleById = useMemo(() => {
    const map = new Map<string, RoleRow>();
    for (const r of roles) map.set(r.roleId, r);
    return map;
  }, [roles]);

  const userById = useMemo(() => {
    const map = new Map<string, UserProfileRow>();
    for (const u of users) map.set(u.userId, u);
    return map;
  }, [users]);

  const needle = filter.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    if (needle.length === 0) return users;
    return users.filter(
      (u) =>
        u.userId.toLowerCase().includes(needle) ||
        u.displayName.toLowerCase().includes(needle),
    );
  }, [users, needle]);

  const filteredRoles = useMemo(() => {
    if (needle.length === 0) return roles;
    return roles.filter(
      (r) =>
        r.roleId.toLowerCase().includes(needle) ||
        r.displayName.toLowerCase().includes(needle),
    );
  }, [roles, needle]);

  function handleAddRole(userId: string, roleId: string) {
    onChange(
      users.map((u) => (u.userId === userId ? addRoleToUser(u, roleId) : u)),
    );
  }

  function handleRemoveRole(userId: string, roleId: string) {
    onChange(
      users.map((u) =>
        u.userId === userId ? removeRoleFromUser(u, roleId) : u,
      ),
    );
  }

  return (
    <div
      className="flex flex-col gap-3 bg-background text-foreground"
      data-testid="role-assignment-matrix"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => {
            if (v === 'by-user' || v === 'by-role') setMode(v);
          }}
          aria-label="Assignment view"
          data-testid="role-assignment-matrix-mode"
        >
          <ToggleGroupItem
            value="by-user"
            aria-label="Group by user"
            data-testid="role-assignment-matrix-mode-by-user"
          >
            By user
          </ToggleGroupItem>
          <ToggleGroupItem
            value="by-role"
            aria-label="Group by role"
            data-testid="role-assignment-matrix-mode-by-role"
          >
            By role
          </ToggleGroupItem>
        </ToggleGroup>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={
            mode === 'by-user'
              ? 'Filter users by id or name…'
              : 'Filter roles by id or name…'
          }
          className="max-w-sm"
          data-testid="role-assignment-matrix-filter"
        />
      </div>
      <div className="rounded-md border border-border">
        {mode === 'by-user' ? (
          <ByUserTable
            users={filteredUsers}
            roles={roles}
            roleById={roleById}
            onAdd={handleAddRole}
            onRemove={handleRemoveRole}
          />
        ) : (
          <ByRoleTable
            roles={filteredRoles}
            users={users}
            userById={userById}
            onAdd={handleAddRole}
            onRemove={handleRemoveRole}
          />
        )}
      </div>
    </div>
  );
}

interface ByUserProps {
  users: UserProfileRow[];
  roles: RoleRow[];
  roleById: Map<string, RoleRow>;
  onAdd: (userId: string, roleId: string) => void;
  onRemove: (userId: string, roleId: string) => void;
}

function ByUserTable({ users, roles, roleById, onAdd, onRemove }: ByUserProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3">User</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead className="w-32" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={3}
              className="text-center text-muted-foreground"
            >
              No users match.
            </TableCell>
          </TableRow>
        ) : (
          users.map((u) => {
            const assigned = u.roleIds;
            const available = roles.filter((r) => !assigned.includes(r.roleId));
            return (
              <TableRow
                key={u.userId}
                data-testid={`role-assignment-matrix-user-${u.userId}`}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{u.displayName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {u.userId}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {assigned.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No roles assigned.
                      </span>
                    ) : (
                      assigned.map((rid) => (
                        <RoleChip
                          key={rid}
                          label={roleById.get(rid)?.displayName ?? rid}
                          subLabel={rid}
                          onRemove={() => onRemove(u.userId, rid)}
                          testId={`role-assignment-matrix-chip-${u.userId}-${rid}`}
                        />
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <AddPicker
                    label="Add role"
                    placeholder="Pick a role…"
                    options={available.map((r) => ({
                      value: r.roleId,
                      primary: r.displayName,
                      secondary: r.roleId,
                    }))}
                    onPick={(rid) => onAdd(u.userId, rid)}
                    testId={`role-assignment-matrix-add-${u.userId}`}
                  />
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

interface ByRoleProps {
  roles: RoleRow[];
  users: UserProfileRow[];
  userById: Map<string, UserProfileRow>;
  onAdd: (userId: string, roleId: string) => void;
  onRemove: (userId: string, roleId: string) => void;
}

function ByRoleTable({ roles, users, userById, onAdd, onRemove }: ByRoleProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3">Role</TableHead>
          <TableHead>Users</TableHead>
          <TableHead className="w-32" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {roles.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={3}
              className="text-center text-muted-foreground"
            >
              No roles match.
            </TableCell>
          </TableRow>
        ) : (
          roles.map((r) => {
            const assignedUsers = users.filter((u) =>
              u.roleIds.includes(r.roleId),
            );
            const available = users.filter(
              (u) => !u.roleIds.includes(r.roleId),
            );
            return (
              <TableRow
                key={r.roleId}
                data-testid={`role-assignment-matrix-role-${r.roleId}`}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{r.displayName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.roleId}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {assignedUsers.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No users assigned.
                      </span>
                    ) : (
                      assignedUsers.map((u) => (
                        <RoleChip
                          key={u.userId}
                          label={
                            userById.get(u.userId)?.displayName ?? u.userId
                          }
                          subLabel={u.userId}
                          onRemove={() => onRemove(u.userId, r.roleId)}
                          testId={`role-assignment-matrix-chip-${r.roleId}-${u.userId}`}
                        />
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <AddPicker
                    label="Add user"
                    placeholder="Pick a user…"
                    options={available.map((u) => ({
                      value: u.userId,
                      primary: u.displayName,
                      secondary: u.userId,
                    }))}
                    onPick={(uid) => onAdd(uid, r.roleId)}
                    testId={`role-assignment-matrix-add-${r.roleId}`}
                  />
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

interface RoleChipProps {
  label: string;
  subLabel: string;
  onRemove: () => void;
  testId: string;
}

function RoleChip({ label, subLabel, onRemove, testId }: RoleChipProps) {
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 pr-1"
      data-testid={testId}
      title={subLabel}
    >
      <span>{label}</span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        className="rounded-sm px-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={onRemove}
        data-testid={`${testId}-remove`}
      >
        ×
      </button>
    </Badge>
  );
}

interface AddPickerProps {
  label: string;
  placeholder: string;
  options: { value: string; primary: string; secondary: string }[];
  onPick: (value: string) => void;
  testId: string;
}

function AddPicker({
  label,
  placeholder,
  options,
  onPick,
  testId,
}: AddPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const filtered =
    needle.length === 0
      ? options
      : options.filter(
          (o) =>
            o.primary.toLowerCase().includes(needle) ||
            o.secondary.toLowerCase().includes(needle),
        );

  if (options.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" data-testid={testId}>
        All assigned
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          data-testid={testId}
          aria-label={label}
        >
          + {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="mb-2"
          data-testid={`${testId}-search`}
        />
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <span className="px-2 py-1 text-xs text-muted-foreground">
              No matches.
            </span>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className="flex flex-col items-start rounded-sm px-2 py-1 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => {
                  onPick(o.value);
                  setQuery('');
                  setOpen(false);
                }}
                data-testid={`${testId}-option-${o.value}`}
              >
                <span className="text-sm">{o.primary}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {o.secondary}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
