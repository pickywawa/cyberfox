import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iosCapabilities, failureComponent } from '../electron/ios-config.js';
import { settingsSchema, type Device } from '../shared/model.js';
const phone: Device = {
  id: 'ios:qa-iphone',
  name: 'QA iPhone',
  kind: 'usb',
  platform: 'ios',
  status: 'ready',
  detail: 'USB',
};
const settings = (changes = {}) =>
  settingsSchema.parse({
    theme: 'dark',
    language: 'fr',
    projectsDirectory: '/tmp/qa',
    provider: 'codex',
    codexModel: '',
    copilotModel: '',
    wdaUrl: 'http://127.0.0.1:8100',
    iosTeamId: 'ABCDEFGHIJ',
    iosWdaBundleId: 'com.example.qa.WebDriverAgentRunner',
    ...changes,
  });
test('WDA automatic signing uses a dedicated bundle; manual xcconfig excludes competing signing capabilities', () => {
  const caps = iosCapabilities(settings(), phone, 'darwin');
  assert.equal(caps['appium:xcodeOrgId'], 'ABCDEFGHIJ');
  assert.equal(caps['appium:showXcodeLog'], true);
  assert.equal(caps['appium:allowProvisioningUpdates'], true);
  const manual = iosCapabilities(
    settings({ iosXcodeConfigFile: '/qa/wda.xcconfig' }),
    phone,
    'darwin',
  );
  assert.equal(manual['appium:xcodeConfigFile'], '/qa/wda.xcconfig');
  assert.equal(manual['appium:xcodeOrgId'], undefined);
  assert.equal(manual['appium:allowProvisioningUpdates'], undefined);
  assert.throws(
    () => iosCapabilities(settings({ iosWdaBundleId: '' }), phone, 'darwin'),
    /TestFlight/,
  );
});
test('Windows requires explicit iOS18+ and prepared WDA; external URL must match the phone UDID', () => {
  assert.throws(() => iosCapabilities(settings(), phone, 'win32'), /Mac/);
  assert.throws(
    () => iosCapabilities(settings({ iosWdaMode: 'preinstalled' }), phone, 'win32'),
    /18/,
  );
  const caps = iosCapabilities(
    settings({ iosWdaMode: 'preinstalled', iosPlatformVersion: '27.0.1' }),
    phone,
    'win32',
  );
  assert.equal(caps['appium:usePreinstalledWDA'], true);
  assert.equal(caps['appium:platformVersion'], '27.0.1');
  assert.equal(caps['appium:xcodeOrgId'], undefined);
  assert.throws(
    () => iosCapabilities(settings({ iosWdaMode: 'external' }), phone, 'darwin'),
    /UDID/,
  );
  const external = iosCapabilities(
    settings({ iosWdaMode: 'external', wdaDeviceId: 'qa-iphone' }),
    phone,
    'darwin',
  );
  assert.ok(external['appium:webDriverAgentUrl']);
});
test('diagnostics distinguish code65 signing, device locks, DDI and missing Appium modules', () => {
  assert.equal(failureComponent('xcodebuild failed with code 65'), 'signing');
  assert.equal(
    failureComponent('kAMDMobileImageMounterDeviceLocked: The device is locked'),
    'connection',
  );
  assert.equal(failureComponent('developer disk image could not be mounted'), 'ddi');
  assert.equal(failureComponent("Cannot find module 'semver'"), 'appium');
});
