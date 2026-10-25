import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('lockfile preserves optional packages for every platform, including those absent on this machine', () => {
  const { packages } = JSON.parse(
    readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
  );
  const paths = Object.keys(packages);
  const missing: string[] = [];
  for (const [parent, entry] of Object.entries(packages)) {
    const optional = (entry as { optionalDependencies?: Record<string, string> })
      .optionalDependencies;
    for (const dependency of Object.keys(optional ?? {})) {
      if (!paths.some((key) => key.endsWith(`node_modules/${dependency}`))) {
        missing.push(`${parent} → ${dependency}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'Missing optional packages break npm ci on other platforms');
});
