import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// TypeScript watch can rewrite identical output at startup; only content changes require a restart.
export function outputFingerprint(root) {
  const hash = createHash('sha256');
  function visit(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:js|cjs)$/.test(entry.name)) {
        hash.update(path.relative(root, file));
        hash.update(readFileSync(file));
      }
    }
  }
  visit(root);
  return hash.digest('hex');
}
