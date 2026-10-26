import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectUsbDevices } from '../shared/device-selection.js';
import type { Project, Device } from '../shared/model.js';
const device = (
  id: string,
  platform: Device['platform'],
  kind: Device['kind'] = 'usb',
  status: Device['status'] = 'ready',
): Device => ({ id, platform, kind, status, name: id, detail: '' });
const project = (platforms: Project['platforms'], deviceIds: Project['deviceIds'] = {}): Project =>
  ({ platforms, deviceIds }) as Project;
test('auto pairing selects ready USB devices only, includes both OS for Flutter and preserves manual selections', () => {
  const devices = [
    device('sim:a', 'ios', 'simulator'),
    device('ios:network', 'ios', 'network'),
    device('android:locked', 'android', 'usb', 'unauthorized'),
    device('ios:usb', 'ios'),
    device('android:usb', 'android'),
  ];
  assert.deepEqual(selectUsbDevices(project(['flutter']), devices), {
    android: 'android:usb',
    ios: 'ios:usb',
  });
  assert.deepEqual(selectUsbDevices(project(['android']), devices), { android: 'android:usb' });
  assert.deepEqual(selectUsbDevices(project(['ios'], { ios: 'sim:a' }), devices), { ios: 'sim:a' });
  assert.deepEqual(selectUsbDevices(project(['ios']), devices, new Set(['ios'])), {});
  assert.deepEqual(selectUsbDevices(project(['android'], { android: 'missing' }), devices), {
    android: 'android:usb',
  });
  assert.deepEqual(
    selectUsbDevices(
      project(['ios']),
      devices.filter((d) => d.kind !== 'usb'),
    ),
    {},
  );
});
