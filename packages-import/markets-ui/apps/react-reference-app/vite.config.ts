import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vite";

// Tailwind v3 works via PostCSS — Vite picks up postcss.config.js automatically.
// No Tailwind-specific Vite plugin is needed.
export default defineConfig({
  plugins: [
    react(),
    svgr(),   // Enables: import Icon from 'path/to/icon.svg?react'
  ],
  server: {
    port: 5174,
  },
});
