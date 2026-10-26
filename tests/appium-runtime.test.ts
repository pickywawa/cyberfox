import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareAppiumRuntime } from '../electron/appium-runtime.js';
test('Appium gets an isolated writable manifest referencing both bundled drivers, without developer checkout paths', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-appium-test-'));
  try {
    const modules = path.resolve('node_modules');
    await prepareAppiumRuntime(modules, temp);
    await prepareAppiumRuntime(modules, temp);
    const manifest = JSON.parse(
      await readFile(path.join(temp, 'node_modules/.cache/appium/extensions.yaml'), 'utf8'),
    );
    assert.deepEqual(Object.keys(manifest.drivers), ['uiautomator2', 'xcuitest']);
    for (const driver of Object.values(manifest.drivers) as any[]) {
      assert.equal(driver.installPath, path.join(modules, driver.pkgName));
      assert.equal(
        await realpath(path.join(temp, 'node_modules', driver.pkgName)),
        await realpath(driver.installPath),
      );
      assert.ok(driver.mainClass);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
