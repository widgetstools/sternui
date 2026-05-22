/**
 * Shared PostCSS pipeline for StarUI consumer apps (Vite + Tailwind 3).
 *
 * `tailwindcss/nesting` must run before `tailwindcss` so dependency CSS
 * (Monaco, AG Grid, etc.) with native nesting does not spam warnings and
 * extra work on every file.
 */
export default {
  plugins: {
    'tailwindcss/nesting': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
