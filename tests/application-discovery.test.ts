import test from 'node:test';
import assert from 'node:assert/strict';
import { Automation } from '../electron/automation.js';
import { settingsSchema, type Device } from '../shared/model.js';

function setup(platform: 'android' | 'ios') {
  const device = {
    id: platform === 'android' ? 'android:phone' : 'ios:phone',
    platform,
    status: 'ready',
  } as Device;
  const auto = new Automation(
    () => device,
    () => settingsSchema.parse({}),
    () => {},
  );
  (auto as any).sessions.set(device.id, 'existing');
  return { auto, device };
}
test('discovery reads foreground identifiers without activating the application', async () => {
  for (const platform of ['android', 'ios'] as const) {
    const { auto, device } = setup(platform);
    const calls: any[] = [];
    auto.request = async (route, method, body: any) => {
      calls.push({ route, body });
      return platform === 'android'
        ? 'com.example.app'
        : { bundleId: 'com.example.app', name: 'Example' };
    };
    assert.equal((await auto.applications(device.id, 'current'))[0].id, 'com.example.app');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body?.script, platform === 'ios' ? 'mobile: activeAppInfo' : undefined);
  }
});
test('iOS discovery lists applications and rejects system foreground', async () => {
  const { auto, device } = setup('ios');
  auto.request = async (_route, _method, body: any) =>
    body.script === 'mobile: listApps'
      ? {
          'com.example.b': { CFBundleName: 'Beta' },
          'com.example.a': { CFBundleDisplayName: 'Alpha' },
        }
      : { bundleId: 'com.apple.springboard' };
  assert.deepEqual(await auto.applications(device.id, 'list'), [
    { id: 'com.example.a', name: 'Alpha' },
    { id: 'com.example.b', name: 'Beta' },
  ]);
  await assert.rejects(auto.applications(device.id, 'current'), /Aucune application/);
});
