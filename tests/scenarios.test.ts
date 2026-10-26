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
    const campaign = await store.createCampaign({ projectId: p.id });
    p.activeCampaignId = campaign.id;
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
      await readFile(
        path.join(p.directory, 'campaigns', p.activeCampaignId!, 'reports', started.id + '.json'),
        'utf8',
      ),
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

test('iOS exposes empty unnamed input fields without inventing identifiers or indexed selectors', () => {
  for (const role of ['TextField', 'SecureTextField', 'TextView', 'SearchField']) {
    const type = `XCUIElementType${role}`;
    const field = `<${type} type="${type}" name="" label="" value="" visible="true" enabled="true" x="20" y="100" width="200" height="44"/>`;
    const screen = parseScreen(`<App>${field}</App>`, 'ios:1');
    assert.equal(screen.components.length, 1);
    assert.deepEqual(screen.components[0].locator, {
      using: 'xpath',
      value: ['TextField', 'SecureTextField'].includes(role)
        ? '//*[self::XCUIElementTypeTextField or self::XCUIElementTypeSecureTextField]'
        : `//${type}`,
    });
    assert.equal(screen.components[0].password, role === 'SecureTextField');
    const repeated = parseScreen(`<App>${field}${field}</App>`, 'ios:1');
    assert.equal(repeated.components.length, 2);
    assert.deepEqual(repeated.components[0].locator, repeated.components[1].locator);
  }
  const hidden = parseScreen(
    '<App><XCUIElementTypeTextField visible="false" x="0" y="0" width="100" height="44"/></App>',
    'ios:1',
  );
  assert.equal(hidden.components.length, 0);
});

test('iOS distinguishes a button from its text sharing the same accessibility name without indexed selectors', () => {
  const screen = parseScreen(
    '<App><XCUIElementTypeButton type="XCUIElementTypeButton" name="Me connecter" x="10" y="10" width="100" height="40"><XCUIElementTypeStaticText type="XCUIElementTypeStaticText" name="Me connecter" x="10" y="10" width="100" height="40"/></XCUIElementTypeButton><XCUIElementTypeTextField type="XCUIElementTypeTextField" name="Identifiant" x="0" y="60" width="100" height="40"/></App>',
    'ios:1',
  );
  assert.equal(screen.components.length, 3);
  assert.deepEqual(screen.components[0].locator, {
    using: 'xpath',
    value: "//XCUIElementTypeButton[@name='Me connecter']",
  });
  assert.deepEqual(screen.components[1].locator, {
    using: 'xpath',
    value: "//XCUIElementTypeStaticText[@name='Me connecter']",
  });
  assert.notEqual(screen.components[0].id, screen.components[1].id);
  assert.equal(screen.components[2].locator?.using, 'accessibility id');
  const repeated = parseScreen(
    '<App><Button type="XCUIElementTypeButton" name="A" x="0" y="0" width="10" height="10"/><Button type="XCUIElementTypeButton" name="A" x="0" y="20" width="10" height="10"/></App>',
    'ios:1',
  );
  assert.equal(repeated.components[0].locator?.value, repeated.components[1].locator?.value); // Still ambiguous; execution must reject multiple matches.
});

test('Flutter caret and unfocused input share a stable selector while named fields keep their ID', () => {
  const plain = parseScreen(
    '<App><XCUIElementTypeTextField x="0" y="0" width="100" height="40"/></App>',
    'ios:1',
  );
  const focused = parseScreen(
    '<App><XCUIElementTypeSecureTextField name="|" value="|" x="0" y="0" width="100" height="40"/></App>',
    'ios:1',
  );
  assert.deepEqual(focused.components[0].locator, plain.components[0].locator);
  const named = parseScreen(
    '<App><XCUIElementTypeSecureTextField name="pin-input" x="0" y="0" width="100" height="40"/></App>',
    'ios:1',
  );
  assert.deepEqual(named.components[0].locator, { using: 'accessibility id', value: 'pin-input' });
});

for (const replacement of ['focus', 'clear']) {
  test(`iOS typing survives input replacement during ${replacement} and sends the secret once`, async () => {
    const { createServer } = await import('node:http');
    const { Automation, IOS_ANONYMOUS_INPUT_SELECTOR } = await import('../electron/automation.js');
    const { settingsSchema } = await import('../shared/model.js');
    let focused = false;
    let ambiguous = false;
    const writes: any[] = [];
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      let value: any = {};
      const key = 'element-6066-11e4-a52e-4f735466cecf';
      if (req.url === '/status') value = { ready: true };
      else if (req.url === '/session') value = { sessionId: 'session' };
      else if (req.url?.endsWith('/elements'))
        value = ambiguous
          ? [{ [key]: 'a' }, { [key]: 'b' }]
          : [{ [key]: focused ? 'secure' : 'plain' }];
      else if (req.url?.endsWith('/rect')) value = { x: 0, y: 0, width: 100, height: 40 };
      else if (req.url?.endsWith('/source'))
        value = '<App><XCUIElementTypeTextField x="0" y="0" width="100" height="40"/></App>';
      else if (req.url?.endsWith(replacement === 'focus' ? '/plain/click' : '/plain/clear')) {
        focused = true;
        res.statusCode = 404;
        value = { error: 'stale element reference', message: 'Input replaced on focus' };
      } else if (req.url?.endsWith('/value'))
        writes.push({ route: req.url, body: JSON.parse(body) });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ value }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const settings = settingsSchema.parse({
      appiumUrl: `http://127.0.0.1:${(server.address() as any).port}`,
      theme: 'dark',
      language: 'fr',
      projectsDirectory: '/tmp',
      provider: 'codex',
      codexModel: '',
      copilotModel: '',
      wdaUrl: 'http://127.0.0.1:8100',
      iosWdaMode: 'external',
      iosPlatformVersion: '18.0',
      wdaDeviceId: '1',
    });
    const automation = new Automation(
      () => ({
        id: 'sim:1',
        platform: 'ios',
        status: 'ready',
        kind: 'usb',
        name: 'iPhone',
        detail: '',
      }),
      () => settings,
      () => {},
    );
    try {
      const variant = variantSchema.parse({
        operation: 'type',
        locator: { using: 'xpath', value: IOS_ANONYMOUS_INPUT_SELECTOR },
        value: '${PIN}',
      });
      await automation.perform('sim:1', variant, 'action', undefined, undefined, { PIN: '4444' });
      assert.deepEqual(writes, [
        { route: '/session/session/element/secure/value', body: { text: '4444' } },
      ]);
      ambiguous = true;
      await assert.rejects(
        automation.perform('sim:1', variant, 'action', undefined, undefined, { PIN: '4444' }),
        /Sélecteur ambigu/,
      );
      assert.equal(writes.length, 1);
    } finally {
      await automation.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
