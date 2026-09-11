import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const repoRoot = path.resolve(__dirname, '../..');

// Build stamp shown to admins only (admin sidebar) — so it's obvious which build
// is live. Version from package.json + the git short SHA + a readable IST time.
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
let sha = 'dev';
try { sha = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim(); } catch { /* not a git checkout */ }
const buildTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(sha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
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
