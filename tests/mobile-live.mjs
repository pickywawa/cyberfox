// Opt-in hardware smoke: inspect and assert the currently displayed screen; never sends MFA codes.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../dist-electron/electron/store.js';
import { Devices } from '../dist-electron/electron/devices.js';
import { Automation } from '../dist-electron/electron/automation.js';
import { Runner } from '../dist-electron/electron/runner.js';
import { makeNode, variantSchema } from '../dist-electron/shared/model.js';
const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-live-'));
const store = new Store(path.join(temp, 'config'), temp);
await store.load();
await store.saveSettings({ ...store.state.settings, analysisMode: 'off' });
const devices = new Devices(() => ({
  url: store.state.settings.wdaUrl,
  udid: store.state.settings.wdaDeviceId,
}));
const scan = await devices.scan();
const device = scan.devices.find(
  (d) => d.platform === 'android' && d.kind === 'usb' && d.status === 'ready',
);
if (!device) throw new Error('Connect an authorized Android USB device');
const automation = new Automation(
  (id) => devices.known.get(id),
  () => store.state.settings,
  () => {},
);
devices.automationScreenshot = (id) => automation.screenshot(id);
try {
  const screen = await automation.inspect(device.id);
  const target = screen.components.find(
    (c) => c.locator?.using === 'id' && c.locator.value.endsWith('/tv_get_security_code'),
  );
  if (!target) throw new Error('Pro SNP MFA screen is not displayed');
  const project = await store.create({ name: 'Pro SNP live smoke', platforms: ['android'] });
  const root = makeNode('scenario', 'Connexion jusqu’au contrôle MFA', ['android']);
  const test = makeNode('test', 'Étape MFA visible', ['android']);
  test.variants.android = variantSchema.parse({
    operation: 'assert',
    locator: target.locator,
    assertion: 'text',
    expected: 'Réception du code de sécurité',
    timeoutMs: 10000,
  });
  root.children = [test];
  await store.update({ id: project.id, nodes: [root] });
  let final;
  const runner = new Runner(
    store,
    automation,
    devices,
    (event) => {
      if (event.type === 'run' && event.report.finishedAt) final = event.report;
    },
    async () => {
      throw new Error('No AI calls during this smoke');
    },
  );
  await runner.start({ projectId: project.id, deviceIds: [device.id] });
  for (let n = 0; n < 400 && !final; n++) await new Promise((r) => setTimeout(r, 100));
  if (final?.status !== 'passed') throw new Error(JSON.stringify(final?.entries));
  console.log(
    JSON.stringify({
      components: screen.components.length,
      device: device.name,
      result: final.status,
      assertion: 'Pro SNP MFA step visible',
    }),
  );
  await new Promise((r) => setTimeout(r, 100));
} finally {
  await automation.stop();
  await rm(temp, { recursive: true, force: true });
}
