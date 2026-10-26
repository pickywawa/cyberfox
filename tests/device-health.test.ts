import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceDiagnostics } from '../electron/device-health.js';
import type { Automation } from '../electron/automation.js';
import { settingsSchema, type Device } from '../shared/model.js';
const settings = settingsSchema.parse({
  theme: 'dark',
  language: 'fr',
  projectsDirectory: '/tmp/qa',
  provider: 'codex',
  codexModel: '',
  copilotModel: '',
  wdaUrl: 'http://127.0.0.1:8100',
  iosWdaMode: 'preinstalled',
  iosWdaBundleId: 'com.example.wda',
});
const phone: Device = {
  id: 'ios:qa',
  platform: 'ios',
  name: 'QA',
  kind: 'manual',
  status: 'ready',
  detail: 'Configuration manuelle',
};
test('configured phone and installed driver do not claim a ready native session; failure retains Xcode evidence', async () => {
  const automation = {
    connectionState: () => ({
      connected: false,
      connecting: false,
      starting: false,
      failure: 'xcodebuild failed with code 65\nNo profiles for com.example.wda.xctrunner',
    }),
    request: async () => ({ ready: true }),
  } as unknown as Automation;
  const health = await new DeviceDiagnostics(automation, () => settings).health(phone, phone.id);
  assert.equal(health.checks.find((c) => c.id === 'connection')?.state, 'unknown');
  assert.equal(health.checks.find((c) => c.id === 'appium')?.state, 'ok');
  assert.equal(health.checks.find((c) => c.id === 'agent')?.state, 'error');
  assert.equal(health.checks.find((c) => c.id === 'signing')?.state, 'error');
  assert.match(health.checks.find((c) => c.id === 'signing')!.log!, /No profiles/);
});
test('unreachable Appium remains red even when a cached native session exists', async () => {
  const automation = {
    connectionState: () => ({ connected: true, connecting: false, starting: false }),
    request: async () => {
      throw new Error('offline');
    },
  } as unknown as Automation;
  const health = await new DeviceDiagnostics(automation, () => settings).health(phone, phone.id);
  assert.equal(health.checks.find((c) => c.id === 'appium')?.state, 'error');
});

test('a locked iPhone stays a visible diagnostic error even with a healthy native agent', async () => {
  const automation = {
    connectionState: () => ({
      connected: true,
      sessionId: 'native-session',
      connecting: false,
      starting: false,
    }),
    request: async (route: string) => (route.endsWith('/execute/sync') ? true : { ready: true }),
  } as unknown as Automation;
  const health = await new DeviceDiagnostics(automation, () => settings).health(phone, phone.id);
  assert.equal(health.checks.find((c) => c.id === 'lock')?.state, 'error');
  assert.equal(health.checks.find((c) => c.id === 'agent')?.state, 'ok');
  assert.match(health.checks.find((c) => c.id === 'lock')!.fix!, /Déverrouillez/);
});
