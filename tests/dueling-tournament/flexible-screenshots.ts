import { chromium, expect, type Page } from '@playwright/test';
import { isAbsolute, join } from 'node:path';

async function main() {
  const output = process.env.DUELING_SCREENSHOT_DIRECTORY;
  if (!output || !isAbsolute(output))
    throw new Error('Set an explicit absolute screenshot directory.');
  const root = 'http://127.0.0.1:56501';
  const browser = await chromium.launch({ headless: true });
  const admin = await browser.newPage({
    viewport: { width: 1000, height: 800 },
    reducedMotion: 'reduce',
  });
  const viewer = await browser.newPage({
    viewport: { width: 1000, height: 800 },
    reducedMotion: 'reduce',
  });
  const restrict = async (page: Page) =>
    page.route('**/*', (route) =>
      ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
        ? route.continue()
        : route.abort(),
    );
  await restrict(admin);
  await restrict(viewer);
  try {
    const reset = await admin.request.post('http://127.0.0.1:56500/__test/reset', {
      headers: { 'X-Local-Test': 'dueling-local-only' },
    });
    expect(reset.ok()).toBe(true);
    await admin.goto(`${root}/auth/login?next=${encodeURIComponent('/admin/dueling-tournament')}`);
    await admin.locator('#email').fill('director@local.invalid');
    await admin.locator('#password').fill('LocalOnlyTest123!');
    await admin.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(admin).toHaveURL(`${root}/admin/dueling-tournament`);
    for (const count of [24, 32]) {
      await admin.goto(`${root}/admin/dueling-tournament/local-seeding-${count}/seeding`);
      await admin.getByRole('button', { name: 'Lock roster and generate draw' }).click();
      await admin.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
      const reveal = admin.getByRole('button', { name: 'Reveal seeds to everyone' });
      await expect(reveal).toBeEnabled({ timeout: 15000 });
      await reveal.click();
      await expect(admin.getByRole('button', { name: 'Verify this draw' })).toBeVisible();
      await admin.getByRole('button', { name: 'Publish tournament bracket' }).click();
      await admin.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(admin.getByRole('button', { name: 'Publish tournament bracket' })).toHaveCount(
        0,
      );
      for (const width of [1000, 390]) {
        await viewer.setViewportSize({ width, height: 844 });
        for (const [name, route] of [
          ['Public', `local-registration-${count}`],
          ['Bracket', `local-arena-${count}?tab=bracket`],
          ['Seeds', `local-seeding-${count}/seeding`],
        ]) {
          await viewer.goto(`${root}/dueling-tournament/${route}`);
          if (name === 'Seeds')
            await expect(viewer.locator('.dt-draw-tile.is-revealed')).toHaveCount(count);
          else if (name === 'Bracket') await expect(viewer.locator('.dt-match')).toHaveCount(63);
          else await expect(viewer.getByTestId('predraw-skeleton')).toBeVisible();
          await viewer.evaluate(() => document.fonts.ready);
          expect(
            await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          const file = join(output, `Sep 23 Dueling ${count} Players ${name} ${width}.png`);
          await viewer.screenshot({ path: file, fullPage: true });
          console.log(file);
        }
      }
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local screenshot capture failed.');
  process.exitCode = 1;
});
