import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../site/', import.meta.url));
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(
    root,
    '.' + pathname.replace(/^\/cyberfox/, '').replace(/\/$/, '/index.html'),
  );
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    const mime =
      {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.xml': 'application/xml',
      }[path.extname(file)] || 'text/plain';
    response.writeHead(200, { 'Content-Type': mime });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(response.url() + ': ' + response.status());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/cyberfox/`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('h1')).toContainText('Vos tests mobiles.');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('h1')).toContainText('Your mobile tests.');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('tab', { name: 'Screen map', exact: true }).click();
  await expect(page.locator('#gallery-image')).toHaveAttribute(
    'src',
    'assets/screenshots/screen-map.png',
  );
  await page.getByRole('tab', { name: 'Screen map', exact: true }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Creation', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.locator('#gallery-open').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.download-link')).toHaveAttribute(
    'href',
    /v0\.4\.0\/Cyberfox-0\.4\.0-mac-arm64\.dmg$/,
  );
  for (const link of await page
    .locator('a[href^="#"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')).filter((href) => href.length > 1),
    )) {
    await expect(page.locator(link)).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Passer en français' }).click();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
      throw new Error(`Horizontal overflow at ${width}px`);
    await expect(page.locator('.nav-actions a')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `/tmp/cyberfox-site-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
  }
  for (const image of await page
    .locator('img[src]')
    .evaluateAll((images) => images.map((image) => image.src))) {
    const response = await page.request.get(image);
    if (!response.ok()) throw new Error(`Broken image: ${image}`);
  }
  expect(errors).toEqual([]);
  console.log(
    'Website verified: FR/EN, language persistence, gallery keyboard navigation, lightbox, anchors, images, download link and layouts at 320/390/768/1440px.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
