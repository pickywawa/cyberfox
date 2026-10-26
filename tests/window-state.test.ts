import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveWindowState, restoreWindowState } from '../electron/window-state.js';
import { outputFingerprint } from '../scripts/dev-output.mjs';
test('window bounds persist independently and return on screen when a monitor is disconnected', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-window-'));
  try {
    const file = path.join(dir, 'windows.json');
    const defaults = { width: 1510, height: 960, minWidth: 1000, minHeight: 600 };
    const screens = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    const state = { bounds: { x: 120, y: 70, width: 1240, height: 780 }, maximized: true };
    saveWindowState(file, 'main', state);
    saveWindowState(file, 'devices', {
      bounds: { x: 2500, y: 50, width: 600, height: 800 },
      maximized: false,
    });
    assert.deepEqual(restoreWindowState(file, 'main', screens, defaults), state);
    const restored = restoreWindowState(file, 'devices', screens, { ...defaults, minWidth: 360 });
    assert.equal(restored.bounds.x, 1320);
    assert.equal(restored.bounds.width, 600);
    await writeFile(file, 'broken JSON');
    assert.deepEqual(restoreWindowState(file, 'main', screens, defaults), {
      bounds: { width: 1510, height: 960 },
      maximized: false,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('rewriting identical TypeScript output does not trigger a development restart; content changes do', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-output-'));
  try {
    const file = path.join(dir, 'main.js');
    await writeFile(file, 'export const value = 1;');
    const baseline = outputFingerprint(dir);
    await writeFile(file, 'export const value = 1;');
    await writeFile(path.join(dir, 'main.js.map'), 'ignored source map update');
    assert.equal(outputFingerprint(dir), baseline);
    await writeFile(file, 'export const value = 2;');
    assert.notEqual(outputFingerprint(dir), baseline);
    await rm(file);
    assert.notEqual(outputFingerprint(dir), baseline);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
