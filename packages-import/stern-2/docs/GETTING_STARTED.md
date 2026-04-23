# Stern Widget Framework — Getting Started

## Prerequisites

- **Node.js** 18.0.0 or later
- **npm** (comes with Node.js)
- **OpenFin Runtime** (optional, for desktop mode — Windows only)

## Installation

From the repository root:

```bash
npm install
```

This installs dependencies for all packages and apps via npm workspaces.

## Building

Build all packages in dependency order:

```bash
npm run build:packages
```

This compiles:
1. `@stern/shared-types` (no dependencies)
2. `@stern/ui` and `@stern/widget-sdk` (depend on shared-types)
3. `@stern/widgets` and `@stern/openfin-platform` (depend on the above)

To build everything including apps:

```bash
npm run build
```

## Running the Application

You need two processes running: the configuration server and the reference app.

### 1. Start the Configuration Server

```bash
npm run dev:server
```

- Runs on **http://localhost:3001**
- Uses SQLite (in-memory) for development — no database setup needed
- API available at `http://localhost:3001/api/v1/configurations`
- Health check at `http://localhost:3001/health`

### 2. Start the Reference App

In a separate terminal:

```bash
npm run dev:app
```

- Runs on **http://localhost:5173** (Vite dev server)
- Hot module replacement enabled
- Open `http://localhost:5173` in your browser

### 3. Launch with OpenFin (Optional)

With both the server and app running:

```bash
cd apps/reference-app
launch-openfin.bat
```

This starts the OpenFin runtime with the platform dock, themed icons, and desktop window management.

## Available Routes

| Route | Description |
|-------|-------------|
| `/` | Home page — widget launcher grid |
| `/blotter/orders?id=orders-blotter` | Orders Blotter (real-time mock data) |
| `/blotter/fills?id=fills-blotter` | Fills Blotter |
| `/blotter/positions?id=positions-blotter` | Positions Blotter |
| `/dataproviders` | Data Provider Editor — create and manage data sources |

## Project Scripts

Run from the repository root:

| Script | Description |
|--------|-------------|
| `npm run build:packages` | Build all packages in dependency order |
| `npm run build` | Build everything (packages + apps) |
| `npm run dev:server` | Start the config server (port 3001) |
| `npm run dev:app` | Start the reference app (port 5173) |
| `npm run typecheck` | Type-check all packages |
| `npm run test` | Run tests across all packages |
| `npm run clean` | Remove build artifacts |

## Server Configuration

The server supports these environment variables (via `.env` file or system env):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `HOST` | `localhost` | Server host |
| `DATABASE_TYPE` | `sqlite` | `sqlite` for dev, `mongodb` for production |
| `MONGODB_URI` | — | MongoDB connection string (when using MongoDB) |
| `NODE_ENV` | `development` | Environment mode |

## Troubleshooting

### Port 5173 already in use

Kill existing Node.js processes:

```bash
# Windows
taskkill /F /IM node.exe

# Linux/macOS
lsof -ti:5173 | xargs kill -9
```

### Build errors after pulling changes

Rebuild packages from clean state:

```bash
npm run clean
npm install
npm run build:packages
```

### Server returns 404 for configurations

Make sure the server is running (`npm run dev:server`) before starting the reference app. The server creates its SQLite database in memory on startup — configurations are ephemeral in dev mode.
