import { useState } from 'react';
import { NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Button } from '@starui/ui';
import { LogOut, Sun, Moon } from 'lucide-react';
import {
  AppRegistryEditor,
  PermissionsEditor,
  RolesEditor,
  UserProfileEditor,
} from '@starui/config-editor-ui';

import { AppSelector } from './AppSelector';
import { AppConfigList } from './views/AppConfigList';
import { PermissionMatrixView } from './views/PermissionMatrixView';
import { RoleAssignmentMatrixView } from './views/RoleAssignmentMatrixView';

export interface AppShellProps {
  onSignOut: () => void;
}

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/apps', label: 'Apps' },
  { to: '/configs', label: 'App configs' },
  { to: '/users', label: 'Users' },
  { to: '/roles', label: 'Roles' },
  { to: '/permissions', label: 'Permissions' },
  { to: '/permission-matrix', label: 'Permission matrix' },
  { to: '/role-assignment', label: 'Role assignment' },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const current = document.documentElement.dataset.theme;
    return current === 'light' ? 'light' : 'dark';
  });

  function flip() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={flip}
      aria-label="Toggle theme"
      data-testid="theme-toggle"
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

function ScopeRoutes({ appId }: { appId: string | null }) {
  return (
    <Routes>
      <Route element={<Outlet />}>
        <Route path="/apps" element={<AppRegistryEditor />} />
        <Route path="/configs" element={<AppConfigList appId={appId} />} />
        <Route
          path="/users"
          element={
            <UserProfileGate appId={appId}>
              <UserProfileEditor />
            </UserProfileGate>
          }
        />
        <Route path="/roles" element={<RolesEditor />} />
        <Route path="/permissions" element={<PermissionsEditor />} />
        <Route
          path="/permission-matrix"
          element={<PermissionMatrixView />}
        />
        <Route
          path="/role-assignment"
          element={<RoleAssignmentMatrixView />}
        />
        <Route path="*" element={<DefaultRedirect />} />
      </Route>
    </Routes>
  );
}

function DefaultRedirect() {
  const navigate = useNavigate();
  // useEffect-free redirect: route renders, immediately navigates.
  // Wrapped in queueMicrotask so we don't navigate during render.
  queueMicrotask(() => navigate('/apps', { replace: true }));
  return null;
}

function UserProfileGate({
  appId,
  children,
}: {
  appId: string | null;
  children: React.ReactNode;
}) {
  // UserProfileEditor.list() returns every user in the database; the
  // app-scope is informational only at this point. Keep the gate so a
  // future commit can wire `client.userProfiles.listByApp(appId)` once
  // the editor accepts a scope prop.
  if (!appId) {
    return (
      <div
        className="p-4 text-sm text-muted-foreground"
        data-testid="user-profile-needs-app"
      >
        Choose an application above to scope user profiles.
      </div>
    );
  }
  return <>{children}</>;
}

export function AppShell({ onSignOut }: AppShellProps) {
  const [appId, setAppId] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 text-card-foreground">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold">MarketsUI Config Admin</h1>
          <span className="text-muted-foreground text-xs">·</span>
          <AppSelector value={appId} onChange={setAppId} />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={onSignOut}
            data-testid="sign-out"
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')
            }
            data-testid={`nav-${item.to.slice(1)}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-auto">
        <ScopeRoutes appId={appId} />
      </main>
    </div>
  );
}
