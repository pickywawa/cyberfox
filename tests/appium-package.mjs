import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { prepareAppiumRuntime } from '../dist-electron/electron/appium-runtime.js';
const folder = process.arch === 'x64' ? 'mac' : `mac-${process.arch}`;
const app = path.resolve(process.argv[2] ?? `release/${folder}/Cyberfox.app`);
const executable = path.join(app, 'Contents/MacOS/Cyberfox');
const modules = path.join(app, 'Contents/Resources/app.asar.unpacked/node_modules');
const home = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-appium-packaged-'));
let child;
try {
  await prepareAppiumRuntime(modules, home);
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', APPIUM_HOME: home };
  // Import both real driver dependency graphs using the packaged Electron Node runtime.
  const imports = ['appium-uiautomator2-driver', 'appium-xcuitest-driver', 'sharp']
    .map((name) => `require(${JSON.stringify(path.join(modules, name))})`)
    .join(';');
  await promisify(execFile)(executable, ['-e', imports], { cwd: home, env, timeout: 30000 });
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  let logs = '';
  child = spawn(
    executable,
    [
      path.join(modules, 'appium/build/lib/main.js'),
      '--address',
      '127.0.0.1',
      '--port',
      String(port),
      '--log-level',
      'error',
    ],
    { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (b) => (logs += b));
  child.stderr.on('data', (b) => (logs += b));
  let ready = false;
  for (let n = 0; n < 60; n++) {
    if (child.exitCode !== null) break;
    try {
      const data = await fetch(`http://127.0.0.1:${port}/status`, {
        signal: AbortSignal.timeout(1000),
      }).then((r) => r.json());
      if (data.value?.ready) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Packaged Appium did not start: ' + logs);
  console.log(
    'Packaged Appium server ready; Android/iOS drivers and native image processing imported successfully',
  );
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  await rm(home, { recursive: true, force: true });
}
