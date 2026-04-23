# React OpenFin Starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate all 4 React sub-projects from the OpenFin frontend-framework-starter, using Vite instead of CRA and shadcn/ui instead of custom CSS.

**Architecture:** npm workspaces monorepo with 4 independent apps (container, workspace, web, workspace-platform-starter). Each app is self-contained with its own Vite config, shadcn setup, and OpenFin manifests. No shared packages.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4, shadcn/ui, OpenFin APIs (@openfin/core, @openfin/workspace, @openfin/workspace-platform, @openfin/core-web, @finos/fdc3 2.0)

**Spec:** `docs/superpowers/specs/2026-03-27-react-openfin-starter-design.md`

---

### Task 1: Root Monorepo Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "markets",
  "private": true,
  "engines": {
    "node": ">=22"
  },
  "workspaces": [
    "apps/*"
  ],
  "scripts": {
    "dev:container": "npm run dev -w apps/container",
    "dev:workspace": "npm run dev -w apps/workspace",
    "dev:web": "npm run dev -w apps/web",
    "dev:wps": "npm run dev -w apps/workspace-platform-starter",
    "build": "npm run build --workspaces",
    "client:container": "npm run client -w apps/container",
    "client:workspace": "npm run client -w apps/workspace"
  }
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
.DS_Store
*.local
.env
.env.*
!.env.example

# OpenFin WPS framework (external dependency)
apps/workspace-platform-starter/openfin/framework/
apps/workspace-platform-starter/openfin/modules/
apps/workspace-platform-starter/public/openfin/
apps/workspace-platform-starter/public/common/
```

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.base.json .gitignore
git commit -m "feat: add root monorepo setup with npm workspaces"
```

---

### Task 2: Container App — Project Scaffold

**Files:**
- Create: `apps/container/package.json`
- Create: `apps/container/vite.config.ts`
- Create: `apps/container/tsconfig.json`
- Create: `apps/container/tsconfig.node.json`
- Create: `apps/container/index.html`
- Create: `apps/container/launch.mjs`
- Create: `apps/container/src/types/fin.d.ts`
- Create: `apps/container/src/types/fdc3.d.ts`
- Create: `apps/container/src/lib/utils.ts`

- [ ] **Step 1: Create apps/container/package.json**

```json
{
  "name": "react-container-starter",
  "version": "23.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "client": "node launch.mjs http://localhost:5173/platform/manifest.fin.json"
  },
  "dependencies": {
    "@finos/fdc3": "2.0.3",
    "@openfin/core": "43.101.2",
    "@openfin/notifications": "2.13.1",
    "@openfin/workspace": "23.0.20",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@openfin/node-adapter": "43.101.2",
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.8.3",
    "vite": "^6.2.0"
  }
}
```

- [ ] **Step 2: Create apps/container/vite.config.ts**

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 3: Create apps/container/tsconfig.json and tsconfig.node.json**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

Create `apps/container/tsconfig.app.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "types": ["./src/types/fin", "./src/types/fdc3"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create apps/container/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenFin React Container</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create apps/container/launch.mjs**

Copy the exact `launch.mjs` from the original container project. This is the Node adapter launcher that connects to the OpenFin runtime. The default manifest URL should be `http://localhost:5173/platform/manifest.fin.json` (Vite port instead of CRA port 3000).

```js
import { connect, launch } from "@openfin/node-adapter";
import { setDefaultResultOrder } from "dns";

async function run(manifestUrl) {
  try {
    let quitRequested = false;
    let quit;

    const fin = await launchFromNode(manifestUrl);

    if (fin) {
      const manifest = await fin.System.fetchManifest(manifestUrl);

      if (manifest.platform?.uuid !== undefined) {
        quit = async () => {
          try {
            if (!quitRequested) {
              quitRequested = true;
              console.log("Calling platform quit");
              const platform = fin.Platform.wrapSync({ uuid: manifest.platform.uuid });
              await platform.quit();
            }
          } catch (err) {
            if (err.toString().includes("no longer connected")) {
              console.log("Platform no longer connected");
              console.log("Exiting process");
              process.exit();
            } else {
              console.error(err);
            }
          }
        };
        console.log(`Wrapped target platform: ${manifest.platform.uuid}`);
      } else {
        quit = async () => {
          try {
            if (!quitRequested) {
              quitRequested = true;
              console.log("Calling application quit");
              const app = fin.Application.wrapSync({ uuid: manifest.startup_app.uuid });
              await app.quit();
            }
          } catch (err) {
            console.error(err);
          }
        };
        console.log(`Wrapped classic app: ${manifest.startup_app.uuid}`);
      }

      process.on("exit", async () => {
        console.log("Process exit called");
        await quit();
      });

      process.on("SIGINT", async () => {
        console.log("Ctrl + C called");
        await quit();
      });

      console.log(`You successfully connected to the manifest: ${manifestUrl}`);
      console.log(`Please wait while the sample loads.`);
      console.log();
      console.log(`If using browser use the Quit option from the main menu.`);
      console.log(`Otherwise press Ctrl + C (Windows) or Command + C (Mac) to exit and close the sample.`);
      console.log();
    }
  } catch (e) {
    console.error(`Error: Connection failed`);
    console.error(e.message);
  }
}

async function launchFromNode(manifestUrl) {
  try {
    console.log(`Launching manifest...`);
    console.log();

    const port = await launch({ manifestUrl });

    const fin = await connect({
      uuid: `dev-connection-${Date.now()}`,
      address: `ws://127.0.0.1:${port}`,
      nonPersistent: true,
    });

    fin.once("disconnected", () => {
      console.log("Platform disconnected");
      console.log("Exiting process");
      process.exit();
    });

    return fin;
  } catch (e) {
    console.error("Error: Failed launching manifest");
    console.error(e.message);
    if (e.message.includes("Could not locate")) {
      console.error("Is the web server running and the manifest JSON valid?");
    }
  }
}

console.log("Launch Manifest");
console.log("===============");
console.log();
console.log(`Platform: ${process.platform}`);

const launchArgs = process.argv.slice(2);
const manifest = launchArgs.length > 0 ? launchArgs[0] : "http://localhost:5173/platform/manifest.fin.json";
console.log(`Manifest: ${manifest}`);

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Early versions of node do not support this method
}

run(manifest).catch((err) => console.error(err));
```

- [ ] **Step 6: Create type declarations**

`apps/container/src/types/fin.d.ts`:
```ts
import type { fin as FinApi } from "@openfin/core";

declare global {
  const fin: typeof FinApi;
}
```

`apps/container/src/types/fdc3.d.ts`:
```ts
import { type DesktopAgent } from "@finos/fdc3";

declare global {
  const fdc3: DesktopAgent;
}
```

- [ ] **Step 7: Create apps/container/src/lib/utils.ts**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/container/
git commit -m "feat: scaffold container app with Vite, Tailwind, TypeScript"
```

---

### Task 3: Container App — shadcn/ui Setup & CSS

**Files:**
- Create: `apps/container/src/index.css`
- Create: `apps/container/src/components/ui/button.tsx`
- Create: `apps/container/src/components/ui/card.tsx`
- Create: `apps/container/src/components/ui/badge.tsx`
- Create: `apps/container/src/components/ui/scroll-area.tsx`

- [ ] **Step 1: Create apps/container/src/index.css**

Tailwind + shadcn CSS variables + OpenFin theme bridge:

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.21 0.006 285.885);
  --primary-foreground: oklch(0.985 0.002 247.839);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.705 0.015 286.067);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0.002 247.839);
  --card: oklch(0.141 0.005 285.823);
  --card-foreground: oklch(0.985 0.002 247.839);
  --popover: oklch(0.141 0.005 285.823);
  --popover-foreground: oklch(0.985 0.002 247.839);
  --primary: oklch(0.985 0.002 247.839);
  --primary-foreground: oklch(0.21 0.006 285.885);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0.002 247.839);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0.002 247.839);
  --destructive: oklch(0.396 0.141 25.723);
  --border: oklch(0.274 0.006 286.033);
  --input: oklch(0.274 0.006 286.033);
  --ring: oklch(0.442 0.017 285.786);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius: 0.625rem;
}

body {
  @apply bg-background text-foreground;
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  padding: 10px;
}

/* OpenFin theme bridge — maps OpenFin --theme-* vars to CSS when available */
:root {
  --of-bg: var(--theme-background-primary, var(--background));
  --of-fg: var(--theme-text-default, var(--foreground));
}
```

- [ ] **Step 2: Create shadcn Button component**

`apps/container/src/components/ui/button.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 3: Create shadcn Card component**

`apps/container/src/components/ui/card.tsx`:

```tsx
import * as React from "react";
import { cn } from "../../lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl border border-border bg-card text-card-foreground shadow", className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 4: Create shadcn Badge component**

`apps/container/src/components/ui/badge.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white shadow",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

- [ ] **Step 5: Commit**

```bash
git add apps/container/src/
git commit -m "feat: add shadcn/ui components and CSS for container app"
```

---

### Task 4: Container App — Platform & Views

**Files:**
- Create: `apps/container/src/main.tsx`
- Create: `apps/container/src/App.tsx`
- Create: `apps/container/src/platform/Provider.tsx`
- Create: `apps/container/src/platform/WithScript.tsx`
- Create: `apps/container/src/views/View1.tsx`
- Create: `apps/container/src/views/View2.tsx`
- Create: `apps/container/src/views/View3.tsx`

- [ ] **Step 1: Create apps/container/src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import withScript from "./platform/WithScript";
import "./index.css";

const Provider = React.lazy(() => import("./platform/Provider"));
const View1 = React.lazy(() => import("./views/View1"));
const View2 = React.lazy(() => import("./views/View2"));
const View3 = React.lazy(() => import("./views/View3"));
const AnywhereShim =
  "https://built-on-openfin.github.io/web-starter/web/v23.0.0/web-client-api/js/shim.api.bundle.js";
const View1WithScript = withScript(View1, AnywhereShim);
const View2WithScript = withScript(View2, AnywhereShim);

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/views/view1" element={<View1WithScript />} />
        <Route path="/views/view2" element={<View2WithScript />} />
        <Route path="/views/view3" element={<View3 />} />
        <Route path="/platform/provider" element={<Provider />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 2: Create apps/container/src/App.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";

function App() {
  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin React</h1>
          <p className="text-sm text-muted-foreground">
            Example demonstrating running a React app in an OpenFin container
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
            <p>To launch this application in the OpenFin container, run the following command:</p>
            <pre className="mt-2 rounded-md bg-muted p-3 font-mono text-sm">npm run client</pre>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 3: Create apps/container/src/platform/Provider.tsx**

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

function Provider() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async function () {
      let runtimeAvailable = false;
      if (typeof fin !== "undefined") {
        try {
          await fin.Platform.init({});
          runtimeAvailable = true;
        } catch {}
      }
      if (runtimeAvailable) {
        const runtimeInfo = await fin.System.getRuntimeInfo();
        setMessage(`OpenFin Runtime: ${runtimeInfo.version}`);
      } else {
        setMessage("OpenFin runtime is not available");
      }
    })();
  }, []);

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin Platform Window</h1>
          <p className="text-sm text-muted-foreground">Container platform window</p>
        </div>
      </header>
      <main className="flex flex-col gap-2.5">
        <Card>
          <CardHeader>
            <CardTitle>Platform Provider</CardTitle>
            <CardDescription>This window initializes the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              The window would usually be hidden. Set the platform.autoShow flag to false in
              manifest.fin.json to hide it on startup.
            </p>
            <p className="mt-2 font-medium">{message}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default Provider;
```

- [ ] **Step 4: Create apps/container/src/platform/WithScript.tsx**

```tsx
import React, { useEffect } from "react";

const withScript = (WrappedComponent: React.ComponentType, scriptSrc: string) => {
  return (props: Record<string, unknown>) => {
    useEffect(() => {
      const script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      document.head.appendChild(script);

      return () => {
        document.head.removeChild(script);
      };
    }, []);

    return <WrappedComponent {...props} />;
  };
};

export default withScript;
```

- [ ] **Step 5: Create apps/container/src/views/View1.tsx**

```tsx
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

function View1() {
  async function broadcastFDC3Context() {
    if (window.fdc3) {
      await fdc3.broadcast({
        type: "fdc3.instrument",
        name: "Microsoft Corporation",
        id: {
          ticker: "MSFT",
        },
      });
    } else {
      console.error("FDC3 is not available");
    }
  }

  async function broadcastFDC3ContextAppChannel() {
    if (window.fdc3) {
      const appChannel = await fdc3.getOrCreateChannel("CUSTOM-APP-CHANNEL");
      await appChannel.broadcast({
        type: "fdc3.instrument",
        name: "Apple Inc.",
        id: {
          ticker: "AAPL",
        },
      });
    } else {
      console.error("FDC3 is not available");
    }
  }

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin React View 1</h1>
          <p className="text-sm text-muted-foreground">React app view in an OpenFin container</p>
        </div>
      </header>
      <main>
        <Card>
          <CardHeader>
            <CardTitle>FDC3 Broadcasting</CardTitle>
            <CardDescription>Broadcast instrument context to other views</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={() => broadcastFDC3Context()}>Broadcast FDC3 User Context</Button>
            <Button variant="secondary" onClick={() => broadcastFDC3ContextAppChannel()}>
              Broadcast FDC3 App Context
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default View1;
```

- [ ] **Step 6: Create apps/container/src/views/View2.tsx**

```tsx
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

function View2() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function listenForFDC3Context() {
      if (window.fdc3) {
        console.log("Listen for FDC3 User Context");
        await fdc3.addContextListener(null, (context) => {
          setMessage(JSON.stringify(context, undefined, "  "));
        });
      } else {
        window.addEventListener("fdc3Ready", listenForFDC3Context);
      }
    }

    async function listenForFDC3ContextAppChannel() {
      if (window.fdc3) {
        const appChannel = await fdc3.getOrCreateChannel("CUSTOM-APP-CHANNEL");
        console.log("Listen for FDC3 App Context");
        await appChannel.addContextListener(null, (context) => {
          setMessage(JSON.stringify(context, undefined, "  "));
        });
      } else {
        window.addEventListener("fdc3Ready", listenForFDC3ContextAppChannel);
      }
    }

    (async function () {
      console.log("View2 mounted");
      await listenForFDC3Context();
      await listenForFDC3ContextAppChannel();
    })();
  }, []);

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin React View 2</h1>
          <p className="text-sm text-muted-foreground">React app view in an OpenFin container</p>
        </div>
      </header>
      <main>
        <Card>
          <CardHeader>
            <CardTitle>FDC3 Context Listener</CardTitle>
            <CardDescription>Receives broadcast context from View 1</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <pre className="w-full min-h-[110px] rounded-md bg-muted p-3 font-mono text-sm">
              {message}
            </pre>
            <Button variant="outline" onClick={() => setMessage("")}>
              Clear
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default View2;
```

- [ ] **Step 7: Create apps/container/src/views/View3.tsx**

```tsx
import * as Notifications from "@openfin/notifications";
import { useEffect } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

function View3() {
  useEffect(() => {
    Notifications.register().then(() => {
      Notifications.addEventListener("notification-action", (event) => {
        console.log("Notification clicked:", event.result["customData"]);
      });
    });
  }, []);

  async function showNotification() {
    await Notifications.create({
      platform: fin.me.identity.uuid,
      title: "Simple Notification",
      body: "This is a simple notification",
      toast: "transient",
      buttons: [
        {
          title: "Click me",
          type: "button",
          cta: true,
          onClick: {
            customData: "Arbitrary custom data",
          },
        },
      ],
    });
  }

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin React View 3</h1>
          <p className="text-sm text-muted-foreground">React app view in an OpenFin container</p>
        </div>
      </header>
      <main>
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>OpenFin notification demos</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => showNotification()}>Show Notification</Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default View3;
```

- [ ] **Step 8: Commit**

```bash
git add apps/container/src/
git commit -m "feat: add container app views, platform provider, and routing"
```

---

### Task 5: Container App — OpenFin Manifest

**Files:**
- Create: `apps/container/public/platform/manifest.fin.json`

- [ ] **Step 1: Create the OpenFin platform manifest**

`apps/container/public/platform/manifest.fin.json`:

```json
{
  "runtime": {
    "arguments": "--enable-mesh --security-realm=react-container-starter",
    "version": "43.142.101.2"
  },
  "platform": {
    "uuid": "react-container-starter",
    "icon": "http://localhost:5173/favicon.ico",
    "autoShow": true,
    "providerUrl": "http://localhost:5173/platform/provider"
  },
  "snapshot": {
    "windows": [
      {
        "layout": {
          "content": [
            {
              "type": "row",
              "content": [
                {
                  "type": "stack",
                  "content": [
                    {
                      "type": "component",
                      "title": "view1",
                      "componentName": "view",
                      "componentState": {
                        "url": "http://localhost:5173/views/view1",
                        "name": "view1",
                        "componentName": "view",
                        "fdc3InteropApi": "2.0",
                        "interop": {
                          "currentContextGroup": "green"
                        }
                      }
                    }
                  ]
                },
                {
                  "type": "stack",
                  "content": [
                    {
                      "type": "component",
                      "title": "view2",
                      "componentName": "view",
                      "componentState": {
                        "url": "http://localhost:5173/views/view2",
                        "name": "view2",
                        "componentName": "view",
                        "fdc3InteropApi": "2.0",
                        "interop": {
                          "currentContextGroup": "green"
                        }
                      }
                    }
                  ]
                },
                {
                  "type": "stack",
                  "content": [
                    {
                      "type": "component",
                      "title": "view3",
                      "componentName": "view",
                      "componentState": {
                        "url": "http://localhost:5173/views/view3",
                        "name": "view3",
                        "componentName": "view",
                        "fdc3InteropApi": "2.0",
                        "interop": {
                          "currentContextGroup": "green"
                        }
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Install dependencies and verify build**

```bash
cd /Users/develop/projects/markets && npm install
cd apps/container && npx tsc --noEmit
```

Expected: TypeScript compilation succeeds (possibly with warnings about OpenFin globals which only exist at runtime).

- [ ] **Step 3: Commit**

```bash
git add apps/container/public/
git commit -m "feat: add container OpenFin manifest with 3-view layout"
```

---

### Task 6: Workspace App — Complete Implementation

**Files:**
- Create: `apps/workspace/package.json`
- Create: `apps/workspace/vite.config.ts`
- Create: `apps/workspace/tsconfig.json`
- Create: `apps/workspace/tsconfig.app.json`
- Create: `apps/workspace/tsconfig.node.json`
- Create: `apps/workspace/index.html`
- Create: `apps/workspace/launch.mjs`
- Create: `apps/workspace/src/index.css` (copy from container)
- Create: `apps/workspace/src/lib/utils.ts` (copy from container)
- Create: `apps/workspace/src/types/fin.d.ts` (copy from container)
- Create: `apps/workspace/src/types/fdc3.d.ts` (copy from container)
- Create: `apps/workspace/src/components/ui/button.tsx` (copy from container)
- Create: `apps/workspace/src/components/ui/card.tsx` (copy from container)
- Create: `apps/workspace/src/components/ui/badge.tsx` (copy from container)
- Create: `apps/workspace/src/main.tsx`
- Create: `apps/workspace/src/App.tsx`
- Create: `apps/workspace/src/platform/Provider.tsx`
- Create: `apps/workspace/src/platform/shapes.ts`
- Create: `apps/workspace/src/platform/home.ts`
- Create: `apps/workspace/src/platform/store.ts`
- Create: `apps/workspace/src/platform/dock.ts`
- Create: `apps/workspace/src/platform/notifications.ts`
- Create: `apps/workspace/src/platform/launch.ts`
- Create: `apps/workspace/src/views/View1.tsx`
- Create: `apps/workspace/src/views/View2.tsx`
- Create: `apps/workspace/public/platform/manifest.fin.json`
- Create: `apps/workspace/public/views/view1.fin.json`
- Create: `apps/workspace/public/views/view2.fin.json`

- [ ] **Step 1: Create workspace package.json**

Same as container but add `@openfin/workspace-platform` and `@openfin/notifications`:

```json
{
  "name": "react-workspace-starter",
  "version": "23.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "client": "node launch.mjs http://localhost:5174/platform/manifest.fin.json"
  },
  "dependencies": {
    "@finos/fdc3": "2.0.3",
    "@openfin/core": "43.101.2",
    "@openfin/notifications": "2.13.1",
    "@openfin/workspace": "23.0.20",
    "@openfin/workspace-platform": "23.0.20",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@openfin/node-adapter": "43.101.2",
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.8.3",
    "vite": "^6.2.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts (port 5174), tsconfigs, index.html, launch.mjs**

`apps/workspace/vite.config.ts` — identical to container but port 5174.

Tsconfigs — identical to container.

`index.html` — identical to container but title "OpenFin React Workspace".

`launch.mjs` — identical to container but default URL `http://localhost:5174/platform/manifest.fin.json`.

- [ ] **Step 3: Copy shared files from container**

Copy these files from `apps/container/` to `apps/workspace/` (identical content):
- `src/index.css`
- `src/lib/utils.ts`
- `src/types/fin.d.ts`
- `src/types/fdc3.d.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`

- [ ] **Step 4: Create apps/workspace/src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";

const Provider = React.lazy(() => import("./platform/Provider"));
const View1 = React.lazy(() => import("./views/View1"));
const View2 = React.lazy(() => import("./views/View2"));

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/views/view1" element={<View1 />} />
        <Route path="/views/view2" element={<View2 />} />
        <Route path="/platform/provider" element={<Provider />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 5: Create workspace App.tsx**

Same pattern as container but with "OpenFin workspace" messaging.

- [ ] **Step 6: Create all platform modules**

Create these files with the exact logic from the original workspace project:
- `apps/workspace/src/platform/shapes.ts` — `CustomSettings` and `PlatformSettings` interfaces
- `apps/workspace/src/platform/launch.ts` — App launcher with AppManifestType switch
- `apps/workspace/src/platform/home.ts` — Home provider registration with search
- `apps/workspace/src/platform/store.ts` — Storefront registration
- `apps/workspace/src/platform/dock.ts` — Dock registration with workspace components + Apps dropdown
- `apps/workspace/src/platform/notifications.ts` — Notifications.register()
- `apps/workspace/src/platform/Provider.tsx` — Full workspace platform init (reads manifest, init platform, bootstrap components, close handler)

Each file matches the original's logic exactly (as read from the repo). The Provider.tsx uses shadcn Card instead of raw HTML with utility classes.

- [ ] **Step 7: Create workspace views**

`apps/workspace/src/views/View1.tsx` — Notifications + FDC3 broadcast (matches original workspace View1 exactly, with shadcn Button/Card)

`apps/workspace/src/views/View2.tsx` — FDC3 context listener (matches original, with shadcn Card/Button)

- [ ] **Step 8: Create workspace manifests**

`apps/workspace/public/platform/manifest.fin.json` — Same structure as original but URLs point to `localhost:5174`. Includes `customSettings.apps` with view1 and view2 definitions, `preventQuitOnLastWindowClosed: true`.

`apps/workspace/public/views/view1.fin.json`:
```json
{
  "url": "http://localhost:5174/views/view1",
  "fdc3InteropApi": "2.0",
  "interop": {
    "currentContextGroup": "green"
  }
}
```

`apps/workspace/public/views/view2.fin.json` — same pattern.

- [ ] **Step 9: Install and verify**

```bash
cd /Users/develop/projects/markets && npm install
cd apps/workspace && npx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
git add apps/workspace/
git commit -m "feat: add workspace app with Home, Store, Dock, Notifications"
```

---

### Task 7: Web App — Complete Implementation

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.app.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/index.html`
- Create: `apps/web/iframe-broker.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/config.ts`
- Create: `apps/web/src/provider.ts`
- Create: `apps/web/src/iframe-broker.ts`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/public/default.layout.fin.json`
- Create: `apps/web/public/manifest.json`

- [ ] **Step 1: Create web package.json**

```json
{
  "name": "web",
  "private": true,
  "version": "23.0.0",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@openfin/core-web": "0.43.113",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.8.3",
    "vite": "^6.2.0",
    "vite-plugin-static-copy": "^2.3.0"
  }
}
```

- [ ] **Step 2: Create web vite.config.ts**

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@openfin/core-web/out/shared-worker.js",
          dest: "assets",
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: "./index.html",
        "iframe-broker": "./iframe-broker.html",
      },
    },
  },
  server: {
    port: 3000,
  },
});
```

- [ ] **Step 3: Create HTML files, tsconfigs**

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/react.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenFin Web: React</title>
    <link rel="manifest" href="./manifest.json" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/iframe-broker.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>iFrame broker</title>
    <link rel="manifest" href="./manifest.json" />
  </head>
  <body>
    <script type="module" src="/src/iframe-broker.ts"></script>
  </body>
</html>
```

Tsconfigs match the original web project's structure (project references to tsconfig.app.json and tsconfig.node.json).

- [ ] **Step 4: Create all source files**

Create with exact logic from original:
- `apps/web/src/config.ts` — SHARED_WORKER_URL, BROKER_URL, LAYOUT_URL using `window.location.origin`
- `apps/web/src/provider.ts` — `getDefaultLayout()` + `init()` with `connect()`, `fin.Interop.init()`, `fin.Platform.Layout.init()`
- `apps/web/src/iframe-broker.ts` — `initBrokerConnection()` with shared worker URL
- `apps/web/src/main.tsx` — calls `init()` then renders `<App />`, imports `@openfin/core-web/styles.css`
- `apps/web/src/App.tsx` — Header + `<main id="layout_container" />`, uses shadcn Card for header
- `apps/web/src/index.css` — same Tailwind + shadcn CSS as container
- `apps/web/src/lib/utils.ts` — cn() helper
- `apps/web/src/components/ui/card.tsx` — copy from container

- [ ] **Step 5: Create public assets**

`apps/web/public/default.layout.fin.json` — 2x2 grid layout, identical to original with `https://example.com` URLs.

`apps/web/public/manifest.json` — PWA manifest with interop config.

- [ ] **Step 6: Install and verify**

```bash
cd /Users/develop/projects/markets && npm install
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat: add web app with @openfin/core-web browser layout"
```

---

### Task 8: Workspace Platform Starter App — Complete Implementation

**Files:**
- Create: `apps/workspace-platform-starter/package.json`
- Create: `apps/workspace-platform-starter/vite.config.ts`
- Create: `apps/workspace-platform-starter/rollup.config.mjs`
- Create: `apps/workspace-platform-starter/tsconfig.json`
- Create: `apps/workspace-platform-starter/tsconfig.app.json`
- Create: `apps/workspace-platform-starter/tsconfig.node.json`
- Create: `apps/workspace-platform-starter/index.html`
- Create: `apps/workspace-platform-starter/src/main.tsx`
- Create: `apps/workspace-platform-starter/src/app.tsx`
- Create: `apps/workspace-platform-starter/src/index.css`
- Create: `apps/workspace-platform-starter/src/Provider.tsx`
- Create: `apps/workspace-platform-starter/src/hooks/useOpenFin.tsx`
- Create: `apps/workspace-platform-starter/src/hooks/usePlatformState.tsx`
- Create: `apps/workspace-platform-starter/src/hooks/useRaiseIntent.tsx`
- Create: `apps/workspace-platform-starter/src/views/view1.tsx`
- Create: `apps/workspace-platform-starter/src/views/view2.tsx`
- Create: `apps/workspace-platform-starter/src/lib/utils.ts`
- Create: `apps/workspace-platform-starter/src/components/ui/button.tsx`
- Create: `apps/workspace-platform-starter/src/components/ui/card.tsx`
- Create: `apps/workspace-platform-starter/public/manifest.fin.json`
- Create: `apps/workspace-platform-starter/public/apps.json`
- Create: `apps/workspace-platform-starter/public/splash.html`
- Create: `apps/workspace-platform-starter/openfin/.eslintignore`

- [ ] **Step 1: Create WPS package.json**

```json
{
  "name": "workspace-platform-starter",
  "private": true,
  "version": "23.0.0",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "prestart": "npm run build:openfin",
    "dev": "vite",
    "start": "npm run dev",
    "build": "tsc -b && npm run build:openfin && vite build",
    "build:openfin": "rollup -c rollup.config.mjs",
    "preview": "vite preview --port 8080"
  },
  "dependencies": {
    "@finos/fdc3": "2.0.3",
    "@openfin/cloud-interop": "0.43.113",
    "@openfin/openid-connect": "^1.0.0",
    "@openfin/snap-sdk": "1.3.4",
    "@openfin/workspace": "23.0.20",
    "@openfin/workspace-platform": "23.0.20",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.460.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.6.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@openfin/core": "43.101.2",
    "@openfin/node-adapter": "43.101.2",
    "@rollup/plugin-commonjs": "^28.0.3",
    "@rollup/plugin-node-resolve": "^16.0.1",
    "@rollup/plugin-terser": "^0.4.4",
    "@rollup/plugin-typescript": "^12.1.2",
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "rollup-plugin-copy": "^3.5.0",
    "tailwindcss": "^4.0.0",
    "typescript": "~5.8.3",
    "vite": "^6.3.5"
  }
}
```

- [ ] **Step 2: Create vite.config.ts and rollup.config.mjs**

`vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "workspace-platform-starter": path.resolve(__dirname, "./openfin/framework"),
    },
    extensions: [".tsx", ".ts", ".js", ".json"],
  },
  server: {
    port: 8080,
  },
});
```

`rollup.config.mjs` — exact copy from original with all 34 entry definitions and build config.

- [ ] **Step 3: Create tsconfigs**

`tsconfig.app.json` — includes path mapping `workspace-platform-starter/*` → `openfin/framework/*`, `strict: false` (matches original), includes `src` and `openfin`.

Other tsconfigs follow the same pattern as the original.

- [ ] **Step 4: Create source files — hooks**

`src/hooks/useOpenFin.tsx` — exact copy from original. Imports from `workspace-platform-starter/bootstrapper`, `workspace-platform-starter/logger-provider`, `workspace-platform-starter/platform/platform`, `workspace-platform-starter/platform/platform-splash`.

`src/hooks/usePlatformState.tsx` — exact copy from original. FDC3 app channel state management with `[value, setValue]` tuple.

`src/hooks/useRaiseIntent.tsx` — exact copy from original. Memoized `raiseIntent` callback.

- [ ] **Step 5: Create source files — views and provider**

`src/main.tsx`, `src/app.tsx`, `src/Provider.tsx` — match original exactly, with shadcn Card in Provider.

`src/views/view1.tsx` — three buttons (ViewContact, ViewQuote, Set global state), uses shadcn Button + Card.

`src/views/view2.tsx` — displays `usePlatformState("demo")` value, uses shadcn Card.

- [ ] **Step 6: Create shared UI files**

Copy from container: `src/index.css`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`

- [ ] **Step 7: Create public assets**

`public/apps.json` — exact copy from original (two inline-view apps).

`public/manifest.fin.json` — the large (~500 line) WPS manifest. Copy from original, already points to `localhost:8080`.

`public/splash.html` — copy from original splash screen.

`openfin/.eslintignore` — ignores `framework/`, `modules/`, `common/`.

- [ ] **Step 8: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Workspace Platform Starter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Install and verify**

```bash
cd /Users/develop/projects/markets && npm install
```

Note: The WPS app depends on the external `openfin/framework/` and `openfin/modules/` directories which are gitignored. TypeScript compilation will fail until those are populated. This is expected — the original project has the same dependency.

- [ ] **Step 10: Commit**

```bash
git add apps/workspace-platform-starter/
git commit -m "feat: add workspace-platform-starter app with React hooks and WPS framework"
```

---

### Task 9: Final Verification & Root Install

- [ ] **Step 1: Run npm install at root**

```bash
cd /Users/develop/projects/markets && npm install
```

Expected: All workspace dependencies resolve correctly.

- [ ] **Step 2: Verify container builds**

```bash
npm run dev:container &
# Wait a few seconds for Vite to start
# Kill the dev server
kill %1
```

Expected: Vite starts on port 5173 without errors.

- [ ] **Step 3: Verify workspace builds**

```bash
npm run dev:workspace &
kill %1
```

Expected: Vite starts on port 5174 without errors.

- [ ] **Step 4: Verify web builds**

```bash
npm run dev:web &
kill %1
```

Expected: Vite starts on port 3000 without errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: finalize monorepo setup with all 4 OpenFin starter apps"
```
