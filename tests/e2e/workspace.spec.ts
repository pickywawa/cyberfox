import { test, expect } from '@playwright/test';
test('onboarding, disk settings UI, projects and scenario tree survive reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Vos parcours.' })).toBeVisible();
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Banque mobile');
  await page.getByText('Flutter', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await expect(page.getByLabel('PROJET COURANT')).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'Ajouter un élément', exact: true }).first().click();
  await page.getByLabel('Nom', { exact: true }).fill('Authentification');
  await page.getByLabel('Description et résultat attendu').fill('Le profil est accessible');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Authentification' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Chemin du scénario' })
      .getByRole('button', { name: 'Authentification' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Exécution' }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Exécution' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('button', { name: 'Apparence', exact: true }).click();
  await page.getByRole('button', { name: 'Dracula', exact: true }).click();
  await page.getByLabel('Langue').selectOption('en');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Execution' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(errors).toEqual([]);
});
test('configured provider unlocks creation; project switching preserves independent tabs', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Set<(e: unknown) => void>();
    let state = {
      settings: {
        theme: 'dark',
        language: 'fr',
        projectsDirectory: '/tmp/Cyberfox',
        provider: 'codex',
        codexModel: '',
        copilotModel: '',
        wdaDeviceId: '',
        wdaUrl: 'http://127.0.0.1:8100',
      },
      projects: [
        {
          id: 'one',
          name: 'Application Android',
          platforms: ['android'],
          tab: 'creation',
          directory: '/tmp/one',
          nodes: [],
          messages: [],
          createdAt: new Date().toISOString(),
        },
        {
          id: 'two',
          name: 'Application iOS',
          platforms: ['ios'],
          tab: 'execution',
          directory: '/tmp/two',
          nodes: [],
          messages: [],
          createdAt: new Date().toISOString(),
        },
      ],
      activeProjectId: 'one',
    };
    (window as any).cyberfox = {
      load: async () => structuredClone(state),
      providerStatus: async () => ({
        provider: 'codex',
        authenticated: true,
        message: 'Test provider',
        models: [],
      }),
      projectSelect: async (id: string) => {
        state.activeProjectId = id;
      },
      projectUpdate: async (input: any) => {
        const i = state.projects.findIndex((p) => p.id === input.id);
        Object.assign(state.projects[i], input);
        return structuredClone(state.projects[i]);
      },
      devicesScan: async () => ({
        devices: [
          {
            id: 'android:1',
            name: 'Pixel QA',
            platform: 'android',
            kind: 'usb',
            status: 'ready',
            detail: 'USB',
          },
          {
            id: 'sim:2',
            name: 'iPhone QA',
            platform: 'ios',
            kind: 'simulator',
            status: 'ready',
            detail: 'Simulator',
          },
        ],
        diagnostics: [],
      }),
      onLogin: (f: any) => {
        listeners.add(f);
        return () => listeners.delete(f);
      },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Que souhaitez-vous tester ?' })).toBeVisible();
  await expect(
    page.getByLabel('Appareil 1').getByRole('option', { name: 'Pixel QA · Android' }),
  ).toBeAttached();
  await expect(
    page.getByLabel('Appareil 1').getByRole('option', { name: 'iPhone QA · iOS' }),
  ).toHaveCount(0);
  await page.getByRole('tab', { name: 'Exécution' }).click();
  await expect(
    page.getByRole('heading', { name: 'Prêt pour les prochaines étapes' }),
  ).toBeVisible();
  await page.getByLabel('PROJET COURANT').selectOption('two');
  await expect(page.getByRole('tab', { name: 'Exécution' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByLabel('Appareil 1').getByRole('option', { name: 'iPhone QA · iOS' }),
  ).toBeAttached();
  await page.getByRole('tab', { name: 'Création' }).click();
  await page.getByLabel('PROJET COURANT').selectOption('one');
  await expect(page.getByRole('tab', { name: 'Exécution' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
