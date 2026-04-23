const marketsPreset = require("@marketsui/tokens/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [marketsPreset],
  content: [
    "./src/**/*.{ts,html}",
    "../../packages/angular-tools/dock-editor/src/**/*.{ts,html}",
    "../../packages/angular-tools/registry-editor/src/**/*.{ts,html}",
  ],
};
