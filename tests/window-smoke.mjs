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
  await expect(main.locator('.chat-on-right > .chat-panel')).toHaveCount(1);
  await main.getByRole('button', { name: 'Externaliser le panneau IA', exact: true }).click();
  await expect.poll(() => app.windows().length).toBe(3);
  await expect(main.locator('.chat-panel')).toHaveCount(0);
  const ai = app.windows().find((p) => p.url().includes('ai=1'));
  await expect(ai.locator('.detached-ai > .chat-panel')).toBeVisible();
  const expectedBounds = { x: 80, y: 70, width: 1200, height: 760 };
  await app.evaluate(
    ({ BrowserWindow }, bounds) =>
      BrowserWindow.getAllWindows()
        .find((w) => !/[?](devices|ai)=1/.test(w.webContents.getURL()))
        .setBounds(bounds),
    expectedBounds,
  );
  const savedBounds = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => !/[?](devices|ai)=1/.test(w.webContents.getURL()))
      .getBounds(),
  );
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => !/[?](devices|ai)=1/.test(w.webContents.getURL()))
      .close(),
  );
  let closeDeadline;
  try {
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        closeDeadline = setTimeout(
          () => reject(new Error('Main-window close did not quit Electron within 10 seconds')),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(closeDeadline);
  }
  app = await launch();
  await app.firstWindow();
  await expect.poll(() => app.windows().length).toBe(3);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => !/[?](devices|ai)=1/.test(w.webContents.getURL()))
        .getBounds(),
    ),
  ).toEqual(savedBounds);
  await expect.poll(() => app.windows().length).toBe(3);
  const restoredAi = app.windows().find((p) => p.url().includes('ai=1'));
  await restoredAi.getByRole('button', { name: 'Réintégrer le panneau IA', exact: true }).click();
  await expect.poll(() => app.windows().length).toBe(2);
  await expect(
    app
      .windows()
      .find((p) => !/[?](devices|ai)=1/.test(p.url()))
      .locator('.chat-on-right > .chat-panel'),
  ).toBeVisible();
  const devices = app.windows().find((p) => p.url().includes('devices=1'));
  await devices.getByRole('button', { name: 'Réintégrer les appareils' }).click();
  await expect.poll(() => app.windows().length).toBe(1);
  console.log(
    'Window geometry, main-window close quits the app, detached device window and restart persistence: passed',
  );
} finally {
  if (app) await app.close();
  await rm(temp, { recursive: true, force: true });
}
