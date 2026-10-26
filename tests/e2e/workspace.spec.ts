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
  await expect(page.locator('.center-content .missing-device-warning')).toHaveCount(0);
  await expect(page.locator('.chat-panel .missing-device-warning')).toBeVisible();
  await expect(page.locator('.chat-panel .missing-device-warning button')).toHaveCount(0);
  const promptBox = await page.locator('.exploration-prompt').boundingBox();
  const warningBox = await page.locator('.prompt-device-warning').boundingBox();
  expect(warningBox!.y).toBeGreaterThanOrEqual(promptBox!.y + promptBox!.height);
  expect(warningBox!.width).toBe(promptBox!.width);
  expect(warningBox!.x).toBe(promptBox!.x);

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
  await expect(page.getByRole('button', { name: 'Exécuter Connexion', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Lancer une nouvelle campagne de test' }).click();
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
    let authenticated = true;
    const loginListeners = new Set<(event: any) => void>();
    (window as any).cyberfox = {
      logout: async () => {
        authenticated = false;
      },
      login: async () => {
        authenticated = true;
        for (const listener of loginListeners)
          listener({ provider: 'codex', output: 'Connecté', running: false });
      },
      load: async () => structuredClone(state),
      providerStatus: async () => ({
        provider: 'codex',
        authenticated,
        message: 'test',
        models: [
          { id: 'qa-model', name: 'QA model' },
          { id: 'qa-alternate', name: 'QA alternate' },
        ],
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
      onLogin: (listener: (event: any) => void) => {
        loginListeners.add(listener);
        return () => loginListeners.delete(listener);
      },
      runCurrent: async () => null,
      inspect: async (id: string) => ({
        deviceId: id,
        components: [],
        width: 100,
        height: 200,
        capturedAt: new Date().toISOString(),
      }),
      deviceHealth: async (id: string) => ({
        deviceId: id,
        checkedAt: new Date().toISOString(),
        checks: [
          {
            id: 'appium',
            label: 'Appium',
            state: 'error',
            detail: 'Serveur inaccessible',
            fix: 'Vérifier Cyberfox → Paramètres → Appareils',
          },
        ],
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
  await expect(page.getByRole('button', { name: 'Appareil Android', exact: true })).toContainText(
    'Pixel USB',
  );
  await expect(page.getByText('Exploration IA incomplète', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Appareil Android', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__test.scans)).toBeGreaterThan(1);
  await expect(page.getByRole('option', { name: 'Pixel USB USB' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Android Emulator Emulator' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Simulateurs / émulateurs', exact: false }).click();
  await expect(page.getByRole('option', { name: 'Android Emulator Emulator' })).toBeVisible();
  await page.getByRole('option', { name: 'Pixel USB USB' }).click();
  await expect(page.getByText('Exploration IA incomplète', { exact: false })).toHaveCount(0);
  const picker = page.getByRole('button', { name: 'Appareil Android', exact: true });
  const pickerBefore = await picker.boundingBox();
  await page.evaluate(() => {
    const w = window as any;
    const scan = w.cyberfox.devicesScan;
    w.__test.originalScan = scan;
    w.__test.pickerChanges = 0;
    const observer = new MutationObserver((changes) => {
      w.__test.pickerChanges += changes.length;
    });
    observer.observe(document.querySelector('.device-picker')!, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    w.__test.pickerObserver = observer;
    w.cyberfox.devicesScan = async () => {
      w.__test.backgroundPending = true;
      const result = await scan();
      await new Promise<void>((resolve) => {
        w.__test.releaseScan = resolve;
      });
      return result;
    };
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__test.backgroundPending), { timeout: 8000 })
    .toBe(true);
  await expect(picker.locator('.spin')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Actualiser les appareils', exact: true }).locator('.spin'),
  ).toHaveCount(0);
  expect(await picker.boundingBox()).toEqual(pickerBefore);
  await page.evaluate(() => {
    const w = window as any;
    w.__test.releaseScan();
    w.cyberfox.devicesScan = w.__test.originalScan;
  });
  await expect.poll(() => page.evaluate(() => (window as any).__test.pickerChanges)).toBe(0);
  await page.evaluate(() => (window as any).__test.pickerObserver.disconnect());
  await expect(page.locator('.mobile-toolbar .status-alert')).toHaveCount(0);
  await expect(page.locator('.mobile-toolbar .device-status-button')).toHaveCount(1);
  await expect(page.locator('.mobile-toolbar .status-overview')).toHaveClass(/has-errors/);
  await page
    .getByRole('button', { name: 'Diagnostic de l’appareil', exact: true })
    .click({ button: 'right' });
  await expect(
    page.getByRole('dialog', { name: 'Diagnostic de l’appareil', exact: true }),
  ).toContainText('Serveur inaccessible');
  await page
    .getByRole('dialog', { name: 'Diagnostic de l’appareil', exact: true })
    .getByRole('button', { name: 'Cyberfox → Paramètres → Appareils', exact: true })
    .click();
  await expect(
    page.getByText('TestFlight et WebDriverAgent : deux applications, deux signatures', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText('Équipe Fastlane / match : quel profil préparer ?', { exact: true }).click();
  await expect(
    page.getByText('Demandez à l’équipe qui gère match', { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 640 });
  const settingsDialog = page.getByRole('dialog');
  await page.getByRole('tab', { name: 'Android', exact: true }).click();
  await expect(
    page.getByText('Aucun paramètre spécifique Android', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('TestFlight et WebDriverAgent : deux applications, deux signatures', {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'iOS', exact: true }).click();
  const keepAwake = page.getByRole('checkbox', {
    name: 'Maintenir l’iPhone éveillé (expérimental)',
    exact: true,
  });
  await expect(keepAwake).not.toBeChecked();
  await keepAwake.check();
  await settingsDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(keepAwake).toBeChecked();
  await keepAwake.uncheck();
  await settingsDialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();

  await expect(page.getByText('Installer le profil sur le Mac', { exact: true })).toBeAttached();
  await expect(
    page.getByText('Installer et vérifier le certificat avec sa clé privée', { exact: true }),
  ).toBeAttached();
  const before = await settingsDialog.locator('footer').boundingBox();
  await settingsDialog.locator('.settings-content').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const after = await settingsDialog.locator('footer').boundingBox();
  expect(after!.y).toBe(before!.y);
  expect(after!.y + after!.height).toBeLessThanOrEqual(640);
  await expect(
    settingsDialog.getByRole('button', { name: 'Enregistrer', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.setViewportSize({ width: 1510, height: 960 });
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('button', { name: 'Intégration IA', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Déconnecter mon compte', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('IA connectée · prête à être utilisée', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Effort de raisonnement', { exact: true }).selectOption('high');
  await page.getByLabel('Modèle', { exact: true }).selectOption('qa-model');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('button', { name: 'Déconnecter mon compte', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Connecter mon compte', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Connecter mon compte', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Déconnecter mon compte', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.locator('.chat-ai-identity')).toContainText('Codex');
  await expect(page.getByLabel('Modèle IA du chat', { exact: true })).toHaveValue('qa-model');
  await expect(page.getByLabel('Effort IA du chat', { exact: true })).toHaveValue('high');
  await expect(page.locator('.chat-ai-identity')).not.toContainText('Quota : non communiqué');
  await expect(page.locator('.chat-ai-identity')).not.toContainText('Connecté');
  await page.getByLabel('Modèle IA du chat', { exact: true }).selectOption('qa-alternate');
  await page.getByLabel('Effort IA du chat', { exact: true }).selectOption('low');
  await expect(page.getByLabel('Modèle IA du chat', { exact: true })).toHaveValue('qa-alternate');
  await expect(page.getByLabel('Effort IA du chat', { exact: true })).toHaveValue('low');
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

test('project variables, isolated AI sessions and File menu persist; execution hides chat', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Variables and chats');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nouveau projet', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Variables du projet', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Variables', exact: true })).toHaveCount(0);
  await expect(page.locator('.chat-panel')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ajouter une variable', exact: true }).click();
  await page.getByLabel('Clé de variable 1', { exact: true }).fill('QA_USERNAME');
  await page.getByLabel('Valeur de variable 1', { exact: true }).fill('alice');
  await page.getByRole('button', { name: 'Ajouter une variable', exact: true }).click();
  await page.getByLabel('Clé de variable 2', { exact: true }).fill('QA_PASSWORD');
  await page.getByLabel('Valeur de variable 2', { exact: true }).fill('plain-password');
  await page.getByRole('button', { name: 'Enregistrer les variables', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Variables enregistrées');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Création', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  await expect(page.getByLabel('Valeur de variable 2', { exact: true })).toHaveValue(
    'plain-password',
  );
  await page.getByRole('button', { name: 'Ajouter une variable', exact: true }).click();
  await page.getByLabel('Clé de variable 3', { exact: true }).fill('QA_USERNAME');
  await page.getByRole('button', { name: 'Enregistrer les variables', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Variables du projet', exact: true }).getByRole('alert'),
  ).toContainText('Chaque clé doit être unique');
  await page
    .getByRole('button', { name: 'Supprimer la variable QA_USERNAME', exact: true })
    .last()
    .click();
  await page.getByLabel('Clé de variable 1', { exact: true }).fill('QA_LOGIN');
  await page
    .getByRole('button', { name: 'Supprimer la variable QA_PASSWORD', exact: true })
    .click();
  await page.getByRole('button', { name: 'Enregistrer les variables', exact: true }).click();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.getByLabel('Session IA', { exact: true })).toHaveValue('legacy-session');
  await expect(page.locator('.chat-ai-identity .chat-session-bar')).toHaveCount(1);
  const modelBox = await page.getByLabel('Modèle IA du chat', { exact: true }).boundingBox();
  const sessionBox = await page.getByLabel('Session IA', { exact: true }).boundingBox();
  expect(
    Math.abs(modelBox!.y + modelBox!.height / 2 - (sessionBox!.y + sessionBox!.height / 2)),
  ).toBeLessThan(3);
  await page.getByLabel('Demande à l’IA').fill('Brouillon de la première session');
  await page.getByRole('button', { name: 'Nouvelle session IA', exact: true }).click();
  await expect(page.getByLabel('Demande à l’IA')).toHaveValue('');
  const secondSession = await page.getByLabel('Session IA', { exact: true }).inputValue();
  expect(secondSession).not.toBe('legacy-session');
  await page.reload();
  await expect(page.getByLabel('Session IA', { exact: true })).toHaveValue(secondSession);
  await page.getByLabel('Session IA', { exact: true }).selectOption('legacy-session');
  await expect(page.getByLabel('Session IA', { exact: true })).toHaveValue('legacy-session');
  await page.getByRole('tab', { name: 'Exécution', exact: true }).click();
  await expect(page.locator('.chat-panel')).toHaveCount(0);
  await expect(
    page.getByRole('separator', { name: 'Redimensionner le chat', exact: true }),
  ).toHaveCount(0);
  await page.getByText('Fichier', { exact: true }).click();
  await page.getByRole('button', { name: 'Nouveau projet…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nouveau projet', exact: true })).toBeVisible();
  await page.getByLabel('Nom du projet').fill('Other project');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  await expect(page.getByText('Aucune variable.', { exact: false })).toBeVisible();
});
