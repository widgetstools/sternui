/**
 * Dev-mode home hub — useful when running Vite in a plain browser (no OpenFin).
 *
 * In OpenFin, users launch views from the dock / workspace; this page is optional.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@starui/ui';
import { DEV_ORIGIN, MANIFEST_URL } from './constants';

export default function App() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-xl font-bold">StarUI OpenFin Scaffold</h1>
        <p className="text-sm text-muted-foreground">
          Reference app for workspace platform, config browser, data providers, and hosted grid.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Launch OpenFin</CardTitle>
          <CardDescription>Start Vite and the runtime in one step</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <pre className="rounded-md bg-muted p-3 font-mono text-xs">npm run start:openfin</pre>
          <p className="text-muted-foreground">
            Manifest: <code className="font-mono text-xs">{MANIFEST_URL}</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace views</CardTitle>
          <CardDescription>Also registered in manifest `customSettings.apps`</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Link className="text-primary hover:underline" to="/views/blotter">
            /views/blotter — Hosted MarketsGrid
          </Link>
          <Link className="text-primary hover:underline" to="/views/interop">
            /views/interop — Notifications + FDC3
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin tools</CardTitle>
          <CardDescription>
            In OpenFin: Dock → Tools. Below are browser shortcuts ({DEV_ORIGIN}).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Link className="text-primary hover:underline" to="/workspace-setup">
            /workspace-setup — Dock + component registry editor
          </Link>
          <Link className="text-primary hover:underline" to="/dataproviders">
            /dataproviders — Data provider editor
          </Link>
          <Link className="text-primary hover:underline" to="/config-browser">
            /config-browser — Config browser
          </Link>
          <Link className="text-primary hover:underline" to="/import-config">
            /import-config — Import / export bundle
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
