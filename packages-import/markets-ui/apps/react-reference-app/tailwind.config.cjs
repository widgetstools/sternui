const marketsPreset = require("@marketsui/tokens/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [marketsPreset],
  content: [
    "./src/**/*.{ts,tsx,html}",
    "../../packages/react-tools/dock-editor/src/**/*.{ts,tsx}",
    "../../packages/react-tools/registry-editor/src/**/*.{ts,tsx}",
  ],
};
