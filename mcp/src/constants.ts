export const SERVER_NAME = "starui-mcp-server";
export const SERVER_VERSION = "0.1.0";

export const VERSION_MATRIX = {
  react: "~19.2.5",
  "react-dom": "~19.2.5",
  "ag-grid-community": "35.1.0",
  "ag-grid-enterprise": "35.1.0",
  "ag-grid-react": "35.1.0",
  "@openfin/core": "43.101.2",
  "@openfin/workspace": "23.0.20",
  "@openfin/workspace-platform": "23.0.20",
  "@openfin/notifications": "2.13.1",
  "@openfin/node-adapter": "43.101.2",
  "@widgetstools/react-dock-manager": "^1.0.0",
  "@widgetstools/dock-manager-core": "^1.0.0",
  typescript: "~5.9.3",
  vite: "~7.3.2",
  "@vitejs/plugin-react": "~4.5.2",
  tailwindcss: "3.4.1",
  "tailwindcss-animate": "^1.0.7",
  autoprefixer: "^10.4.27",
  postcss: "^8.5.9",
  "@types/react": "^19.2.14",
  "@types/react-dom": "^19.2.3",
} as const;

export const BANNED_DEPS = ["pnpm", "yarn"] as const;

export const BANNED_NATIVE_ELEMENT_TAGS = ["input", "select", "textarea"] as const;

export const DEFAULT_WEB_PORT = 5173;
export const DEFAULT_OPENFIN_PORT = 5174;
export const DEFAULT_STOMP_PORT = 8081;
