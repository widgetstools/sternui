import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5191, open: true },
  build: {
    chunkSizeWarningLimit: 4500,
  },
});
