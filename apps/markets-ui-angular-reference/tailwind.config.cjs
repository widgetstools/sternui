const marketsPreset = require("@marketsui/tokens-primeng/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [marketsPreset],
  content: [
    "./src/**/*.{ts,html}",
    "../../packages/dock-editor-angular/src/**/*.{ts,html}",
    "../../packages/registry-editor-angular/src/**/*.{ts,html}",
  ],
};
