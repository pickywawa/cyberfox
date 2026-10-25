import { test, expect } from '@playwright/test';
test('new badge opens updates, download progress is live and install is explicit', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let status = {
      state: 'available',
      currentVersion: '0.2.0',
      version: '0.3.0',
      name: 'Cyberfox 0.3.0',
      notes: 'Release notes',
      url: 'https://github.com/pickywawa/cyberfox/releases/tag/v0.3.0',
      percent: 0,
      received: 0,
      total: 100,
      compatible: true,
    };
    const listeners = new Set<any>();
    let installed = 0;
    let settings = {
      theme: 'dark',
      language: 'fr',
      projectsDirectory: '/tmp/QA',
      provider: 'codex',
      codexModel: '',
      copilotModel: '',
      wdaDeviceId: '',
      wdaUrl: 'http://127.0.0.1:8100',
      analysisMode: 'ask',
      devicesDetached: false,
      leftWidth: 254,
      rightWidth: 430,
      chatHeight: 230,
      checkUpdatesOnStart: true,
      autoDownloadUpdates: false,
    };
    const publish = () => listeners.forEach((f) => f({ type: 'update', status: { ...status } }));
    (window as any).__updates = {
      finish: () => {
        status = { ...status, state: 'ready', percent: 100, received: 100 };
        publish();
      },
      get installed() {
        return installed;
      },
    };
    (window as any).cyberfox = {
      load: async () => ({ settings, projects: [], activeProjectId: null }),
      providerStatus: async () => ({ authenticated: false, models: [] }),
      devicesScan: async () => ({ devices: [], diagnostics: [] }),
      onEvent: (f: any) => {
        listeners.add(f);
        return () => listeners.delete(f);
      },
      onLogin: () => () => {},
      updateStatus: async () => ({ ...status }),
      updateCheck: async () => ({ ...status }),
      updateDownload: async () => {
        status = { ...status, state: 'downloading', percent: 50, received: 50 };
        publish();
        return { ...status };
      },
      updateInstall: async () => {
        installed++;
      },
      updateRelease: async () => {},
      settingsSave: async (s: any) => {
        settings = s;
        return s;
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau 0.3.0' }).click();
  await expect(page.getByRole('heading', { name: 'Mises à jour', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Télécharger', exact: true }).click();
  await expect(
    page.getByRole('progressbar', { name: 'Téléchargement de la mise à jour' }).last(),
  ).toHaveAttribute('value', '50');
  expect(await page.evaluate(() => (window as any).__updates.installed)).toBe(0);
  await page.evaluate(() => (window as any).__updates.finish());
  await expect(
    page.getByRole('button', { name: 'Installer la mise à jour', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Installer la mise à jour', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__updates.installed)).toBe(1);
});
