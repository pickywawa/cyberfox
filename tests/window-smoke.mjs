import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-windows-'));
let app;
const launch = () =>
  electron.launch({
    args: ['.'],
    env: { ...process.env, CYBERFOX_USER_DATA: path.join(temp, 'config') },
  });
try {
  app = await launch();
  const main = await app.firstWindow();
  await main.getByRole('button', { name: 'Externaliser les appareils' }).waitFor();
  await main.getByRole('button', { name: 'Externaliser les appareils' }).click();
  await expect.poll(() => app.windows().length).toBe(2);
  await expect(main.locator('.resizable-workspace > .devices-pane')).toHaveCount(0);
  expect(
    await main.evaluate(async () => (await window.cyberfox.load()).settings.devicesDetached),
  ).toBe(true);
  await app.close();
  app = await launch();
  await expect.poll(() => app.windows().length).toBe(2);
  const devices = app.windows().find((p) => p.url().includes('devices=1'));
  await devices.getByRole('button', { name: 'Réintégrer les appareils' }).click();
  await expect.poll(() => app.windows().length).toBe(1);
  console.log('Detached device window and restart persistence: passed');
} finally {
  if (app) await app.close();
  await rm(temp, { recursive: true, force: true });
}
