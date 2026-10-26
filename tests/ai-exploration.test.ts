import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Ai } from '../electron/ai.js';
import { Store } from '../electron/store.js';
import { parseScreen } from '../electron/automation.js';
import { makeNode } from '../shared/model.js';

test('embedded exploration operates on observed iOS components and proposes two OS variants without saving the tree', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-exploration-'));
  try {
    const store = new Store(path.join(temp, 'config'), temp);
    await store.load();
    const project = await store.create({ name: 'Two OS', platforms: ['android', 'ios'] });
    await store.update({
      id: project.id,
      variables: { QA_USERNAME: 'alice', QA_PASSWORD: 'test-secret' },
    });
    const android = parseScreen(
      '<hierarchy><node class="android.widget.EditText" resource-id="app:id/user" bounds="[0,0][100,40]"/></hierarchy>',
      'android:a',
    );
    const ios = parseScreen(
      '<App><Field type="XCUIElementTypeTextField" name="user" x="0" y="0" width="100" height="40"/></App>',
      'ios:i',
    );
    const screens = new Map([
      [android.deviceId, android],
      [ios.deviceId, ios],
    ]);
    const calls: unknown[][] = [];
    const automation = {
      acquire() {},
      release() {},
      inspect: async (id: string) => screens.get(id),
      perform: async (...args: unknown[]) => {
        calls.push(args);
      },
    };
    const devices = {
      known: new Map([
        ['android:a', { platform: 'android' }],
        ['ios:i', { platform: 'ios' }],
      ]),
    };
    const root = makeNode('scenario', 'Login form', ['android', 'ios']);
    const check = makeNode('test', 'Username field visible', ['android', 'ios']);
    check.variants.android!.locator = android.components[0].locator;
    check.variants.ios!.locator = ios.components[0].locator;
    root.children = [check];
    const ai = new Ai(
      store,
      devices as any,
      () => {},
      async () => {},
      automation as any,
      () => {},
    );
    let turn = 0;
    const prompts: string[] = [];
    (ai as any).conversation = async () => ({
      send: async (prompt: string) => {
        prompts.push(prompt);
        return JSON.stringify(
          ++turn === 1
            ? {
                tool: 'perform',
                deviceId: 'ios:i',
                componentId: ios.components[0].id,
                operation: 'type',
                value: 'test-user',
              }
            : {
                tool: 'finish',
                summary: 'Both forms observed; no OTP delivery claim.',
                nodes: [root],
              },
        );
      },
      close: async () => {},
    });
    const reply = await ai.ask({
      projectId: project.id,
      prompt: 'Inspect both login forms',
      deviceIds: ['android:a', 'ios:i'],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'ios:i');
    assert.deepEqual((calls[0][1] as any).locator, ios.components[0].locator);
    assert.ok(reply.proposal![0].children[0].variants.android?.locator);
    assert.ok(reply.proposal![0].children[0].variants.ios?.locator);
    assert.equal(store.get(project.id).nodes.length, 0);
    assert.equal(store.get(project.id).messages.length, 2);
    assert.ok(prompts[0].includes('QA_PASSWORD'));
    assert.equal(prompts[0].includes('test-secret'), false);
    assert.deepEqual(calls[0][5], { QA_USERNAME: 'alice', QA_PASSWORD: 'test-secret' });
    const originalSession = store.get(project.id).activeChatSessionId!;
    const second = { id: 'another-chat', name: 'Session 2', createdAt: new Date().toISOString() };
    await store.update({
      id: project.id,
      chatSessions: [...store.get(project.id).chatSessions, second],
      activeChatSessionId: second.id,
    });
    const before = prompts.length;
    await ai.ask({
      projectId: project.id,
      sessionId: second.id,
      prompt: 'Other topic',
      deviceIds: ['android:a', 'ios:i'],
    });
    const metadata = (prompt: string) =>
      JSON.parse(prompt.split('\nMETADATA ')[1].split('\nINITIAL SCREENS ')[0]);
    assert.deepEqual(metadata(prompts[before]).history, []);
    await ai.ask({
      projectId: project.id,
      sessionId: originalSession,
      prompt: 'Resume the first topic',
      deviceIds: ['android:a', 'ios:i'],
    });
    const history = metadata(prompts[before + 1]).history;
    assert.ok(history.some((m: any) => m.content === 'Inspect both login forms'));
    assert.equal(
      history.some((m: any) => m.content === 'Other topic'),
      false,
    );
    assert.equal(store.get(project.id).messages.filter((m) => m.sessionId === second.id).length, 2);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('AI navigation requires a unique destination defined from a single observed screen', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-ai-screen-'));
  try {
    const store = new Store(path.join(temp, 'config'), temp);
    await store.load();
    const project = await store.create({ name: 'Screen identity', platforms: ['android'] });
    const home = parseScreen(
      '<hierarchy><node class="Button" resource-id="open-login" bounds="[0,0][30,30]"/></hierarchy>',
      'android:a',
    );
    const login = parseScreen(
      '<hierarchy><node class="Text" resource-id="login-title" bounds="[0,0][30,30]"/></hierarchy>',
      'android:a',
    );
    let current = home;
    const automation = {
      acquire() {},
      release() {},
      inspect: async () => current,
      perform: async () => {
        current = login;
      },
    };
    const devices = { known: new Map([['android:a', { platform: 'android' }]]) };
    const root = makeNode('scenario', 'Login', ['android']);
    const nav = makeNode('navigation', 'Open Login', ['android']);
    nav.variants.android!.locator = home.components[0].locator;
    nav.screen = {
      id: 'login',
      name: 'Login screen',
      variants: { android: { markers: [login.components[0].locator!] } },
    };
    root.children = [nav];
    const ai = new Ai(
      store,
      devices as any,
      () => {},
      async () => {},
      automation as any,
      () => {},
    );
    let turn = 0;
    (ai as any).conversation = async () => ({
      send: async () =>
        JSON.stringify(
          ++turn % 2 === 1
            ? {
                tool: 'perform',
                deviceId: 'android:a',
                componentId: home.components[0].id,
                operation: 'tap',
              }
            : { tool: 'finish', nodes: [root], summary: 'Observed destination' },
        ),
      close: async () => {},
    });
    const reply = await ai.ask({
      projectId: project.id,
      prompt: 'Open login',
      deviceIds: ['android:a'],
    });
    assert.equal(reply.proposal?.[0].children[0].screen?.id, 'login');
    assert.equal(store.get(project.id).nodes.length, 0);
    current = home;
    delete nav.screen;
    await assert.rejects(
      ai.ask({ projectId: project.id, prompt: 'Open login', deviceIds: ['android:a'] }),
      /identifier son écran/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

for (const mode of ['interactive', 'auto-approve'] as const) {
  test(`${mode} saves a supplied PIN before typing, independently of clarification settings`, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-pin-'));
    try {
      const store = new Store(path.join(temp, 'config'), temp);
      await store.load();
      await store.saveSettings({
        ...store.state.settings,
        explorationMode: mode,
        creationQuestions: false,
      });
      const project = await store.create({ name: 'PIN', platforms: ['ios'] });
      const screen = parseScreen(
        '<App><XCUIElementTypeSecureTextField x="0" y="0" width="100" height="40"/></App>',
        'ios:i',
      );
      const calls: any[][] = [];
      const events: any[] = [];
      const ai = new Ai(
        store,
        { known: new Map([['ios:i', { platform: 'ios' }]]) } as any,
        () => {},
        async () => {},
        {
          acquire() {},
          release() {},
          inspect: async () => screen,
          perform: async (...args: any[]) => {
            calls.push(args);
          },
        } as any,
        (event) => {
          events.push(event);
          if (event.type === 'ai-question') {
            assert.equal(store.get(project.id).variables.AGENDA_PIN, undefined);
            assert.equal(event.variableName, 'AGENDA_PIN');
            assert.equal(event.question.includes('4444'), false);
            ai.answer({ projectId: project.id, questionId: event.questionId, answer: 'approve' });
          }
        },
      );
      const decisions = [
        ...(mode === 'auto-approve' ? [{ tool: 'question', summary: 'Continue?' }] : []),
        { tool: 'create_variable', variableName: 'AGENDA_PIN', value: '9999' },
        { tool: 'create_variable', variableName: 'AGENDA_PIN', value: '4444' },
        { tool: 'create_variable', variableName: 'AGENDA_PIN', value: '44' },
        {
          tool: 'perform',
          deviceId: 'ios:i',
          componentId: screen.components[0].id,
          operation: 'type',
          value: '${AGENDA_PIN}',
        },
        { tool: 'finish', nodes: [], summary: 'Done' },
      ];
      const prompts: string[] = [];
      (ai as any).conversation = async () => ({
        send: async (prompt: string) => {
          prompts.push(prompt);
          return JSON.stringify(decisions.shift());
        },
        close: async () => {},
      });
      await ai.ask({
        projectId: project.id,
        prompt: 'Connexion avec le PIN 4444',
        deviceIds: ['ios:i'],
      });
      assert.equal(store.get(project.id).variables.AGENDA_PIN, '4444');
      assert.equal(calls.length, 1);
      assert.equal(calls[0][1].value, '${AGENDA_PIN}');
      assert.deepEqual(calls[0][5], { AGENDA_PIN: '4444' });
      assert.equal(
        events.filter((e) => e.type === 'ai-question').length,
        mode === 'interactive' ? 1 : 0,
      );
      assert.ok(prompts.some((p) => p.includes('VARIABLE ERROR')));
      assert.ok(prompts.some((p) => p.includes('Variable already exists')));
      const reloaded = new Store(path.join(temp, 'config'), temp);
      await reloaded.load();
      assert.equal(reloaded.get(project.id).variables.AGENDA_PIN, '4444');
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
}
