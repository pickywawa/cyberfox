import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeNode } from '../shared/model.js';
import { IOS_ANONYMOUS_INPUT_SELECTOR, migrateIosCaretInputs } from '../shared/ios-input.js';
import { Store } from '../electron/store.js';

test('legacy caret input and its assertion are migrated on update and remain fixed after restart', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-caret-migration-'));
  try {
    const store = new Store(path.join(temp, 'config'), temp);
    await store.load();
    const project = await store.create({ name: 'Legacy PIN', platforms: ['ios'] });
    const root = makeNode('scenario', 'Login', ['ios']);
    const check = makeNode('test', 'PIN visible', ['ios']);
    const type = makeNode('action', 'Enter PIN', ['ios']);
    for (const n of [check, type])
      n.variants.ios!.locator = { using: 'accessibility id', value: '|' };
    type.variants.ios!.operation = 'type';
    type.variants.ios!.value = '${PIN}';
    root.children = [check, type];
    const unrelated = makeNode('scenario', 'Literal separator', ['ios']);
    unrelated.children = [structuredClone(check)];
    unrelated.children[0].id = 'other-check';
    const migrated = migrateIosCaretInputs([root, unrelated]);
    assert.deepEqual(migrated[1], unrelated);
    for (const n of migrated[0].children)
      assert.deepEqual(n.variants.ios!.locator, {
        using: 'xpath',
        value: IOS_ANONYMOUS_INPUT_SELECTOR,
      });
    assert.equal(root.children[0].variants.ios!.locator!.value, '|'); // no mutation
    await store.update({ id: project.id, nodes: [root] });
    assert.equal(
      store.get(project.id).nodes[0].children[0].variants.ios!.locator!.value,
      IOS_ANONYMOUS_INPUT_SELECTOR,
    );
    const reloaded = new Store(path.join(temp, 'config'), temp);
    await reloaded.load();
    assert.deepEqual(reloaded.get(project.id).nodes, store.get(project.id).nodes);
    // A stale editor submission cannot restore the broken caret selector.
    await reloaded.update({ id: project.id, nodes: [root] });
    assert.equal(
      reloaded.get(project.id).nodes[0].children[1].variants.ios!.locator!.value,
      IOS_ANONYMOUS_INPUT_SELECTOR,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
