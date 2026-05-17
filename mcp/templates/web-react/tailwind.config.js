/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from "@starui/design-system/tailwind";

export default {
  presets: [tailwindPreset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@starui/ui/dist/**/*.{js,mjs}",
    "./node_modules/@starui/markets-grid/dist/**/*.{js,mjs}",
    "./node_modules/@starui/grid-react/dist/**/*.{js,mjs}",
    "./node_modules/@starui/widgets-react/dist/**/*.{js,mjs}",
  ],
};
