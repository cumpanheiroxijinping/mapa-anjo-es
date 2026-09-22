import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': path.join(__dirname, 'src') } },
  build: { outDir: 'dist' },
  server: {
    port: 5173,
    proxy: {
      // Dev: forward /api to the Express backend so there is no CORS.
      '/api': 'http://localhost:3000',
    },
  },
});
