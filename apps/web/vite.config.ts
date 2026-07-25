import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Single source of truth for the project name lives at the repo root.
      '@brand': path.join(repoRoot, 'brand.config.json'),
      // Use the TS source of the shared types so Vite compiles it as ESM
      // (named runtime exports work; no stale CJS dist interop issues).
      '@whatslocal/types': path.join(repoRoot, 'packages/types/src/index.ts'),
    },
  },
  server: {
    port: 5180,
    fs: { allow: [repoRoot] }, // allow importing brand.config.json from root
    proxy: {
      '/api': 'http://localhost:9100',
    },
  },
});
