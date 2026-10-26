import { test, expect } from '@playwright/test';

test('create and edit project launch applications and display platform icons', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Application ouverte', exact: true })).toHaveCount(
    2,
  );
  await expect(
    page.getByRole('button', { name: 'Parcourir les applications', exact: true }),
  ).toHaveCount(2);
  await expect(page.getByLabel('Appareil source · Android')).toBeVisible();
  await expect(page.getByLabel('Appareil source · iOS')).toBeVisible();
  await page.getByLabel('Nom du projet').fill('Configured app');
  await page.getByLabel('Android · Nom du package').fill('com.example.android');
  await page.getByLabel('Nom de l’application · Android').fill('Example Android');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await expect(
    page.locator('.project-app-summary').filter({ hasText: 'Example Android' }),
  ).toBeVisible();
  await expect(page.locator('.project-app-summary > svg')).toHaveCount(2);
  await page.locator('.preview-file-menu summary').click();
  await page.getByRole('button', { name: 'Modifier le projet courant…' }).click();
  await page.getByLabel('Nom du projet').fill('Renamed app');
  await page.getByLabel('iOS · Bundle ID').fill('com.example.ios');
  await page.getByLabel('Nom de l’application · iOS').fill('Example iOS');
  await page.getByRole('button', { name: 'Enregistrer le projet', exact: true }).click();
  await page.reload();
  await expect(page.locator('#project-select')).toContainText('Renamed app');
  await expect(
    page.locator('.project-app-summary').filter({ hasText: 'Example Android' }),
  ).toBeVisible();
  await page.locator('.preview-file-menu summary').click();
  await page.getByRole('button', { name: 'Modifier le projet courant…' }).click();
  await expect(page.getByLabel('iOS · Bundle ID')).toHaveValue('com.example.ios');
  await expect(page.getByLabel('Android · Nom du package')).toHaveValue('com.example.android');
});

test('project summary keeps long iOS and Android app names inside the sidebar', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Agenda Pro');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  for (const platforms of [['ios'], ['ios', 'android']]) {
    await page.evaluate((platforms) => {
      const state = JSON.parse(localStorage.getItem('cyberfox.preview.v1')!);
      const project = state.projects[0];
      project.platforms = platforms;
      project.applications = { ios: 'com.agenda.ios', android: 'com.agenda.android' };
      project.applicationDetails = {
        ios: {
          id: 'com.agenda.ios',
          name: 'Agenda maincare snapshot avec un nom particulièrement long',
        },
        android: {
          id: 'com.agenda.android',
          name: 'Agenda Android avec un autre nom particulièrement long',
        },
      };
      localStorage.setItem('cyberfox.preview.v1', JSON.stringify(state));
    }, platforms);
    await page.reload();
    const rows = page.locator('.project-app-summary');
    await expect(rows).toHaveCount(1);
    await expect(rows.locator('> svg')).toHaveCount(platforms.length);
    await expect(rows).toHaveCSS('border-top-width', '0px');
    for (const row of await rows.all()) {
      const name = row.locator('.project-app-name');
      await expect(name).toHaveCSS('text-overflow', 'ellipsis');
      expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
        true,
      );
      expect((await row.boundingBox())!.height).toBeLessThanOrEqual(20);
    }
    expect(
      await page
        .locator('.project-picker')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
  }
});
