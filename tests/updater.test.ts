import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Updater } from '../electron/updater.js';
import { newerVersion, selectAsset } from '../shared/update.js';
const data = Buffer.from('verified installer fixture');
const digest = createHash('sha256').update(data).digest('hex');
function release(arch = 'arm64') {
  return {
    tag_name: 'v0.3.0',
    name: 'Cyberfox 0.3.0',
    body: 'Notes',
    assets: [
      {
        name: `Cyberfox-0.3.0-mac-${arch}.dmg`,
        size: data.length,
        digest: 'sha256:' + digest,
        browser_download_url: `https://github.com/pickywawa/cyberfox/releases/download/v0.3.0/Cyberfox-0.3.0-mac-${arch}.dmg`,
      },
    ],
  };
}
test('version and installer matching reject prereleases, wrong architectures, untrusted URLs and missing hashes', () => {
  assert.equal(newerVersion('v0.3.0', '0.2.0'), true);
  assert.equal(newerVersion('0.3.0', '0.3.0'), false);
  assert.equal(newerVersion('v0.4.0-beta', '0.3.0'), false);
  assert.equal(selectAsset(release(), 'darwin', 'x64'), undefined);
  assert.ok(selectAsset(release(), 'darwin', 'arm64'));
  for (const patch of [{ digest: null }, { browser_download_url: 'https://evil.test/installer' }]) {
    const value = release();
    Object.assign(value.assets[0], patch);
    assert.equal(selectAsset(value, 'darwin', 'arm64'), undefined);
  }
});
async function fixture(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-updates-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test('download is streamed, verified and opened only after ready; duplicate downloads share a request', () =>
  fixture(async (directory) => {
    let assets = 0,
      opened = 0;
    const states: string[] = [];
    const updater = new Updater({
      directory,
      version: '0.2.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async (url) => {
        if (url.includes('api.github.com')) return Response.json(release());
        assets++;
        return new Response(data);
      },
      refreshProxy: async () => {},
      emit: (s) => states.push(s.state),
      open: async (file) => {
        assert.deepEqual(await readFile(file), data);
        opened++;
      },
    });
    await assert.rejects(() => updater.install());
    assert.equal((await updater.check()).state, 'available');
    await Promise.all([updater.download(), updater.download()]);
    assert.equal(assets, 1);
    assert.equal(updater.state.percent, 100);
    assert.ok(states.includes('downloading'));
    assert.equal(opened, 0);
    await updater.install();
    assert.equal(opened, 1);
    await writeFile(path.join(directory, release().assets[0].name), 'tampered');
    await assert.rejects(() => updater.install(), /modifié/);
    assert.equal(opened, 1);
  }));
test('interrupted network retries refresh proxy without disabling TLS; corrupt downloads never become installers', () =>
  fixture(async (directory) => {
    let calls = 0,
      reloads = 0;
    const updater = new Updater({
      directory,
      version: '0.2.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async (url) => {
        if (url.includes('api.github.com')) {
          calls++;
          if (calls === 1) throw new Error('network changed');
          return Response.json(release());
        }
        return new Response(Buffer.alloc(data.length, 1));
      },
      refreshProxy: async () => {
        reloads++;
      },
      emit: () => {},
      open: async () => {
        throw new Error('Must not open');
      },
    });
    assert.equal((await updater.check()).state, 'available');
    assert.equal(reloads, 1);
    await assert.rejects(() => updater.download(), /SHA-256/);
    assert.equal(updater.state.state, 'error');
    assert.deepEqual(await readdir(directory), []);
    await assert.rejects(() => updater.install());
  }));
test('current releases clear notification and missing compatible assets are explicit', () =>
  fixture(async (directory) => {
    let latest = release('x64');
    const updater = new Updater({
      directory,
      version: '0.2.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async () => Response.json(latest),
      refreshProxy: async () => {},
      emit: () => {},
      open: async () => {},
    });
    assert.equal((await updater.check()).compatible, false);
    await assert.rejects(() => updater.download(), /Aucun installateur/);
    latest = { ...release(), tag_name: 'v0.2.0' };
    const status = await updater.check();
    assert.equal(status.state, 'current');
    assert.equal(status.version, undefined);
  }));

test('a verified cached installer survives restart and a changed checksum forces a new download', () =>
  fixture(async (directory) => {
    const file = path.join(directory, release().assets[0].name);
    await writeFile(file, data);
    const updater = new Updater({
      directory,
      version: '0.2.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async () => Response.json(release()),
      refreshProxy: async () => {},
      emit: () => {},
      open: async () => {},
    });
    assert.equal((await updater.check()).state, 'ready');
    await writeFile(file, 'corrupt cache');
    const restarted = new Updater({
      directory,
      version: '0.2.0',
      platform: 'darwin',
      arch: 'arm64',
      fetch: async () => Response.json(release()),
      refreshProxy: async () => {},
      emit: () => {},
      open: async () => {},
    });
    assert.equal((await restarted.check()).state, 'available');
    await assert.rejects(() => restarted.install());
  }));
