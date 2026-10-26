import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-electron-'));
let app;
try {
  app = await electron.launch({
    args: process.env.CYBERFOX_EXECUTABLE ? [] : ['.'],
    ...(process.env.CYBERFOX_EXECUTABLE ? { executablePath: process.env.CYBERFOX_EXECUTABLE } : {}),
    env: { ...process.env, CYBERFOX_USER_DATA: path.join(temporary, 'config') },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().waitFor();
  const hasBridge = await page.evaluate(() => !!window.cyberfox);
  expect(hasBridge).toBe(true);
  await page.evaluate(
    async (root) => {
      const state = await window.cyberfox.load();
      await window.cyberfox.settingsSave({ ...state.settings, projectsDirectory: root });
    },
    path.join(temporary, 'projects'),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Smoke mobile');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await expect(page.getByLabel('PROJET COURANT')).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'Ajouter un scénario', exact: true }).first().click();
  await page.getByLabel('Nom', { exact: true }).fill('Profil visible');
  await page.getByLabel('Description facultative').click();
  await page.getByRole('tab', { name: 'Exécution' }).click();
  await expect(page.getByRole('heading', { name: 'Campagnes de test' })).toBeVisible();
  await page.getByRole('button', { name: 'Lancer une nouvelle campagne de test' }).click();
  await expect(page.locator('.campaign-title')).toBeVisible();
  const saved = JSON.parse(
    await readFile(
      path.join(temporary, 'projects', 'Smoke mobile', 'cyberfox.project.json'),
      'utf8',
    ),
  );
  expect(saved.tab).toBe('execution');
  expect(saved.activeCampaignId).toBeTruthy();
  const campaigns = await page.evaluate(async (id) => window.cyberfox.campaignList(id), saved.id);
  expect(campaigns.length).toBe(1);
  const createdAt = campaigns[0].createdAt;
  await page.evaluate(async (input) => window.cyberfox.campaignUpdate(input), {
    projectId: saved.id,
    campaignId: saved.activeCampaignId,
    label: 'Campagne persistante',
  });
  expect(saved.nodes[0].name).toBe('Profil visible');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Exécution' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.campaign-title')).toHaveText('Campagne persistante');
  const restored = await page.evaluate(async (input) => window.cyberfox.campaignLoad(input), {
    projectId: saved.id,
    campaignId: saved.activeCampaignId,
  });
  expect(restored.campaign.createdAt).toBe(createdAt);
  const text = await page.evaluate(async (input) => window.cyberfox.campaignExport(input), {
    projectId: saved.id,
    campaignId: saved.activeCampaignId,
  });
  expect(text).toContain('Campagne persistante');
  expect(text).not.toContain('data:image');
  await expect(page.locator('.chat-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nouveau projet', exact: true })).toHaveCount(0);
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu().getMenuItemById('new-project').click(),
  );
  await expect(page.getByRole('dialog', { name: 'Nouveau projet', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  const status = await page.evaluate(async () => {
    const b = window.cyberfox;
    const [codex, copilot, devices] = await Promise.all([
      b.providerStatus('codex'),
      b.providerStatus('copilot'),
      b.devicesScan(),
    ]);
    return {
      codex: codex.authenticated,
      copilot: copilot.authenticated,
      copilotModels: copilot.models.length,
      copilotError: copilot.authenticated ? undefined : copilot.message,
      devices: devices.devices.length,
    };
  });
  console.log(
    'Electron bridge, real filesystem, project restoration and SDK checks:',
    JSON.stringify(status),
  );
  expect(errors).toEqual([]);
  expect(status.copilotError ?? '').not.toMatch(/ENOTDIR|app\.asar/);
} finally {
  if (app) await app.close();
  await rm(temporary, { recursive: true, force: true });
}
