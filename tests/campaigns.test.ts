import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store.js';
import { Runner } from '../electron/runner.js';
import { identifyScreen, validateScreenDefinitions } from '../electron/screen-identity.js';
import { parseScreen } from '../electron/automation.js';
import { makeNode, type RunReport, type RunEntry } from '../shared/model.js';
import {
  campaignFrames,
  campaignText,
  screenMap,
  campaignExport,
  testedScreenMap,
  campaignCompletion,
} from '../shared/campaigns.js';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6XvAAAAAASUVORK5CYII=';
async function fixture(run: (store: Store, projectId: string) => Promise<void>) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-campaign-'));
  try {
    const store = new Store(path.join(temp, 'config'), temp);
    await store.load();
    const project = await store.create({ name: 'Campaign', platforms: ['android'] });
    await run(store, project.id);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
function entry(name = 'Check'): RunEntry {
  return {
    id: randomUUID(),
    nodeId: 'check',
    nodeName: name,
    kind: 'test',
    deviceId: 'android:a',
    platform: 'android',
    status: 'passed',
    outcome: 'passed',
    message: 'Visible',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    screenshot: png,
    screenBefore: { id: 'login', name: 'Login', platform: 'android', identified: true },
    screenAfter: { id: 'login', name: 'Login', platform: 'android', identified: true },
  };
}
function report(projectId: string, campaignId: string): RunReport {
  return {
    id: randomUUID(),
    projectId,
    campaignId,
    startedAt: new Date().toISOString(),
    status: 'passed',
    entries: [entry()],
    snapshot: [],
  };
}

test('campaigns retain multiple runs and immutable dates, use external image files, and survive restart', async () =>
  fixture(async (store, projectId) => {
    const campaign = await store.createCampaign({ projectId, label: 'Release' });
    const first = report(projectId, campaign.id),
      second = report(projectId, campaign.id);
    await store.saveReport(first);
    await store.saveReport(second);
    await store.updateCampaign({ projectId, campaignId: campaign.id, label: 'Release renamed' });
    await store.load();
    const detail = await store.loadCampaign(projectId, campaign.id);
    assert.equal(detail.reports.length, 2);
    assert.equal(detail.campaign.createdAt, campaign.createdAt);
    assert.equal(detail.campaign.label, 'Release renamed');
    assert.equal(store.get(projectId).activeCampaignId, campaign.id);
    assert.ok(detail.reports[0].entries[0].screenshot?.startsWith('capture:'));
    const json = await readFile(
      path.join(
        store.get(projectId).directory,
        'campaigns',
        campaign.id,
        'reports',
        first.id + '.json',
      ),
      'utf8',
    );
    assert.equal(json.includes('data:image'), false);
    assert.equal(
      await store.reportScreenshot({
        projectId,
        campaignId: campaign.id,
        runId: first.id,
        entryId: first.entries[0].id,
      }),
      png,
    );
    const exported = campaignText(detail);
    assert.equal(exported.includes('data:image'), false);
    assert.equal(exported.includes('capture:'), false);
    assert.ok(exported.includes('Release renamed'));
    assert.ok(exported.includes('succès : 2'));
    assert.equal(screenMap(detail).screens[0].failed, 0);
  }));

test('cleaning one campaign and all campaigns removes results and captures only for this project', async () =>
  fixture(async (store, projectId) => {
    const first = await store.createCampaign({ projectId }),
      second = await store.createCampaign({ projectId });
    await store.saveReport(report(projectId, first.id));
    await store.saveReport(report(projectId, second.id));
    const other = await store.create({ name: 'Other', platforms: ['android'] });
    const otherCampaign = await store.createCampaign({ projectId: other.id });
    await store.saveReport(report(other.id, otherCampaign.id));
    await store.cleanCampaigns(projectId, first.id);
    assert.equal((await store.loadCampaign(projectId, first.id)).reports.length, 0);
    assert.equal((await store.loadCampaign(projectId, second.id)).reports.length, 1);
    await store.cleanCampaigns(projectId);
    assert.equal((await store.loadCampaign(projectId, second.id)).reports.length, 0);
    assert.equal((await store.loadCampaign(other.id, otherCampaign.id)).reports.length, 1);
    await assert.rejects(store.loadCampaign(projectId, '../outside'));
  }));

test('screen identity requires unique co-occurring markers and never guesses when ambiguous', () => {
  const screen = parseScreen(
    '<hierarchy><node class="Text" resource-id="login-title" text="Login" bounds="[0,0][10,10]"/></hierarchy>',
    'android:a',
  );
  const node = makeNode('navigation', 'Open Login', ['android']);
  node.screen = {
    id: 'login',
    name: 'Login',
    variants: { android: { markers: [screen.components[0].locator!] } },
  };
  assert.equal(identifyScreen(screen, 'android', [node]).id, 'login');
  assert.equal(identifyScreen(screen, 'ios', [node]).identified, false);
  const other = structuredClone(node);
  other.id = randomUUID();
  other.screen!.id = 'other';
  assert.equal(identifyScreen(screen, 'android', [node, other]).identified, false);
  assert.throws(() => validateScreenDefinitions([node, other]), /mêmes marqueurs/);
});

test('runner requires an open campaign and captures successes and failures before children, with persisted screen transitions', async () =>
  fixture(async (store, projectId) => {
    const root = makeNode('scenario', 'Login', ['android']);
    const navigation = makeNode('navigation', 'Open Login', ['android']);
    const good = makeNode('test', 'Visible', ['android']),
      bad = makeNode('action', 'Failure', ['android']);
    const initial = parseScreen(
      '<hierarchy><node class="Button" resource-id="home" bounds="[0,0][20,20]"/></hierarchy>',
      'android:a',
    );
    const login = parseScreen(
      '<hierarchy><node class="Text" resource-id="login" bounds="[0,0][20,20]"/></hierarchy>',
      'android:a',
    );
    navigation.screen = {
      id: 'login',
      name: 'Login',
      variants: { android: { markers: [login.components[0].locator!] } },
    };
    root.children = [navigation, good, bad];
    await store.update({ id: projectId, nodes: [root] });
    let current = initial,
      captures = 0;
    const automation = {
      acquire() {},
      release() {},
      inspect: async () => current,
      screenshot: async () => {
        captures++;
        return png;
      },
      perform: async (_id: string, _variant: unknown, kind: string) => {
        if (kind === 'navigation') current = login;
        else if (kind === 'action') throw new Error('Failed action');
      },
    };
    const devices = { known: new Map([['android:a', { platform: 'android', status: 'ready' }]]) };
    const runner = new Runner(
      store,
      automation as any,
      devices as any,
      () => {},
      async () => '',
    );
    await assert.rejects(runner.start({ projectId, deviceIds: ['android:a'] }), /campagne/);
    const campaign = await store.createCampaign({ projectId });
    await store.saveSettings({ ...store.state.settings, analysisMode: 'off' });
    await runner.start({ projectId, deviceIds: ['android:a'] });
    for (let index = 0; runner.isRunning() && index < 100; index++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(runner.isRunning(), false);
    const detail = await runner.loadCampaign(projectId, campaign.id);
    assert.equal(captures, 3);
    assert.equal(campaignFrames(detail).length, 3);
    assert.equal(detail.reports[0].status, 'failed');
    assert.equal(
      detail.reports[0].entries.find((entry) => entry.nodeId === navigation.id)?.screenAfter?.id,
      'login',
    );
    assert.equal(
      detail.reports[0].entries.find((entry) => entry.nodeId === bad.id)?.outcome,
      'failed',
    );
    assert.equal(screenMap(detail).edges.length, 1);
    assert.equal(
      screenMap(detail).screens.find((screen) => screen.screen.id === 'login')?.passed,
      1,
    );
    await store.updateCampaign({ projectId, campaignId: campaign.id, status: 'completed' });
    await assert.rejects(runner.start({ projectId, deviceIds: ['android:a'] }), /terminée/);
  }));

test('campaign recovery marks interrupted runs cancelled without discarding successful captures', async () =>
  fixture(async (store, projectId) => {
    const campaign = await store.createCampaign({ projectId });
    const interrupted = report(projectId, campaign.id);
    interrupted.status = 'running';
    interrupted.entries.push({
      ...entry('Interrupted'),
      id: randomUUID(),
      status: 'running',
      completedAt: undefined,
      screenshot: undefined,
    });
    await store.saveReport(interrupted);
    const runner = new Runner(
      store,
      {} as any,
      {} as any,
      () => {},
      async () => '',
    );
    const recovered = await runner.loadCampaign(projectId, campaign.id);
    assert.equal(recovered.reports[0].status, 'cancelled');
    assert.equal(recovered.reports[0].entries[1].status, 'cancelled');
    assert.ok(recovered.reports[0].entries[0].screenshot);
  }));

test('a campaign can execute individual tests in separate steps on one explicitly selected OS', async () =>
  fixture(async (store, projectId) => {
    const root = makeNode('scenario', 'Partial', ['android']);
    const first = makeNode('test', 'First', ['android']),
      second = makeNode('test', 'Second', ['android']);
    root.children = [first, second];
    await store.update({ id: projectId, nodes: [root], platforms: ['android', 'ios'] });
    const campaign = await store.createCampaign({ projectId });
    const automation = {
      acquire() {},
      release() {},
      inspect: async () => parseScreen('<hierarchy/>', 'android:a'),
      screenshot: async () => png,
      perform: async () => {},
    };
    const devices = { known: new Map([['android:a', { platform: 'android', status: 'ready' }]]) };
    const runner = new Runner(
      store,
      automation as any,
      devices as any,
      () => {},
      async () => '',
    );
    for (const node of [first, second]) {
      const started = await runner.start({
        projectId,
        nodeId: node.id,
        platform: 'android',
        deviceIds: ['android:a'],
      });
      for (let index = 0; runner.isRunning() && index < 100; index++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal((await runner.current(projectId))?.status, 'passed');
    }
    const detail = await runner.loadCampaign(projectId, campaign.id);
    assert.equal(detail.reports.length, 2);
    assert.equal(campaignFrames(detail).length, 2);
    assert.equal(
      detail.reports
        .flatMap((report) => report.entries)
        .some((entry) => entry.deviceId.startsWith('missing:')),
      false,
    );
  }));

test('run all can clean only the current campaign and restart its configured application', async () =>
  fixture(async (store, projectId) => {
    const root = makeNode('scenario', 'Login', ['android']);
    root.children = [makeNode('test', 'Ready', ['android'])];
    await store.update({
      id: projectId,
      nodes: [root],
      applications: { android: 'com.example.app' },
    });
    await store.saveSettings({ ...store.state.settings, analysisMode: 'off' });
    const other = await store.createCampaign({ projectId, label: 'Other' });
    await store.saveReport(report(projectId, other.id));
    const campaign = await store.createCampaign({ projectId, label: 'Current' });
    const old = report(projectId, campaign.id);
    await store.saveReport(old);
    const launches: any[][] = [];
    const runner = new Runner(
      store,
      {
        acquire() {},
        release() {},
        inspect: async () => ({ deviceId: 'android:a', components: [] }),
        perform: async () => {},
        screenshot: async () => png,
        ensureApplication: async (...args: any[]) => {
          launches.push(args);
        },
      } as any,
      { known: new Map([['android:a', { platform: 'android', status: 'ready' }]]) } as any,
      () => {},
      async () => '',
    );
    await assert.rejects(
      runner.start({ projectId, deviceIds: [], resetCampaign: true }),
      /appareil/,
    );
    assert.equal((await store.loadCampaign(projectId, campaign.id)).reports.length, 1);
    const started = await runner.start({
      projectId,
      deviceIds: ['android:a'],
      resetCampaign: true,
    });
    for (let i = 0; runner.isRunning() && i < 100; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    const detail = await runner.loadCampaign(projectId, campaign.id);
    assert.deepEqual(
      detail.reports.map((r) => r.id),
      [started.id],
    );
    assert.equal(launches[0][3], true);
    assert.equal((await store.loadCampaign(projectId, other.id)).reports.length, 1);
    const captures = await readdir(
      path.join(store.get(projectId).directory, 'campaigns', campaign.id, 'captures'),
    );
    assert.equal(
      captures.some((name) => name.startsWith(old.id)),
      false,
    );
  }));

test('campaign export formats preserve failures and escape CSV, Markdown and Confluence values', async () =>
  fixture(async (store, projectId) => {
    const campaign = await store.createCampaign({ projectId, label: 'QA | <Agenda>' });
    const run = report(projectId, campaign.id);
    run.entries[0].nodeName = 'PIN | "visible"';
    run.entries[0].message = 'Line 1\nLine 2';
    run.entries[0].status = 'failed';
    run.entries[0].outcome = 'failed';
    run.entries[0].analysis = '=HYPERLINK("example")';
    const blocked = {
      ...run.entries[0],
      id: randomUUID(),
      nodeName: 'Next',
      status: 'blocked' as const,
      outcome: 'blocked' as const,
    };
    run.entries.push(blocked);
    const detail = { campaign, reports: [run] };
    const csv = campaignExport(detail, 'csv');
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('"PIN | ""visible"""'));
    assert.ok(csv.includes("'=HYPERLINK"));
    assert.ok(csv.includes('blocked'));
    const markdown = campaignExport(detail, 'markdown');
    assert.ok(markdown.includes('PIN \\| "visible"'));
    assert.ok(markdown.includes('&lt;Agenda&gt;'));
    assert.ok(markdown.includes('| failed |'));
    const confluence = campaignExport(detail, 'confluence');
    assert.ok(confluence.startsWith('h1.'));
    assert.ok(confluence.includes('||OS||'));
    assert.ok(confluence.includes('PIN &#124;'));
    assert.equal(campaignExport(detail), campaignText(detail));
    for (const format of ['csv', 'markdown', 'confluence'] as const)
      assert.equal(campaignExport(detail, format).includes('data:image'), false);
  }));

test('map hides screens with no tests and keeps paths through intermediate screens', async () =>
  fixture(async (store, projectId) => {
    const campaign = await store.createCampaign({ projectId });
    const run = report(projectId, campaign.id);
    const login = run.entries[0].screenBefore!;
    const loading = { ...login, id: 'loading', name: 'Loading' };
    const home = { ...login, id: 'home', name: 'Home' };
    run.entries.push({
      ...entry('Navigate'),
      kind: 'navigation',
      screenBefore: login,
      screenAfter: loading,
    });
    run.entries.push({
      ...entry('Wait'),
      kind: 'action',
      screenBefore: loading,
      screenAfter: home,
    });
    run.entries.push({ ...entry('Home visible'), screenBefore: home, screenAfter: home });
    const map = testedScreenMap({ campaign, reports: [run] });
    assert.deepEqual(map.screens.map((s) => s.screen.id).sort(), ['home', 'login']);
    assert.deepEqual(map.edges, [{ from: 'android:login', to: 'android:home', count: 1 }]);
  }));

test('campaign completion counts passes and failures once per step and OS, excluding unperformed steps', async () =>
  fixture(async (store, projectId) => {
    const campaign = await store.createCampaign({ projectId });
    const root = makeNode('scenario', 'Login', ['android']);
    root.children = ['passed', 'failed', 'blocked', 'skipped'].map((status) =>
      makeNode('test', status, ['android']),
    );
    const run = report(projectId, campaign.id);
    run.snapshot = [root];
    run.entries = root.children.map((node) => ({
      ...entry(node.name),
      nodeId: node.id,
      status: node.name as RunEntry['status'],
      outcome: node.name as RunEntry['outcome'],
    }));
    const project = { nodes: [root], platforms: ['android'] as const };
    const detail = { campaign, reports: [run] };
    assert.deepEqual(
      campaignCompletion(detail, { ...project, platforms: [...project.platforms] }),
      { completed: 2, total: 4, percent: 50 },
    );
    const retry = structuredClone(run);
    retry.id = randomUUID();
    retry.startedAt = new Date(Date.parse(run.startedAt) + 1000).toISOString();
    retry.entries = [{ ...retry.entries[1], status: 'passed', outcome: 'passed' }];
    detail.reports.push(retry);
    assert.equal(campaignCompletion(detail, { ...project, platforms: ['android'] }).percent, 50);
    assert.equal(
      campaignCompletion(detail, { ...project, platforms: ['android', 'ios'] }).percent,
      25,
    );
    assert.equal(
      campaignCompletion({ campaign, reports: [] }, { ...project, platforms: ['android'] }).percent,
      0,
    );
  }));
