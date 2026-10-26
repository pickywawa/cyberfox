import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Automation } from '../electron/automation.js';
import { settingsSchema, type Device } from '../shared/model.js';

const phone: Device = {
  id: 'ios:qa',
  platform: 'ios',
  kind: 'usb',
  status: 'ready',
  name: 'QA iPhone',
  detail: 'USB',
};
function fixture() {
  const settings = settingsSchema.parse({
    theme: 'dark',
    language: 'fr',
    provider: 'codex',
    projectsDirectory: '/tmp/qa',
    codexModel: '',
    copilotModel: '',
    wdaUrl: 'http://127.0.0.1:8100',
  });
  let selected = [phone.id];
  let locked = false;
  const calls: any[] = [];
  const auto = new Automation(
    (id) => (id === phone.id ? phone : undefined),
    () => settings,
    () => {},
    undefined,
    () => selected,
  );
  (auto as any).sessions.set(phone.id, 'native-session');
  auto.request = async (route, method, body: any) => {
    if (route.endsWith('/execute/sync')) calls.push(body);
    return body?.script === 'mobile: isLocked' ? locked : null;
  };
  return {
    auto,
    settings,
    calls,
    setLocked: (value: boolean) => {
      locked = value;
    },
    setSelected: (value: string[]) => {
      selected = value;
    },
  };
}
test('keep-awake is off by default, scoped to selected physical iPhone and stops when disabled', async () => {
  const f = fixture();
  try {
    assert.equal(f.settings.iosKeepAwake, false);
    await f.auto.keepAwakeTick();
    assert.equal(f.calls.length, 0);
    f.settings.iosKeepAwake = true;
    await f.auto.keepAwakeTick();
    assert.deepEqual(
      f.calls.map((c) => [c.script, c.args]),
      [
        ['mobile: isLocked', []],
        ['mobile: pressButton', [{ name: 'volumeup' }]],
        ['mobile: pressButton', [{ name: 'volumedown' }]],
      ],
    );
    assert.equal(f.auto.connectionState(phone.id).keepAwake?.state, 'active');
    f.calls.length = 0;
    f.setSelected([]);
    await f.auto.keepAwakeTick();
    assert.equal(f.calls.length, 0);
    f.setSelected([phone.id]);
    f.settings.iosKeepAwake = false;
    await f.auto.keepAwakeTick();
    assert.equal(f.calls.length, 0);
    assert.equal(f.auto.connectionState(phone.id).keepAwake, undefined);
  } finally {
    await f.auto.stop();
  }
});
test('locked iPhone gets no button presses and is never automatically unlocked', async () => {
  const f = fixture();
  try {
    f.settings.iosKeepAwake = true;
    f.setLocked(true);
    await f.auto.keepAwakeTick();
    assert.deepEqual(
      f.calls.map((c) => c.script),
      ['mobile: isLocked'],
    );
    assert.equal(f.auto.connectionState(phone.id).keepAwake?.state, 'locked');
  } finally {
    await f.auto.stop();
  }
});
test('keep-awake pauses during test leases and native commands, but works during AI thinking', async () => {
  const f = fixture();
  try {
    f.settings.iosKeepAwake = true;
    f.auto.acquire([phone.id], 'report-id');
    await f.auto.keepAwakeTick();
    assert.equal(f.calls.length, 0);
    f.auto.release('report-id');
    let finish!: () => void;
    const busy = (f.auto as any).serial(
      phone.id,
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    );
    await Promise.resolve();
    await Promise.resolve();
    await f.auto.keepAwakeTick();
    assert.equal(f.calls.length, 0);
    finish();
    await busy;
    f.auto.acquire([phone.id], 'ai:project-id');
    await f.auto.keepAwakeTick();
    assert.equal(f.calls.length, 3);
    f.auto.release('ai:project-id');
    await f.auto.stop();
    f.calls.length = 0;
    await f.auto.keepAwakeTick();
    assert.equal(f.calls.length, 0);
  } finally {
    await f.auto.stop();
  }
});
test('unsupported button command is reported as a keep-awake error', async () => {
  const f = fixture();
  try {
    f.settings.iosKeepAwake = true;
    f.auto.request = async (_route, _method, body: any) => {
      if (body?.script === 'mobile: isLocked') return false;
      throw new Error('Unsupported button');
    };
    await f.auto.keepAwakeTick();
    assert.equal(f.auto.connectionState(phone.id).keepAwake?.state, 'error');
    assert.match(f.auto.connectionState(phone.id).keepAwake!.detail!, /Unsupported button/);
  } finally {
    f.auto.request = async () => null;
    await f.auto.stop();
  }
});
