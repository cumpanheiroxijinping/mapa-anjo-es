import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Treat vturb-* smart player tags as native custom elements so the
          // Vue compiler doesn't try to resolve them as components.
          isCustomElement: (tag) => tag.startsWith('vturb-'),
        },
      },
    }),
  ],
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
