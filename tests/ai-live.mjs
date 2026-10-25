// Opt-in real-provider smoke. Uses the current screen; no login, MFA sending or business mutation.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../dist-electron/electron/store.js';
import { Devices } from '../dist-electron/electron/devices.js';
import { Automation } from '../dist-electron/electron/automation.js';
import { Ai } from '../dist-electron/electron/ai.js';
import { flatten, validateTree } from '../dist-electron/shared/model.js';
const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-ai-smoke-'));
const store = new Store(path.join(temp, 'config'), temp);
await store.load();
const devices = new Devices(() => ({
  url: store.state.settings.wdaUrl,
  udid: store.state.settings.wdaDeviceId,
}));
const scan = await devices.scan();
const device = scan.devices.find(
  (d) => d.platform === 'android' && d.kind === 'usb' && d.status === 'ready',
);
if (!device) throw new Error('Android USB required');
const automation = new Automation(
  (id) => devices.known.get(id),
  () => store.state.settings,
  () => {},
);
const ai = new Ai(
  store,
  devices,
  () => {},
  async () => {},
  automation,
  (e) => {
    if (e.type === 'ai' && e.message) console.log(e.message);
  },
);
try {
  const project = await store.create({ name: 'AI current-screen check', platforms: ['android'] });
  const reply = await ai.ask({
    projectId: project.id,
    prompt:
      'Sans navigation et sans clic : observe seulement l’écran actuel de Pro SNP. Propose un scénario avec un test vérifiant le titre de la fenêtre de réception du code de sécurité. Ne saisis rien et n’envoie aucun code. Termine immédiatement après avoir préparé ce seul test.',
    deviceIds: [device.id],
  });
  if (!reply.proposal?.length) throw new Error(reply.text);
  validateTree(reply.proposal);
  const tests = flatten(reply.proposal).filter((n) => n.kind === 'test');
  if (!tests.length || !tests.every((n) => n.variants.android?.locator))
    throw new Error('No grounded assertion returned');
  console.log(
    JSON.stringify({
      proposalNodes: flatten(reply.proposal).length,
      assertions: tests.length,
      persistedNodes: store.get(project.id).nodes.length,
      currentPath: reply.parentId ?? null,
    }),
  );
} finally {
  await ai.stop();
  await automation.stop();
  await rm(temp, { recursive: true, force: true });
}
