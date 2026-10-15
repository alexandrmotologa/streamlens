import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/_studio/',
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, '../../dist/studio'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:50085',
      '/ws': {
        target: 'ws://127.0.0.1:50085',
        ws: true
      }
    }
  }
});
