const marketsPreset = require("@marketsui/tokens-primeng/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [marketsPreset],
  content: [
    "./src/**/*.{ts,tsx,html}",
    "../../packages/dock-editor-react/src/**/*.{ts,tsx}",
    "../../packages/registry-editor-react/src/**/*.{ts,tsx}",
  ],
};
