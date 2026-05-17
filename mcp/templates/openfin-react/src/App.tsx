import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";

function App() {
  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">{{name}}</h1>
          <p className="text-sm text-muted-foreground">
            StarUI OpenFin workspace app scaffolded by @starui/mcp-server
          </p>
        </div>
      </header>
      <main className="flex flex-col gap-2.5">
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Launch this application in the OpenFin container</CardDescription>
          </CardHeader>
          <CardContent>
            <p>To launch this application in the OpenFin container, run:</p>
            <pre className="mt-2 rounded-md bg-muted p-3 font-mono text-sm">npm run client</pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blotters</CardTitle>
            <CardDescription>Hosted MarketsGrid instances — bind one to a saved DataProvider to see rows.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link
              to="/blotters/marketsgrid"
              className="text-sm text-primary hover:underline"
            >
              /blotters/marketsgrid &mdash; MarketsGrid blotter (data plane &middot; pick a provider)
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administration</CardTitle>
            <CardDescription>
              Authoring tools live in the dock&apos;s ▾ Tools menu — Workspace Setup,
              Data Providers, Component Registry, Config Browser, etc. The links
              below are dev-mode shortcuts for use outside OpenFin.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link
              to="/dataproviders"
              className="text-sm text-primary hover:underline"
            >
              /dataproviders &mdash; Create / edit STOMP, REST, Mock and AppData providers
            </Link>
            <Link
              to="/config-browser"
              className="text-sm text-primary hover:underline"
            >
              /config-browser &mdash; Inspect ConfigManager state
            </Link>
            <Link
              to="/workspace-setup"
              className="text-sm text-primary hover:underline"
            >
              /workspace-setup &mdash; Configure workspace defaults
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sample Views</CardTitle>
            <CardDescription>FDC3 broadcast/listen + OpenFin notifications demos</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link to="/views/view1" className="text-sm text-primary hover:underline">
              /views/view1 &mdash; Broadcast FDC3 context + show OpenFin notification
            </Link>
            <Link to="/views/view2" className="text-sm text-primary hover:underline">
              /views/view2 &mdash; Listen for FDC3 context (system + custom app channel)
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default App;
