import { test, expect } from '@playwright/test';

test('chat header and microphone dictation preserve existing text and stop on session changes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls = { languages: [] as string[], stopped: 0, aborted: 0 };
    (window as any).speechCalls = calls;
    class Recognition {
      lang = '';
      onresult: any;
      onend: any;
      onerror: any;
      start() {
        calls.languages.push(this.lang);
        (window as any).recognition = this;
      }
      stop() {
        calls.stopped++;
        this.onend?.();
      }
      abort() {
        calls.aborted++;
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Voice QA');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  const header = page.locator('.chat-header');
  await expect(header).toContainText('Génération assistée par IA');
  await expect(header.getByRole('combobox')).toHaveCount(0);
  await expect(header).toHaveCSS('height', '40px');
  await expect(page.locator('.device-header').first()).toHaveCSS('height', '40px');
  await expect(page.locator('.exploration-prompt').getByLabel('Modèle IA du chat')).toHaveCSS(
    'border-top-width',
    '0px',
  );
  await expect(page.locator('.exploration-prompt').getByLabel('Nouvelle session IA')).toHaveCSS(
    'border-top-width',
    '0px',
  );
  const input = page.getByLabel('Demande à l’IA');
  await input.fill('Tester');
  const mic = page.getByRole('button', { name: 'Dicter la demande' });
  await mic.click();
  await expect(page.getByRole('button', { name: 'Arrêter la dictée' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.evaluate(() =>
    (window as any).recognition.onresult({ results: [[{ transcript: 'la connexion' }]] }),
  );
  await expect(input).toHaveValue('Tester la connexion');
  await page.evaluate(() =>
    (window as any).recognition.onresult({
      results: [[{ transcript: 'la connexion' }], [{ transcript: 'avec un compte' }]],
    }),
  );
  await expect(input).toHaveValue('Tester la connexion avec un compte');
  expect(await page.evaluate(() => (window as any).speechCalls.languages)).toEqual(['fr-FR']);
  await page.getByRole('button', { name: 'Arrêter la dictée' }).click();
  await expect(input).toBeEnabled();
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  await mic.click();
  await page.getByRole('button', { name: 'Nouvelle session IA' }).click();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(() => (window as any).speechCalls.aborted)).toBe(1);
  await mic.click();
  await page.evaluate(() => (window as any).recognition.onerror({ error: 'not-allowed' }));
  await expect(page.getByRole('alert').filter({ hasText: 'Accès au microphone' })).toBeVisible();
  await expect(input).toBeEnabled();
});

test('exploration mode is beside model and effort and persists across reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Approval QA');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  const mode = page.locator('.exploration-prompt').getByLabel('Mode d’exploration');
  await expect(mode).toHaveValue('interactive');
  await mode.selectOption('auto-approve');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('cyberfox.preview.v1')!).settings.explorationMode,
      ),
    )
    .toBe('auto-approve');
  await page.reload();
  await expect(mode).toHaveValue('auto-approve');
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Création', exact: true }).click();
  await expect(
    page.getByLabel('Autoriser les demandes de précision en mode interactif'),
  ).toBeChecked();
});

test('prompt controls fit a narrow panel and token details open in a contextual popup', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).last().click();
  await page.getByLabel('Nom du projet').fill('Compact prompt');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('cyberfox.preview.v1')!);
    state.settings.codexModel = 'A model with a very long display name';
    state.projects[0].chatSessions[0].name =
      "tu peux creer un nouveau scénario de connexion rapide à l'application agenda avec le code pin 4444";
    localStorage.setItem('cyberfox.preview.v1', JSON.stringify(state));
  });
  await page.reload();
  const session = page.getByLabel('Session IA', { exact: true });
  const name = await session.locator('option:checked').textContent();
  expect(name!.length).toBeLessThanOrEqual(36);
  expect(name).toContain('Connexion rapide');
  expect(name).not.toContain('4444');
  const prompt = page.locator('.exploration-prompt');
  await prompt.evaluate((element) => {
    element.style.width = '330px';
    element.style.maxWidth = '100%';
  });
  const controls = prompt.locator('.chat-ai-controls');
  expect(await controls.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  const send = page.getByRole('button', { name: 'Envoyer', exact: true });
  const promptRect = await prompt.boundingBox();
  const sendRect = await send.boundingBox();
  expect(sendRect!.x + sendRect!.width).toBeLessThanOrEqual(promptRect!.x + promptRect!.width);
  const tokens = page.getByRole('button', { name: 'Consommation de tokens' });
  await tokens.click();
  const popup = page.getByRole('dialog', { name: 'Consommation de tokens' });
  await expect(popup).toBeVisible();
  await expect(tokens).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(tokens).toHaveAttribute('aria-expanded', 'false');
});
