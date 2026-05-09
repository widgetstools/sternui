import { useState } from 'react';
import { Button, Input, Label } from '@starui/ui';

/**
 * Placeholder sign-in surface — operator pastes any non-empty token
 * and clicks "Continue".
 *
 * Design Decision 16 explicitly defers real auth (IDP redirect,
 * refresh, expiry). Until that lands, anything non-empty is accepted
 * and persisted to `sessionStorage` so a refresh keeps the operator
 * signed in. The token does flow into `RestConfigClient` as a Bearer
 * header, so once the server gains an auth middleware this surface is
 * the only piece that needs replacement.
 */

export interface SignInProps {
  onSubmit: (token: string) => void;
}

export function SignIn({ onSubmit }: SignInProps) {
  const [token, setTokenInput] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <form
        onSubmit={handleSubmit}
        className="flex w-[28rem] flex-col gap-4 rounded-md border border-border bg-card p-6 text-card-foreground shadow-lg"
        data-testid="sign-in-form"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">MarketsUI Config Admin</h1>
          <p className="text-xs text-muted-foreground">
            Operator sign-in (placeholder — real auth lands per design
            Decision 16). Paste any non-empty token to continue.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="operator-token">Operator token</Label>
          <Input
            id="operator-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="dev-token"
            data-testid="sign-in-token"
          />
        </div>
        <Button
          type="submit"
          disabled={token.trim().length === 0}
          data-testid="sign-in-submit"
        >
          Continue
        </Button>
      </form>
    </div>
  );
}
