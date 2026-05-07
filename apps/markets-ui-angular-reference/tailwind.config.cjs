const marketsPreset = require("@starui/tokens-primeng/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [marketsPreset],
  content: [
    "./src/**/*.{ts,html}",
    "../../packages/angular/dock-editor-angular/src/**/*.{ts,html}",
    "../../packages/angular/registry-editor-angular/src/**/*.{ts,html}",
  ],
};
