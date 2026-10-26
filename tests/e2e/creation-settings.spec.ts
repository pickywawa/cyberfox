import { test, expect } from '@playwright/test';

test('creation settings and per-project applications persist across reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Assistance');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Création', exact: true }).click();
  await expect(dialog.getByLabel('Nombre maximal de décisions')).toHaveValue('40');
  await dialog.getByLabel('Nombre maximal de décisions').fill('60');
  await dialog.getByLabel('Durée maximale (minutes, questions comprises)').fill('15');
  await dialog.getByLabel('Instructions complémentaires').fill('Vérifier les erreurs réseau.');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await dialog.getByRole('button', { name: 'Projets', exact: true }).click();
  await dialog.getByLabel('Android · Nom du package').fill('com.example.android');
  await dialog.getByLabel('iOS · Bundle ID').fill('com.example.ios');
  await dialog.getByRole('button', { name: 'Enregistrer l’application du projet' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await dialog.getByRole('button', { name: 'Création', exact: true }).click();
  await expect(dialog.getByLabel('Nombre maximal de décisions')).toHaveValue('60');
  await expect(dialog.getByLabel('Instructions complémentaires')).toHaveValue(
    'Vérifier les erreurs réseau.',
  );
  await dialog.getByRole('button', { name: 'Projets', exact: true }).click();
  await expect(dialog.getByLabel('Android · Nom du package')).toHaveValue('com.example.android');
  await expect(dialog.getByLabel('iOS · Bundle ID')).toHaveValue('com.example.ios');
});
