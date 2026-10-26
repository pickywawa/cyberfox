import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store.js';
import { Automation } from '../electron/automation.js';
import { resolveVariables, resolveVariant } from '../shared/variables.js';
import { variantSchema, migrateProject } from '../shared/model.js';

test('project variables and selected chat session persist in plain JSON and remain isolated between projects', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-variables-'));
  try {
    const store = new Store(path.join(temp, 'config'), temp);
    await store.load();
    const first = await store.create({ name: 'First', platforms: ['android'] });
    const second = await store.create({ name: 'Second', platforms: ['ios'] });
    const session = {
      id: 'second-session',
      name: 'Session 2',
      createdAt: new Date().toISOString(),
    };
    await store.update({
      id: first.id,
      variables: { QA_USERNAME: 'alice', QA_PASSWORD: 'plain-value' },
      chatSessions: [...first.chatSessions, session],
      activeChatSessionId: session.id,
      tab: 'variables',
    });
    const raw = JSON.parse(
      await readFile(path.join(first.directory, 'cyberfox.project.json'), 'utf8'),
    );
    assert.equal(raw.variables.QA_PASSWORD, 'plain-value');
    const reloaded = new Store(path.join(temp, 'config'), temp);
    await reloaded.load();
    assert.equal(reloaded.get(first.id).activeChatSessionId, session.id);
    assert.equal(reloaded.get(first.id).tab, 'creation');
    assert.equal(reloaded.get(first.id).variables.QA_USERNAME, 'alice');
    assert.deepEqual(reloaded.get(second.id).variables, {});
    await assert.rejects(store.update({ id: first.id, variables: { 'bad key': 'value' } }));
    await assert.rejects(
      store.update({ id: first.id, activeChatSessionId: 'missing' }),
      /Session IA/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test('old projects retain their messages in a recoverable first session', () => {
  const old = migrateProject({
    nodes: [],
    messages: [{ id: 'm', role: 'assistant', content: 'Existing conversation', at: '2026-01-01' }],
  });
  assert.equal(old.messages[0].content, 'Existing conversation');
  assert.equal(old.messages[0].sessionId, old.chatSessions[0].id);
  assert.equal(old.activeChatSessionId, old.chatSessions[0].id);
  assert.deepEqual(old.variables, {});
});
test('variables resolve input, assertions and selectors with project precedence and missing-key errors', () => {
  const v = variantSchema.parse({
    operation: 'type',
    value: '${QA_USERNAME}',
    expected: 'Hello ${QA_USERNAME}',
    locator: { using: 'id', value: 'app:id/${FIELD}' },
  });
  const resolved = resolveVariant(
    v,
    { QA_USERNAME: 'alice', FIELD: 'username' },
    { CYBERFOX_SECRET_QA_USERNAME: 'other' },
  );
  assert.equal(resolved.value, 'alice');
  assert.equal(resolved.expected, 'Hello alice');
  assert.equal(resolved.locator?.value, 'app:id/username');
  assert.equal(v.value, '${QA_USERNAME}');
  assert.equal(
    resolveVariables('${EMPTY}', { EMPTY: '' }, { CYBERFOX_SECRET_EMPTY: 'fallback' }),
    '',
  );
  assert.equal(resolveVariables('${LEGACY}', {}, { CYBERFOX_SECRET_LEGACY: 'old' }), 'old');
  assert.throws(() => resolveVariables('${MISSING}', {}), /MISSING/);
});
test('manual and runner automation resolve variables before sending native commands, without mutating scenario references', async () => {
  const auto = new Automation(
    () => ({
      id: 'android:a',
      platform: 'android',
      kind: 'usb',
      status: 'ready',
      name: 'QA',
      detail: '',
    }),
    () => ({}) as any,
    () => {},
  );
  (auto as any).sessions.set('android:a', 'native');
  const calls: any[] = [];
  auto.request = async (route, method, body) => {
    calls.push({ route, method, body });
    if (route.endsWith('/elements')) return [{ 'element-6066-11e4-a52e-4f735466cecf': 'field' }];
    if (route.endsWith('/rect')) return { x: 0, y: 0, width: 100, height: 40 };
    if (route.endsWith('/source'))
      return '<hierarchy><node class="Field" resource-id="app:id/user" bounds="[0,0][100,40]"/></hierarchy>';
    if (route.endsWith('/text')) return 'alice';
    return true;
  };
  try {
    const variant = variantSchema.parse({
      operation: 'type',
      value: '${USER}',
      locator: { using: 'id', value: 'app:id/${FIELD}' },
    });
    await auto.perform('android:a', variant, 'action', undefined, undefined, {
      USER: 'alice',
      FIELD: 'user',
    });
    assert.ok(calls.some((c) => c.route.endsWith('/value') && c.body.text === 'alice'));
    assert.ok(calls.some((c) => c.route.endsWith('/elements') && c.body.value === 'app:id/user'));
    await auto.perform(
      'android:a',
      variantSchema.parse({
        ...variant,
        operation: 'assert',
        assertion: 'text',
        expected: '${USER}',
      }),
      'test',
      undefined,
      undefined,
      { USER: 'alice', FIELD: 'user' },
    );
    assert.equal(variant.value, '${USER}');
  } finally {
    await auto.stop();
  }
});
