import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store.js';
import { parseApplicationBadging } from '../electron/application-info.js';

test('project configuration persists name, platforms and launch applications without moving or losing scenarios', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-project-edit-'));
  try {
    const store = new Store(path.join(temp, 'config'), temp);
    await store.load();
    const project = await store.create({
      name: 'Original',
      platforms: ['android'],
      applications: { android: 'com.example.app', ios: '' },
    });
    await store.update({
      id: project.id,
      name: 'Renamed',
      platforms: ['flutter'],
      applications: { android: 'com.example.new', ios: 'com.example.ios' },
      applicationDetails: { android: { id: 'com.example.new', name: 'Example app' } },
    });
    await store.load();
    const restored = store.get(project.id);
    assert.equal(restored.name, 'Renamed');
    assert.equal(restored.directory, project.directory);
    assert.deepEqual(restored.platforms, ['flutter']);
    assert.equal(restored.applications?.ios, 'com.example.ios');
    assert.equal(restored.applicationDetails?.android?.name, 'Example app');
    assert.deepEqual(restored.nodes, project.nodes);
    const workspace = JSON.parse(
      await readFile(path.join(temp, 'config', 'workspace.json'), 'utf8'),
    );
    assert.equal(workspace.projects[0].name, 'Renamed');
    await assert.rejects(store.update({ id: project.id, name: '../Invalid' }));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('APK metadata uses the actual application label and icon resource', () => {
  assert.deepEqual(
    parseApplicationBadging(
      "application-label:'Mon application'\napplication: label='Mon application' icon='res/mipmap/icon.png'",
    ),
    { name: 'Mon application', icon: 'res/mipmap/icon.png' },
  );
  assert.deepEqual(parseApplicationBadging(''), { name: undefined, icon: undefined });
});
