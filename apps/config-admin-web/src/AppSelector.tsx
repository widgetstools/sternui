import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@starui/ui';
import type { AppRegistryRow } from '@starui/config-service';
import { useConfigClient } from '@starui/config-editor-ui';

import { useAppScope } from './AppScopeContext';

/**
 * Top-level "scope" picker — operator chooses which deployed app the
 * editor screens are scoped to.
 *
 * Per design Decision 11, the admin app is the *only* surface where
 * `appId` is operator-selectable. The in-app `config-browser-react`
 * wrapper is hard-coded to `ApplicationContext.AppId` and never
 * shows this dropdown.
 *
 * The list comes from `client.apps.list()` (the same auth tables the
 * AppRegistryEditor manages). Empty state nudges the operator toward
 * registering an app first, since user profiles are scoped per app.
 */

export function AppSelector() {
  const client = useConfigClient();
  const { appId, setAppId } = useAppScope();
  const [apps, setApps] = useState<AppRegistryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client.apps
      .list()
      .then((rows) => {
        if (cancelled) return;
        setApps(rows);
        // Auto-select the first app on first load if nothing's chosen.
        if (!appId && rows.length > 0) setAppId(rows[0].appId);
      })
      .catch(() => {
        if (cancelled) return;
        setApps([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // appId intentionally omitted from deps — refetching the list every
    // time the operator switches apps would be wasteful. AppsOverview
    // (or any other CRUD surface) refreshes by re-mounting this component
    // when the operator changes navs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  if (apps.length === 0) {
    return (
      <span
        className="text-xs text-muted-foreground"
        data-testid="app-selector-empty"
      >
        {loading ? 'Loading apps…' : 'No apps registered yet'}
      </span>
    );
  }

  return (
    <Select
      value={appId ?? undefined}
      onValueChange={(v) => setAppId(v)}
    >
      <SelectTrigger
        className="w-[20rem]"
        data-testid="app-selector-trigger"
        aria-label="Active application"
      >
        <SelectValue placeholder="Choose application…" />
      </SelectTrigger>
      <SelectContent>
        {apps.map((app) => (
          <SelectItem
            key={app.appId}
            value={app.appId}
            data-testid={`app-selector-option-${app.appId}`}
          >
            <span className="font-medium">{app.displayName}</span>
            <span className="ml-2 text-muted-foreground">
              ({app.appId} · {app.environment})
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
