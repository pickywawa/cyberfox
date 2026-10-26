import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Ai } from '../electron/ai.js';
import { Store } from '../electron/store.js';
import { makeNode, settingsSchema, type LiveEvent } from '../shared/model.js';
import { parseScreen } from '../electron/automation.js';

async function fixture(run: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const f = await setup();
  try {
    await run(f);
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
}
async function setup() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-creation-'));
  const store = new Store(path.join(temp, 'config'), temp);
  await store.load();
  const p = await store.create({ name: 'Creation', platforms: ['android', 'ios'] });
  await store.update({
    id: p.id,
    applications: { android: 'com.example.app', ios: 'com.example.app' },
    variables: { PASSWORD: 'secret-value' },
  });
  const screen = (id: string) =>
    parseScreen(
      '<hierarchy><node class="Button" resource-id="login" text="Login" bounds="[0,0][100,40]"/></hierarchy>',
      id,
    );
  const calls: unknown[][] = [];
  const launches: unknown[][] = [];
  const automation = {
    acquire() {},
    release() {},
    ensureApplication: async (...args: unknown[]) => {
      launches.push(args);
    },
    inspect: async (id: string) => screen(id),
    perform: async (...args: unknown[]) => {
      calls.push(args);
    },
  };
  const events: LiveEvent[] = [];
  const ai = new Ai(
    store,
    {
      known: new Map([
        ['a', { platform: 'android' }],
        ['i', { platform: 'ios' }],
      ]),
    } as any,
    () => {},
    async () => {},
    automation as any,
    (event) => events.push(event),
  );
  const root = makeNode('scenario', 'Login', ['android', 'ios']);
  const action = makeNode('action', 'Tap', ['android', 'ios']);
  const check = makeNode('test', 'Visible', ['android', 'ios']);
  for (const os of ['android', 'ios'] as const) {
    action.variants[os]!.locator = screen('a').components[0].locator;
    check.variants[os]!.locator = screen('a').components[0].locator;
  }
  root.children = [action, check];
  const prompts: string[] = [];
  const decisions: unknown[] = [];
  (ai as any).conversation = async () => ({
    send: async (prompt: string) => {
      prompts.push(prompt);
      assert.ok(decisions.length, 'unexpected model turn');
      return JSON.stringify(decisions.shift());
    },
    close: async () => {},
  });
  const perform = (deviceId: string) => ({
    tool: 'perform',
    deviceId,
    componentId: screen(deviceId).components[0].id,
    operation: 'tap',
  });
  const finish = () => ({ tool: 'finish', summary: 'Observed', nodes: [root] });
  const ask = () => ai.ask({ projectId: p.id, prompt: 'Login', deviceIds: ['a', 'i'] });
  const trace = async () => {
    const directory = path.join(p.directory, 'explorations');
    const files = await readdir(directory);
    return (
      await Promise.all(files.map((file) => readFile(path.join(directory, file), 'utf8')))
    ).join('');
  };
  return {
    temp,
    store,
    p,
    ai,
    calls,
    launches,
    automation,
    events,
    root,
    decisions,
    prompts,
    perform,
    finish,
    ask,
    trace,
  };
}

test('creation defaults and limits are validated and persisted', async () =>
  fixture(async ({ store, p }) => {
    assert.equal(store.state.settings.creationMaxDecisions, 40);
    assert.equal(store.state.settings.creationTimeoutMinutes, 10);
    assert.equal(
      settingsSchema.safeParse({ ...store.state.settings, creationMaxDecisions: 0 }).success,
      false,
    );
    await store.saveSettings({
      ...store.state.settings,
      creationMaxDecisions: 7,
      creationPrompt: 'Check accessibility',
    });
    await store.load();
    assert.equal(store.state.settings.creationMaxDecisions, 7);
    assert.equal(store.get(p.id).applications?.ios, 'com.example.app');
  }));

test('proposal replays separately on both operating systems and retains executed observations', async () =>
  fixture(async (f) => {
    f.decisions.push(f.perform('a'), f.perform('i'), f.finish());
    const reply = await f.ask();
    assert.deepEqual(
      reply.replay?.map((r) => r.status),
      ['passed', 'passed'],
    );
    assert.equal(f.calls.length, 6);
    assert.equal(f.launches.filter((args) => args[3] === true).length, 2);
    assert.equal(f.store.get(f.p.id).nodes.length, 0);
    const trace = await f.trace();
    assert.ok(trace.includes('observation'));
    assert.ok(trace.includes('replay-step'));
    assert.ok(trace.includes('proposal'));
  }));

test('unexecuted proposal actions are rejected even with observed selectors', async () =>
  fixture(async (f) => {
    f.decisions.push(f.finish(), f.finish(), f.finish());
    await assert.rejects(f.ask(), /absente de la trace/);
    assert.equal(f.prompts.filter((p) => p.includes('PROPOSAL VALIDATION ERROR')).length, 2);
    assert.equal(f.store.get(f.p.id).nodes.length, 0);
  }));

test('questions resume the same conversation and trace masks project secrets', async () =>
  fixture(async (f) => {
    f.decisions.push(
      { tool: 'question', summary: 'Quel compte ?' },
      f.perform('a'),
      f.perform('i'),
      f.finish(),
    );
    const pending = f.ask();
    const question = await new Promise<Extract<LiveEvent, { type: 'ai-question' }>>(
      (resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          const event = f.events.find((e) => e.type === 'ai-question');
          if (event?.type === 'ai-question') resolve(event);
          else if (Date.now() - started > 2000) reject(new Error('No question'));
          else setTimeout(poll, 5);
        };
        poll();
      },
    );
    f.ai.answer({
      projectId: f.p.id,
      questionId: question.questionId,
      answer: 'Use ${PASSWORD}; secret-value',
    });
    const reply = await pending;
    assert.ok(reply.proposal);
    assert.ok(f.prompts[1].includes('USER CLARIFICATION'));
    assert.equal((await f.trace()).includes('secret-value'), false);
    assert.throws(
      () => f.ai.answer({ projectId: f.p.id, questionId: question.questionId, answer: 'stale' }),
      /expirée/,
    );
  }));

test('replay failures stay visible per OS and never save additions', async () =>
  fixture(async (f) => {
    f.automation.perform = async (...args) => {
      f.calls.push(args);
      if (f.calls.length === 3) throw new Error('Selector unstable');
    };
    f.decisions.push(f.perform('a'), f.perform('i'), f.finish());
    const reply = await f.ask();
    assert.deepEqual(
      reply.replay?.map((r) => r.status),
      ['failed', 'passed'],
    );
    assert.match(reply.replay![0].message, /Selector unstable/);
    assert.equal(f.store.get(f.p.id).nodes.length, 0);
  }));

test('configured decision limit applies to exploration', async () =>
  fixture(async (f) => {
    await f.store.saveSettings({ ...f.store.state.settings, creationMaxDecisions: 1 });
    f.decisions.push({ tool: 'inspect', deviceId: 'a' });
    await assert.rejects(f.ask(), /Limite de 1 décisions/);
  }));

test('cancel interrupts a pending question and releases the exploration', async () =>
  fixture(async (f) => {
    f.decisions.push({ tool: 'question', summary: 'Continuer ?' });
    const pending = f.ask();
    const rejection = assert.rejects(pending, /interrompue/);
    while (!f.events.some((e) => e.type === 'ai-question'))
      await new Promise((resolve) => setTimeout(resolve, 5));
    f.ai.cancel(f.p.id);
    await rejection;
    assert.ok((await f.trace()).includes('stopped'));
    f.decisions.push({ tool: 'finish', nodes: [], summary: 'Stopped' });
    await f.ask();
  }));

test('replay detects initial state dependency before executing proposal', async () =>
  fixture(async (f) => {
    let restarted = false;
    f.automation.ensureApplication = async (...args) => {
      if (args[3]) restarted = true;
    };
    const inspect = f.automation.inspect;
    f.automation.inspect = async (id) => {
      const screen = await inspect(id);
      if (restarted) screen.components[0].text = 'Dashboard';
      return screen;
    };
    f.decisions.push(f.perform('a'), f.perform('i'), f.finish());
    const reply = await f.ask();
    assert.deepEqual(
      reply.replay?.map((r) => r.status),
      ['failed', 'failed'],
    );
    assert.match(reply.replay![0].message, /État initial/);
    assert.equal(f.calls.length, 2);
  }));

test('trace remains valid JSON with short numeric secrets', async () =>
  fixture(async (f) => {
    await f.store.update({ id: f.p.id, variables: { SHORT: '1', BOOL: 'true' } });
    f.decisions.push({ tool: 'finish', summary: '1 true', nodes: [] });
    await f.ask();
    const entries = (await f.trace())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.ok(entries.some((e) => e.entry.type === 'observation'));
    assert.equal(
      entries.find((e) => e.entry.type === 'observation').entry.screen.components[0].enabled,
      true,
    );
  }));

test('application lifecycle skips foreground apps and uses each driver’s application identifier', async () =>
  fixture(async (f) => {
    const { Automation } = await import('../electron/automation.js');
    for (const platform of ['android', 'ios'] as const) {
      const automation = new Automation(
        () => ({ id: 'device', platform, name: 'QA', kind: 'usb', status: 'ready', detail: '' }),
        () => f.store.state.settings,
        () => {},
      );
      const commands: any[] = [];
      let state = 4;
      (automation as any).session = async () => 'session';
      (automation as any).request = async (_route: string, _method: string, body: any) => {
        commands.push(body);
        return body.script === 'mobile: queryAppState' ? state : true;
      };
      try {
        await automation.ensureApplication('device', 'com.example.app');
        assert.deepEqual(
          commands.map((c) => c.script),
          ['mobile: queryAppState'],
        );
        commands.length = 0;
        state = 1;
        await automation.ensureApplication('device', 'com.example.app', undefined, true);
        assert.deepEqual(
          commands.map((c) => c.script),
          ['mobile: terminateApp', 'mobile: queryAppState', 'mobile: activateApp'],
        );
        assert.deepEqual(commands[2].args, [
          platform === 'ios' ? { bundleId: 'com.example.app' } : { appId: 'com.example.app' },
        ]);
      } finally {
        await automation.stop();
      }
    }
  }));

test('missing navigation destination is repaired from observations without repeating device actions', async () =>
  fixture(async (f) => {
    await f.store.saveSettings({ ...f.store.state.settings, creationReplay: false });
    f.root.children[0].kind = 'navigation';
    const incomplete = structuredClone(f.finish());
    f.root.children[0].screen = {
      id: 'login',
      name: 'Login screen',
      variants: {
        android: { markers: [f.root.children[1].variants.android!.locator!] },
        ios: { markers: [f.root.children[1].variants.ios!.locator!] },
      },
    };
    f.decisions.push(f.perform('a'), f.perform('i'), incomplete, f.finish());
    const reply = await f.ask();
    assert.equal(reply.proposal?.[0].children[0].screen?.id, 'login');
    assert.equal(reply.proposal?.[0].children[1].kind, 'test');
    assert.equal(f.calls.length, 2);
    const correction = f.prompts.find((p) => p.includes('PROPOSAL VALIDATION ERROR'))!;
    assert.ok(correction.includes('Une navigation doit identifier son écran destination'));
    assert.ok(correction.includes('OBSERVED SCREENS'));
    assert.ok(correction.includes('PROPOSAL TO CORRECT'));
    assert.ok((await f.trace()).includes('proposal-invalid'));
    assert.equal(f.store.get(f.p.id).nodes.length, 0); // review remains required
  }));
