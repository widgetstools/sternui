const marketsPreset = require("@marketsui/tokens/tailwind-preset");

module.exports = {
  presets: [marketsPreset],
  content: ["./src/**/*.{ts,tsx,html}", "./index.html"],
};
