import { test, expect } from '@playwright/test';

test('campaign required before running; persistent history, live replay, screen map and text export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Campaign UI');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter un scénario', exact: true }).first().click();
  await page.getByLabel('Nom', { exact: true }).fill('Connexion');
  await page.getByLabel('Description facultative').click();
  await page.getByRole('tab', { name: 'Exécution', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exécuter Connexion', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Lancer une nouvelle campagne de test' }).click();
  await expect(page.getByRole('button', { name: 'Exécuter Connexion', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actions de campagne' }).click();
  await page.getByRole('menuitem', { name: 'Renommer', exact: true }).click();
  await page.getByLabel('Libellé de la campagne').fill('Campagne de validation');
  await page.getByRole('button', { name: 'Enregistrer le nom', exact: true }).click();
  await page.evaluate(() => {
    const campaigns = JSON.parse(localStorage.getItem('cyberfox.preview.campaigns.v1')!);
    const detail = campaigns[0];
    const workspace = JSON.parse(localStorage.getItem('cyberfox.preview.v1')!);
    const project = workspace.projects[0];
    project.nodes[0].children = [
      {
        ...project.nodes[0],
        id: 'test-login',
        name: 'Formulaire visible',
        kind: 'test',
        children: [],
        variants: {},
      },
    ];
    localStorage.setItem('cyberfox.preview.v1', JSON.stringify(workspace));
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 32;
    const png = canvas.toDataURL();
    const login = { id: 'login', name: 'Connexion', platform: 'android', identified: true };
    const home = { id: 'home', name: 'Accueil', platform: 'android', identified: true };
    const first = {
      id: crypto.randomUUID(),
      nodeId: 'test-login',
      nodeName: 'Formulaire visible',
      kind: 'test',
      platform: 'android',
      deviceId: 'android:a',
      status: 'passed',
      outcome: 'passed',
      message: 'Visible',
      screenshot: png,
      startedAt: '2026-10-25T10:00:00.000Z',
      completedAt: '2026-10-25T10:00:01.000Z',
      screenBefore: login,
      screenAfter: login,
    };
    const second = {
      ...first,
      id: crypto.randomUUID(),
      nodeId: 'navigation-home',
      nodeName: 'Ouvrir Accueil',
      kind: 'navigation',
      startedAt: '2026-10-25T10:00:02.000Z',
      completedAt: '2026-10-25T10:00:03.000Z',
      screenBefore: login,
      screenAfter: home,
    };
    const third = {
      ...first,
      id: crypto.randomUUID(),
      nodeId: 'home-failure',
      nodeName: 'Solde visible',
      status: 'failed',
      outcome: 'failed',
      startedAt: '2026-10-25T10:00:04.000Z',
      completedAt: '2026-10-25T10:00:05.000Z',
      screenBefore: home,
      screenAfter: home,
    };
    detail.reports = [
      {
        id: crypto.randomUUID(),
        projectId: project.id,
        campaignId: detail.campaign.id,
        startedAt: first.startedAt,
        status: 'running',
        entries: [first, second, third],
        snapshot: [],
      },
    ];
    localStorage.setItem('cyberfox.preview.campaigns.v1', JSON.stringify(campaigns));
  });
  await page.reload();
  await expect(page.locator('.campaign-title')).toHaveText('Campagne de validation');
  await expect(page.getByRole('menuitem', { name: 'Tout nettoyer' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Arrêter', exact: true })).toBeVisible();
  const timeline = page.getByRole('slider', { name: 'Parcourir les captures' });
  await expect(timeline).toBeVisible();
  await timeline.fill('0');
  await expect(page.locator('.replay-devices')).toBeVisible();
  await expect(page.locator('.replay-device-grid img')).toHaveCount(1);
  await expect(page.locator('.replay-device').filter({ hasText: 'Android' })).toContainText(
    'Connexion',
  );
  await expect(page.locator('.replay-device').filter({ hasText: 'iOS' })).toContainText(
    'Aucune capture',
  );
  await page.getByRole('button', { name: 'Lire les captures', exact: true }).click();
  await expect(timeline).toHaveValue('2');
  await expect(page.locator('.replay-device').filter({ hasText: 'Android' })).toContainText(
    'Accueil',
  );
  await page.getByRole('button', { name: 'Revenir au direct', exact: true }).click();
  await expect(page.locator('.replay-devices')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lire les captures', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Cartographie des écrans' }).click();
  await expect(page.locator('.screen-map-tree')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connexion', exact: true })).toBeVisible();
  await expect(page.locator('.screen-map-edge')).toHaveCount(1);
  await expect(page.locator('.screen-map-card .campaign-capture')).toHaveCount(2);
  await page.getByRole('button', { name: 'Connexion', exact: true }).click();
  const popup = page.getByRole('dialog', { name: 'Connexion', exact: true });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('Formulaire visible');
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Rapport de campagne' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Progression', exact: true }).click();
  await expect(page.locator('.campaign-progress table')).toBeVisible();
  await expect(page.locator('.campaign-progress tbody > .result-row')).toHaveCount(3);
  await page.getByLabel('Filtrer les résultats').selectOption('failed');
  await expect(page.locator('.campaign-progress tbody > .result-row')).toHaveCount(1);
  await page.getByLabel('Filtrer les résultats').selectOption('all');
  await expect(
    page.getByRole('progressbar', { name: 'Avancement de la campagne' }),
  ).toHaveAttribute('aria-valuenow', '75');
  const row = page.locator('.campaign-progress .result-row').first();
  await row.locator('.result-step').click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.result-expanded')).toHaveCount(0);
  await expect(page.locator('.replay-devices')).toBeVisible();
  await expect(page.locator('.replay-device-grid img')).toHaveCount(1);
  await expect(
    page.getByRole('treeitem', { name: 'Formulaire visible', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Ajouter un scénario', exact: true })).toHaveCount(
    0,
  );
  const expand = row.getByRole('button', { name: 'Détails · Formulaire visible' });
  await expand.click();
  await expect(expand).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.result-expanded')).toContainText('Visible');
  await expect(page.locator('.result-expanded')).toContainText('Début');
  await expect(page.locator('.result-expanded img')).toHaveCount(0);
  await expand.click();
  await expect(page.locator('.result-expanded')).toHaveCount(0);
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.result-expanded')).toHaveCount(0);

  for (const [name, extension] of [
    ['Texte', '.txt'],
    ['CSV', '.csv'],
    ['Markdown', '.md'],
    ['Confluence', '-confluence.txt'],
  ]) {
    await page.locator('.report-export-menu summary').click();
    const download = page.waitForEvent('download');
    const item = page.getByRole('menuitem', { name: new RegExp('^' + name) });
    await expect(item.locator('svg')).toHaveCount(1);
    await item.click();
    expect((await download).suggestedFilename()).toContain(extension);
  }
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('cyberfox.preview.campaigns.v1')!);
    const report = data[0].reports[0];
    const first = report.entries[0];
    report.entries.push({
      ...first,
      id: crypto.randomUUID(),
      platform: 'ios',
      deviceId: 'ios:i',
      screenBefore: { ...first.screenBefore, platform: 'ios' },
      screenAfter: { ...first.screenAfter, platform: 'ios' },
    });
    const transient = {
      id: 'loading',
      name: 'Écran sans test',
      platform: 'android',
      identified: true,
    };
    report.entries.push({
      ...first,
      id: crypto.randomUUID(),
      kind: 'action',
      nodeName: 'Attente',
      screenBefore: transient,
      screenAfter: transient,
    });
    localStorage.setItem('cyberfox.preview.campaigns.v1', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Cartographie des écrans' }).click();
  await expect(page.locator('.screen-map-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Écran sans test', exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole('button', { name: 'Connexion', exact: true })
      .locator('.screen-map-counts > span'),
  ).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Connexion', exact: true }).locator('svg[aria-label="iOS"]'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: 'Connexion', exact: true })
      .locator('svg[aria-label="Android"]'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('run all asks how to handle existing campaign results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Rerun confirmation');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter un scénario', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Exécution', exact: true }).click();
  await page.getByRole('button', { name: 'Lancer une nouvelle campagne de test' }).click();
  await page.evaluate(() => {
    const campaigns = JSON.parse(localStorage.getItem('cyberfox.preview.campaigns.v1')!);
    const project = JSON.parse(localStorage.getItem('cyberfox.preview.v1')!).projects[0];
    campaigns[0].reports = [
      {
        id: crypto.randomUUID(),
        projectId: project.id,
        campaignId: campaigns[0].campaign.id,
        status: 'passed',
        startedAt: new Date().toISOString(),
        entries: [],
        snapshot: project.nodes,
      },
    ];
    localStorage.setItem('cyberfox.preview.campaigns.v1', JSON.stringify(campaigns));
  });
  await page.reload();
  await page.evaluate(async () => {
    const modulePath =
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => new URL(name).pathname === '/src/bridge.ts') || '/src/bridge.ts';
    const { api } = await import(modulePath);
    (window as any).runCalls = [];
    api.runStart = async (input: any) => {
      (window as any).runCalls.push(input);
      return {
        id: crypto.randomUUID(),
        projectId: input.projectId,
        campaignId: input.campaignId,
        status: 'passed',
        entries: [],
        snapshot: [],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    };
  });
  const run = page.getByRole('button', { name: 'Tout exécuter', exact: true }).last();
  const dialog = page.getByRole('dialog', { name: 'Relancer tous les tests' });
  await run.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  expect(await page.evaluate(() => (window as any).runCalls.length)).toBe(0);
  await run.click();
  await dialog.getByRole('button', { name: 'Conserver et exécuter' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).runCalls.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).runCalls[0].resetCampaign)).toBe(false);
  await run.click();
  await dialog.getByRole('button', { name: 'Nettoyer et relancer' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).runCalls.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).runCalls[1].resetCampaign)).toBe(true);
});
