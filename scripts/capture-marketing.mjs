// Capture the real browser-preview UI with fictional, reproducible demo data.
// Run with the Vite preview at http://127.0.0.1:5173. No devices or accounts are used.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = new URL('../site/assets/screenshots/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(process.env.CYBERFOX_PREVIEW_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Atlas Mobile');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('cyberfox.preview.v1'));
    const project = state.projects[0];
    state.settings.leftWidth = 280;
    state.settings.rightWidth = 520;
    state.settings.chatHeight = 230;
    const capture = (os, screen) => {
      const canvas = document.createElement('canvas');
      canvas.width = 390;
      canvas.height = 780;
      const c = canvas.getContext('2d');
      c.fillStyle = '#f5f6fb';
      c.fillRect(0, 0, 390, 780);
      const text = (value, x, y, size = 16, color = '#243349') => {
        c.fillStyle = color;
        c.font = `${size >= 24 ? '600 ' : ''}${size}px sans-serif`;
        c.fillText(value, x, y);
      };
      text('9:41', 24, 28, 12);
      text(os === 'ios' ? '● ● ●' : '▰  ●', 316, 28, 12);
      text('ATLAS', 24, 85, 15, '#7759e9');
      text(screen === 'home' ? 'Bonjour Camille.' : 'Votre prochain départ.', 24, 136, 28);
      text('Un espace pour vos prochaines idées.', 24, 166, 14, '#7c8697');
      const card = (y, title, subtitle, color) => {
        c.fillStyle = color;
        c.beginPath();
        c.roundRect(24, y, 342, 138, 20);
        c.fill();
        text(title, 44, y + 45, 22);
        text(subtitle, 44, y + 76, 14);
      };
      card(206, 'Un week-end à Lisbonne', 'Collection personnelle · 8 lieux', '#e8e2fb');
      card(364, 'La ville au grand air', 'Inspiration · 12 découvertes', '#dcefe9');
      text('Vos collections', 24, 550, 20);
      text('Enregistrés récemment', 24, 580, 13, '#7c8697');
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.roundRect(24, 605, 342, 70, 14);
      c.fill();
      text('Les bonnes adresses', 44, 638, 16);
      text('6 favoris pour plus tard', 44, 659, 12, '#7c8697');
      text('⌂ Accueil        ♡ Collections        ○ Profil', 25, 744, 13, '#7759e9');
      return canvas.toDataURL();
    };
    const variant = (operation, value = '') => ({
      operation,
      locator: { using: 'accessibility id', value: 'demo-control' },
      value,
      assertion: 'visible',
      expected: '',
      timeoutMs: 10000,
    });
    const node = (id, name, kind, operation = 'assert') => ({
      id,
      name,
      kind,
      description: 'Données de démonstration · application fictive.',
      tags: [],
      preconditionId: null,
      childrenOnPreconditionFailure: false,
      blocking: false,
      variants: kind === 'scenario' ? {} : { ios: variant(operation), android: variant(operation) },
      children: [],
    });
    const root = node('scenario-login', 'Connexion et découverte', 'scenario');
    root.children = [
      node('login-ready', 'Vérifier le formulaire de connexion', 'test'),
      node('login', 'Se connecter à Atlas', 'navigation', 'type'),
      node('home-title', 'Vérifier l’accueil personnalisé', 'test'),
      node('collections', 'Ouvrir mes collections', 'navigation', 'tap'),
      node('collection-ready', 'Vérifier les collections', 'test'),
    ];
    for (const n of root.children.filter((n) => n.kind === 'navigation'))
      n.screen = {
        id: n.id === 'login' ? 'home' : 'collections',
        name: n.id === 'login' ? 'Accueil' : 'Collections',
        variants: {
          ios: { markers: [{ using: 'accessibility id', value: 'demo-control' }] },
          android: { markers: [{ using: 'accessibility id', value: 'demo-control' }] },
        },
      };
    root.children[1].variants.ios.value = '${ATLAS_PIN}';
    root.children[1].variants.android.value = '${ATLAS_PIN}';
    const second = node('scenario-profile', 'Vérifier mon profil', 'scenario');
    second.children = [node('profile-ready', 'Vérifier les informations du profil', 'test')];
    project.nodes = [root, second];
    project.tags = ['Connexion', 'Smoke test'];
    project.selectedNodeId = 'home-title';
    project.applications = { ios: 'demo.atlas.ios', android: 'demo.atlas.android' };
    project.applicationDetails = {
      ios: { id: 'demo.atlas.ios', name: 'Atlas Mobile' },
      android: { id: 'demo.atlas.android', name: 'Atlas Mobile' },
    };
    project.variables = {};
    project.tab = 'execution';
    const campaignId = 'e0d16043-8fb3-4dd5-8ccc-6e6f5ee82a54';
    project.activeCampaignId = campaignId;
    const startedAt = '2026-10-26T09:00:00.000Z';
    const entries = [];
    for (const [index, n] of [...root.children, ...second.children].entries())
      for (const os of ['android', 'ios']) {
        const id =
          n.id === 'login-ready'
            ? 'login'
            : n.id === 'profile-ready'
              ? 'profile'
              : index >= 3
                ? 'collections'
                : 'home';
        const name = {
          login: 'Connexion',
          home: 'Accueil',
          collections: 'Collections',
          profile: 'Profil',
        }[id];
        const screen = { id, name, platform: os, identified: true };
        entries.push({
          id: `${n.id}-${os}`,
          nodeId: n.id,
          nodeName: n.name,
          kind: n.kind,
          platform: os,
          deviceId: os + ':demo',
          status: 'passed',
          outcome: 'passed',
          message: n.kind === 'test' ? 'Vérification réussie.' : 'Action effectuée.',
          operationMessage: n.kind === 'test' ? 'Vérification réussie.' : 'Action effectuée.',
          startedAt: new Date(Date.parse(startedAt) + index * 4200).toISOString(),
          finishedAt: new Date(Date.parse(startedAt) + index * 4200 + 1200).toISOString(),
          completedAt: new Date(Date.parse(startedAt) + index * 4200 + 1200).toISOString(),
          sequence: entries.length,
          screenshot: capture(os, id),
          screenBefore: screen,
          screenAfter: screen,
          analysisState: 'off',
        });
      }
    const campaign = {
      id: campaignId,
      projectId: project.id,
      label: 'Validation · Atlas 2.4',
      createdAt: startedAt,
      updatedAt: startedAt,
      status: 'open',
    };
    const report = {
      id: 'd8492039-4baf-43c5-ad72-0249dd27ee4f',
      projectId: project.id,
      campaignId,
      platforms: ['android', 'ios'],
      startedAt,
      finishedAt: '2026-10-26T09:00:27.000Z',
      status: 'passed',
      entries,
      snapshot: project.nodes,
    };
    localStorage.setItem('cyberfox.preview.v1', JSON.stringify(state));
    localStorage.setItem(
      'cyberfox.preview.campaigns.v1',
      JSON.stringify([{ campaign, reports: [report] }]),
    );
  });
  await page.reload();
  await page
    .locator('.result-row')
    .filter({ hasText: 'Vérifier l’accueil personnalisé' })
    .last()
    .locator('.result-step')
    .click();
  await page.locator('.replay-device-grid img').first().waitFor();
  await page.screenshot({ path: output + 'campaign.png' });
  await page.getByRole('tab', { name: 'Cartographie des écrans' }).click();
  await page.locator('.screen-map-card img').first().waitFor();
  await page.screenshot({ path: output + 'screen-map.png' });
  await page.getByRole('tab', { name: 'Création', exact: true }).click();
  await page
    .getByRole('treeitem', { name: 'Vérifier l’accueil personnalisé', exact: true })
    .click();
  await page.screenshot({ path: output + 'workspace.png' });
  console.log('Captured three Cyberfox views with fictional demo data.');
} finally {
  await browser.close();
}
