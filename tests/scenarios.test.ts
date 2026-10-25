import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  makeNode,
  validateTree,
  requiredOS,
  variantSchema,
  migrateProject,
  type ScenarioNode,
  type LiveEvent,
} from '../shared/model.js';
import { Store } from '../electron/store.js';
import { Runner } from '../electron/runner.js';
import { parseScreen } from '../electron/automation.js';
test('only scenarios are roots, roots cannot be nested, preconditions are immediately preceding tests', () => {
  const root = makeNode('scenario', 'Scenario', ['android']);
  const test = makeNode('test', 'Check', ['android']);
  const action = makeNode('action', 'Act', ['android']);
  root.children = [test, action];
  action.preconditionId = test.id;
  validateTree([root]);
  assert.throws(() => validateTree([action]));
  assert.throws(() => validateTree([{ ...root, children: [root] }]));
  root.children = [action, test];
  assert.throws(() => validateTree([root]));
  assert.deepEqual(requiredOS({ platforms: ['flutter', 'android'] }), ['android', 'ios']);
});
test('legacy trees migrate without losing descriptions and IDs', () => {
  const legacy = migrateProject({
    nodes: [
      {
        id: 'root',
        kind: 'folder',
        name: 'Login',
        description: 'original',
        children: [
          { id: 'check', kind: 'assertion', name: 'Visible', description: 'check', children: [] },
        ],
      },
    ],
  });
  assert.equal(legacy.nodes[0].kind, 'scenario');
  assert.equal(legacy.nodes[0].children[0].kind, 'test');
  assert.equal(legacy.nodes[0].description, 'original');
  assert.equal(legacy.nodes[0].children[0].id, 'check');
  validateTree(legacy.nodes);
});
test('component exploration uses actual accessible identifiers and masks secure field contents', () => {
  const screen = parseScreen(
    '<hierarchy><node class="android.widget.EditText" resource-id="app:id/password" text="secret" password="true" enabled="true" bounds="[10,20][110,60]"/><node class="android.widget.Button" text="Login" enabled="true" bounds="[10,80][110,120]"/></hierarchy>',
    'android:1',
  );
  assert.equal(screen.components.length, 2);
  assert.equal(screen.components[0].text, '[secure]');
  assert.equal(screen.components[0].locator?.using, 'id');
  assert.ok(screen.components[1].locator?.value.includes('@text='));
  assert.equal(JSON.stringify(screen.components).includes('secret'), false);
});
async function runnerFixture(fn: (context: any) => Promise<void>) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-runner-'));
  try {
    const store = new Store(path.join(temp, 'config'), temp);
    await store.load();
    await store.saveSettings({ ...store.state.settings, analysisMode: 'off' });
    const p = await store.create({ name: 'QA', platforms: ['android', 'ios'] });
    const calls: string[] = [];
    const events: LiveEvent[] = [];
    let active = 0,
      maxActive = 0;
    const auto = {
      acquire() {},
      release() {},
      async perform(id: string, v: any) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        calls.push(id + ':' + v.value);
        if (v.value === 'fail') throw new Error('Expected failure');
      },
    };
    const devices = {
      known: new Map(
        ['android:1', 'ios:2'].map((id) => [
          id,
          { id, platform: id.startsWith('android') ? 'android' : 'ios', status: 'ready' },
        ]),
      ),
      screenshot: async () => undefined,
    };
    const runner = new Runner(
      store,
      auto as any,
      devices as any,
      (e) => events.push(structuredClone(e)),
      async () => 'Diagnosis',
    );
    await fn({ store, p, calls, events, runner, parallel: () => maxActive });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
const check = (name: string, value: string) => {
  const n = makeNode('test', name, ['android', 'ios']);
  for (const os of ['android', 'ios'] as const)
    n.variants[os] = variantSchema.parse({
      operation: 'assert',
      value,
      locator: { using: 'id', value: name },
      timeoutMs: 0,
    });
  return n;
};
async function complete(runner: Runner, pid: string) {
  for (let i = 0; i < 300; i++) {
    const report = await runner.current(pid);
    if (report?.finishedAt) {
      await new Promise((r) => setTimeout(r, 30));
      return report;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Run did not finish');
}
test('parallel OS execution continues after nonblocking failures and preserves failed report', async () =>
  runnerFixture(async ({ store, p, runner, calls, parallel }) => {
    const root = makeNode('scenario', 'Root', ['android', 'ios']);
    root.children = [check('first', 'fail'), check('second', 'pass')];
    await store.update({ id: p.id, nodes: [root] });
    const started = await runner.start({ projectId: p.id, deviceIds: ['android:1', 'ios:2'] });
    const done = await complete(runner, p.id);
    assert.equal(done?.status, 'failed');
    assert.ok(calls.includes('android:1:pass'));
    assert.ok(calls.includes('ios:2:pass'));
    assert.equal(parallel(), 2);
    const persisted = JSON.parse(
      await readFile(path.join(p.directory, 'reports', started.id + '.json'), 'utf8'),
    );
    assert.equal(persisted.status, 'failed');
  }));
test('failed precondition skips own action but can execute children; blocking failures block siblings', async () =>
  runnerFixture(async ({ store, p, runner, calls }) => {
    const root = makeNode('scenario', 'Root', ['android', 'ios']);
    const guard = check('guard', 'fail');
    const action = check('conditional', 'skip-own');
    action.preconditionId = guard.id;
    action.childrenOnPreconditionFailure = true;
    action.children = [check('child', 'child')];
    const blocking = check('blocking', 'fail');
    blocking.blocking = true;
    root.children = [guard, action, blocking, check('must-not-run', 'after')];
    await store.update({ id: p.id, nodes: [root] });
    await runner.start({ projectId: p.id, deviceIds: ['android:1'] });
    const done = await complete(runner, p.id);
    assert.ok(calls.includes('android:1:child'));
    assert.equal(
      calls.some((s: string) => s.includes('skip-own')),
      false,
    );
    assert.equal(
      calls.some((s: string) => s.endsWith(':after')),
      false,
    );
    assert.equal(
      done.entries.find((e: any) => e.nodeId === root.children[3].id)?.status,
      'blocked',
    );
    assert.ok(
      done.entries.some((e: any) => e.deviceId === 'missing:ios' && e.status === 'blocked'),
    );
  }));

test('real WebDriver protocol waits for semantic assertion and taps an element rather than coordinates', async () => {
  const { createServer } = await import('node:http');
  const { Automation } = await import('../electron/automation.js');
  const { settingsSchema } = await import('../shared/model.js');
  let displayed = 0;
  const requests: { route: string; body: any }[] = [];
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    requests.push({ route: req.url!, body: text ? JSON.parse(text) : undefined });
    let value: any = {};
    if (req.url === '/status') value = { ready: true };
    else if (req.url === '/session') value = { sessionId: 'session' };
    else if (req.url?.endsWith('/elements'))
      value = [{ 'element-6066-11e4-a52e-4f735466cecf': 'element' }];
    else if (req.url?.endsWith('/displayed')) value = ++displayed >= 2;
    else if (req.url?.endsWith('/text')) value = 'Ready';
    else if (req.url?.endsWith('/rect')) value = { x: 10, y: 10, width: 100, height: 50 };
    else if (req.url?.endsWith('/source'))
      value =
        '<hierarchy><node class="android.widget.Button" resource-id="app:id/ready" text="Ready" bounds="[10,10][110,60]"/></hierarchy>';
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ value }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const settings = settingsSchema.parse({
    theme: 'dark',
    language: 'fr',
    provider: 'codex',
    projectsDirectory: '/tmp',
    codexModel: '',
    copilotModel: '',
    wdaUrl: 'http://127.0.0.1:8100',
    appiumUrl: `http://127.0.0.1:${address.port}`,
  });
  const { Automation: Driver } = await import('../electron/automation.js');
  const automation = new Driver(
    () => ({
      id: 'android:1',
      name: 'QA',
      kind: 'usb',
      platform: 'android',
      status: 'ready',
      detail: '',
    }),
    () => settings,
    () => {},
  );
  try {
    const variant = variantSchema.parse({
      locator: { using: 'id', value: 'app:id/ready' },
      assertion: 'text',
      expected: 'Ready',
      operation: 'assert',
      timeoutMs: 1500,
    });
    await automation.perform('android:1', variant, 'test');
    assert.ok(displayed >= 2);
    await automation.perform('android:1', { ...variant, operation: 'tap' }, 'action');
    assert.ok(requests.some((r) => r.route.endsWith('/element/element/click')));
    assert.equal(
      requests.some((r) => r.route.endsWith('/actions')),
      false,
    );
    const sent = requests.find((r) => r.route.endsWith('/elements'))!;
    assert.deepEqual(sent.body, { using: 'id', value: 'app:id/ready' });
  } finally {
    await automation.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
