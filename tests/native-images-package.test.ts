import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('packaging restores sibling libvips beside a nested sharp addon before signing', async () => {
  // The hook is JavaScript so electron-builder can run it without a TS loader.
  const modulePath = '../scripts/prepare-native-images.mjs';
  const { default: prepare } = await import(modulePath);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-native-images-'));
  try {
    const appOutDir = path.join(temp, 'out');
    const projectDir = path.join(temp, 'project');
    const scope = path.join(
      appOutDir,
      'Cyberfox.app',
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'node_modules',
      'sharp',
      'node_modules',
      '@img',
    );
    const source = path.join(
      projectDir,
      'node_modules',
      '@img',
      'sharp-libvips-darwin-arm64',
      'lib',
    );
    await mkdir(path.join(scope, 'sharp-darwin-arm64'), { recursive: true });
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'libvips.dylib'), 'demo-library');
    const context = {
      appOutDir,
      electronPlatformName: 'darwin',
      packager: { projectDir, appInfo: { productFilename: 'Cyberfox' } },
    };
    await prepare(context);
    const target = path.join(scope, 'sharp-libvips-darwin-arm64', 'lib', 'libvips.dylib');
    assert.equal(await readFile(target, 'utf8'), 'demo-library');
    await writeFile(target, 'existing-matching-library');
    await prepare(context);
    assert.equal(await readFile(target, 'utf8'), 'existing-matching-library');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
