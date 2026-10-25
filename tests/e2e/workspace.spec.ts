import { test, expect } from '@playwright/test';
test('create roots and children without a modal; configure tags, preconditions, delete and restore tab', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Mobile QA');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await expect(page.getByText('Exploration IA incomplète', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter un scénario', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Nom', { exact: true }).fill('Connexion');
  await page.getByLabel('Description facultative').click();
  await expect(page.getByRole('treeitem', { name: 'Connexion', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter dans Connexion', exact: true }).click();
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('test');
  await page.getByLabel('Nom', { exact: true }).fill('Formulaire visible');
  await page.getByLabel('Description facultative').click();
  await page.getByLabel('Nouveau tag', { exact: true }).fill('smoke');
  await page.getByRole('button', { name: 'Ajouter le tag' }).click();
  await expect(page.getByRole('button', { name: 'smoke', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter dans Connexion', exact: true }).click();
  await page
    .getByLabel('Précondition · test précédent')
    .selectOption({ label: 'Formulaire visible' });
  await page.getByLabel('Exécuter les enfants si la précondition échoue').check();
  await page.getByRole('tab', { name: 'Exécution', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exécuter Connexion', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Exécution', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Création', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Nouvelle action', exact: true }).click();
  await page.getByRole('button', { name: 'Supprimer cet élément' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'Nouvelle action', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('resizable panels persist, settings expose analysis policy, one Android project shows one device zone', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Android only');
  await page.getByText('iOS', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await expect(page.locator('.mobile-zone')).toHaveCount(1);
  const drag = async (name: string, dx: number, dy: number) => {
    const box = await page.getByRole('separator', { name }).boundingBox();
    if (!box) throw new Error('Missing handle');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await page.mouse.up();
  };
  await drag('Redimensionner les scénarios', 45, 0);
  await drag('Redimensionner les appareils', -80, 0);
  await drag('Redimensionner le chat', 0, -60);
  await expect(page.locator('.chat-panel')).toHaveCSS('height', '290px');
  await page.reload();
  await expect(page.locator('.chat-panel')).toHaveCSS('height', '290px');
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('button', { name: 'Exécution', exact: true }).click();
  await page.getByLabel('Quand un test échoue').selectOption('automatic');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Paramètres enregistrés');
});
test('refresh on opening device menu, collapsed simulator group, semantic binding, contextual AI proposal review', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const settings = {
      theme: 'dark',
      language: 'fr',
      projectsDirectory: '/tmp/QA',
      provider: 'codex',
      codexModel: '',
      copilotModel: '',
      wdaDeviceId: '',
      wdaUrl: 'http://127.0.0.1:8100',
      appiumUrl: 'http://127.0.0.1:4723',
      iosTeamId: '',
      iosWdaBundleId: 'test',
      analysisMode: 'ask',
      devicesDetached: false,
      leftWidth: 254,
      rightWidth: 430,
      chatHeight: 230,
    };
    const node = (id: string, kind: string, name: string) => ({
      id,
      kind,
      name,
      description: '',
      tags: [],
      preconditionId: null,
      childrenOnPreconditionFailure: false,
      blocking: false,
      variants: {},
      children: [],
    });
    const root = node('root', 'scenario', 'Login');
    const project = {
      id: 'p',
      name: 'QA',
      directory: '/tmp/QA',
      platforms: ['android'],
      nodes: [root],
      tags: [],
      messages: [],
      revision: 0,
      selectedNodeId: 'root',
      deviceIds: {},
      tab: 'creation',
      createdAt: new Date().toISOString(),
    };
    let state = { settings, projects: [project], activeProjectId: 'p' };
    const listeners = new Set<any>();
    let scans = 0;
    (window as any).__test = {
      get scans() {
        return scans;
      },
      request: null,
    };
    (window as any).cyberfox = {
      load: async () => structuredClone(state),
      providerStatus: async () => ({
        provider: 'codex',
        authenticated: true,
        message: 'test',
        models: [],
      }),
      settingsSave: async (s: any) => {
        state.settings = s;
        return s;
      },
      projectUpdate: async (input: any) => {
        if (input.expectedRevision !== undefined && input.expectedRevision !== project.revision)
          throw new Error('Stale proposal');
        Object.assign(project, input);
        if (input.nodes) project.revision++;
        return structuredClone(project);
      },
      devicesScan: async () => {
        scans++;
        return {
          devices: [
            {
              id: 'android:usb',
              name: 'Pixel USB',
              platform: 'android',
              kind: 'usb',
              status: 'ready',
              detail: 'USB',
            },
            {
              id: 'android:emu',
              name: 'Android Emulator',
              platform: 'android',
              kind: 'simulator',
              status: 'ready',
              detail: 'Emulator',
            },
          ],
          diagnostics: [],
        };
      },
      onEvent: (f: any) => {
        listeners.add(f);
        return () => listeners.delete(f);
      },
      onLogin: () => () => {},
      runCurrent: async () => null,
      inspect: async (id: string) => ({
        deviceId: id,
        components: [],
        width: 100,
        height: 200,
        capturedAt: new Date().toISOString(),
      }),
      screenshot: async () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKioAAAAASUVORK5CYII=',
      aiAsk: async (input: any) => {
        (window as any).__test.request = input;
        return {
          text: 'Observed screen',
          parentId: 'root',
          baseRevision: project.revision,
          proposal: [
            {
              ...node('new', 'test', 'Welcome visible'),
              variants: {
                android: {
                  locator: { using: 'id', value: 'welcome' },
                  operation: 'assert',
                  value: '',
                  assertion: 'visible',
                  expected: '',
                  timeoutMs: 1000,
                },
              },
            },
          ],
        };
      },
      detachDevices: async () => {},
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Appareil Android', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__test.scans)).toBeGreaterThan(1);
  await expect(page.getByRole('option', { name: 'Pixel USB USB' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Android Emulator Emulator' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Simulateurs / émulateurs', exact: false }).click();
  await expect(page.getByRole('option', { name: 'Android Emulator Emulator' })).toBeVisible();
  await page.getByRole('option', { name: 'Pixel USB USB' }).click();
  await expect(page.getByText('Exploration IA incomplète', { exact: false })).toHaveCount(0);
  await page.getByLabel('Demande à l’IA').fill('Vérifie cet écran');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.tree-row.proposed')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('treeitem', { name: 'Welcome visible' }).click();
  await expect(page.getByRole('dialog').getByLabel('Nom', { exact: true })).toHaveValue(
    'Welcome visible',
  );
  expect(await page.evaluate(() => (window as any).__test.request.nodeId)).toBe('root');
  await page.getByRole('button', { name: 'Décliner', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: 'Welcome visible' })).toHaveCount(0);
  await page.getByLabel('Demande à l’IA').fill('Propose à nouveau ce test');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Accepter et ajouter au projet' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: 'Welcome visible' })).toBeVisible();
});
