import * as fs from 'node:fs';
import * as path from 'node:path';

// Central project name lives in brand.config.json at the repo root.
// Walk up from here until we find it so this works in dev (src) and prod (dist).
function loadBrand(): any {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'brand.config.json');
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback so the app still boots if the file is missing.
  return { key: 'whatslocal', displayName: 'WhatsLocal', domain: null };
}

export const BRAND = loadBrand();
