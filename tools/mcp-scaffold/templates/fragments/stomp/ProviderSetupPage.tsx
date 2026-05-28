import { DataProviderEditor } from '@starui/widgets-react/v2/provider-editor';
import { LOGGED_IN_USER_ID } from '@starui/types';

export function ProviderSetupPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]">
      <DataProviderEditor userId={LOGGED_IN_USER_ID} />
    </div>
  );
}
