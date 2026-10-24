import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store.js';
import { parseAdb } from '../electron/devices.js';
import { nodePath, parseProposal, projectInput, settingsSchema } from '../shared/model.js';
test('projects persist independently, restore selected tab, reject overwrites and traversal', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-test-'));
  try {
    const store = new Store(path.join(dir, 'config'), dir);
    await store.load();
    const first = await store.create({ name: 'Android QA', platforms: ['android', 'flutter'] });
    await store.update({
      id: first.id,
      tab: 'execution',
      nodes: [
        {
          id: 'nav',
          kind: 'navigation',
          name: 'Connexion',
          description: 'Ouvrir la connexion',
          children: [
            {
              id: 'check',
              kind: 'assertion',
              name: 'Profil',
              description: 'Nom visible',
              children: [],
            },
          ],
        },
      ],
    });
    const second = await store.create({ name: 'iOS QA', platforms: ['ios'] });
    await store.select(first.id);
    const reload = new Store(path.join(dir, 'config'), dir);
    await reload.load();
    assert.equal(reload.state.activeProjectId, first.id);
    assert.equal(reload.get(first.id).tab, 'execution');
    assert.deepEqual(reload.get(second.id).nodes, []);
    assert.deepEqual(
      nodePath(reload.get(first.id).nodes, 'check').map((n) => n.id),
      ['nav', 'check'],
    );
    await assert.rejects(() => reload.create({ name: 'Android QA', platforms: ['ios'] }));
    await assert.rejects(() => reload.create({ name: '../escape', platforms: ['ios'] }));
    const disk = JSON.parse(
      await readFile(path.join(first.directory, 'cyberfox.project.json'), 'utf8'),
    );
    assert.equal(disk.tab, 'execution');
    await mkdir(path.join(store.state.settings.projectsDirectory, 'unrelated'));
    await assert.rejects(() => reload.create({ name: 'unrelated', platforms: ['android'] }));
    await assert.rejects(() =>
      reload.update({
        id: first.id,
        nodes: [
          {
            id: 'dup',
            kind: 'test',
            name: 'one',
            description: '',
            children: [{ id: 'dup', kind: 'test', name: 'two', description: '', children: [] }],
          },
        ],
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('parallel saves serialize without losing settings or project data', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-test-'));
  try {
    const store = new Store(path.join(dir, 'cfg'), dir);
    await store.load();
    const results = await Promise.all([
      store.create({ name: 'one', platforms: ['android'] }),
      store.create({ name: 'two', platforms: ['ios'] }),
    ]);
    assert.equal(new Set(results.map((p) => p.id)).size, 2);
    const next = new Store(path.join(dir, 'cfg'), dir);
    await next.load();
    assert.equal(next.state.projects.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('project names and WDA endpoints stay local and valid', () => {
  for (const name of ['../x', '..', 'a/b', 'a\\b', 'NUL', 'a.', ''])
    assert.equal(projectInput.safeParse({ name, platforms: ['android'] }).success, false);
  assert.equal(projectInput.safeParse({ name: 'QA mobile', platforms: [] }).success, false);
  const settings = {
    theme: 'dark',
    language: 'fr',
    projectsDirectory: '/tmp/QA',
    provider: 'codex',
    codexModel: '',
    copilotModel: '',
  };
  assert.equal(
    settingsSchema.safeParse({ ...settings, wdaUrl: 'http://127.0.0.1:8100' }).success,
    true,
  );
  assert.equal(
    settingsSchema.safeParse({ ...settings, wdaUrl: 'http://remote.example:8100' }).success,
    false,
  );
});
test('ADB discovery distinguishes ready, unauthorized, and emulators', () => {
  const devices = parseAdb(
    'List of devices attached\nabc device product:x model:Pixel_9 transport_id:1\nblocked unauthorized transport_id:2\nemulator-5554 device model:Android_SDK\nold offline\n',
  );
  assert.equal(devices.length, 4);
  assert.equal(devices[0].name, 'Pixel 9');
  assert.equal(devices[1].status, 'unauthorized');
  assert.equal(devices[2].kind, 'simulator');
});
test('AI proposals are validated and never interpreted as executable code', () => {
  assert.equal(
    parseProposal(
      '```json\n{"nodes":[{"id":"x","name":"Login","kind":"navigation","description":"Open login","children":[]}]}\n```',
    )?.[0].name,
    'Login',
  );
  assert.equal(
    parseProposal('{"nodes":[{"id":"x","kind":"shell","command":"rm -rf"}]}'),
    undefined,
  );
  assert.equal(parseProposal('A normal response'), undefined);
});

test('physical iPhone mirror uses an explicit tunnel association and real WDA status shape', async () => {
  const { createServer } = await import('node:http');
  const { Devices } = await import('../electron/devices.js');
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKioAAAAASUVORK5CYII=';
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ value: req.url === '/status' ? { ready: true, device: 'iphone' } : png }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const devices = new Devices(() => ({
      url: `http://127.0.0.1:${address.port}`,
      udid: 'QA-iPhone',
    }));
    devices.known.set('ios:QA-iPhone', {
      id: 'ios:QA-iPhone',
      name: 'QA',
      kind: 'usb',
      platform: 'ios',
      status: 'ready',
      detail: '',
    });
    assert.equal(await devices.screenshot('ios:QA-iPhone'), `data:image/png;base64,${png}`);
    devices.known.set('ios:other', {
      id: 'ios:other',
      name: 'Other',
      kind: 'usb',
      platform: 'ios',
      status: 'ready',
      detail: '',
    });
    await assert.rejects(() => devices.screenshot('ios:other'), /UDID/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
