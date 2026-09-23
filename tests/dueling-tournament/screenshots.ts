import { chromium, expect } from '@playwright/test';
import { isAbsolute } from 'node:path';

async function main() {
  const output = process.env.DUELING_SCREENSHOT_DIRECTORY;
  if (!output || !isAbsolute(output))
    throw new Error('Set DUELING_SCREENSHOT_DIRECTORY to an explicit absolute output directory.');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
    reducedMotion: 'reduce',
  });
  const root = 'http://127.0.0.1:56501';
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await page.request.post('http://127.0.0.1:56500/__test/reset', {
    headers: { 'X-Local-Test': 'dueling-local-only' },
  });
  async function capture(name: string) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/Sep 22 Dueling ${name}.png`, fullPage: true });
    console.log(`Saved Sep 22 Dueling ${name}.png`);
  }
  try {
    await page.goto(`${root}/dueling-tournament/local-registration`);
    await expect(page.getByRole('heading', { name: 'Open Local Championship' })).toBeVisible();
    await capture('Registration 1000');
    await page.goto(`${root}/dueling-tournament/local-arena?tab=bracket`);
    await expect(page.locator('.dt-match').first()).toBeVisible();
    await capture('Bracket 1000');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${root}/dueling-tournament/local-registration`);
    await expect(page.getByRole('heading', { name: 'Open Local Championship' })).toBeVisible();
    await capture('Registration 390');
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto(
      `${root}/auth/login?next=${encodeURIComponent('/admin/dueling-tournament/local-arena?tab=matches&match=U1')}`,
    );
    await page.locator('#email').fill('director@local.invalid');
    await page.locator('#password').fill('LocalOnlyTest123!');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start match', exact: true })).toBeVisible();
    await capture('Admin Match Desk 1000');
    await page.getByRole('button', { name: 'Hold match', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Reason (required)')
      .fill('Both players absent, awaiting admin decision');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Admin absence ruling' })).toBeVisible();
    await capture('Admin Absence Ruling 1000');
    await page.getByRole('button', { name: 'Return match to play', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Reason (required)')
      .fill('Local review fixture restored for hands-on testing');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.goto(`${root}/admin/dueling-tournament/local-seeding/seeding`);
    await page.getByRole('button', { name: 'Lock roster and generate draw' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    const reveal = page.getByRole('button', { name: 'Reveal seeds to everyone' });
    await expect(reveal).toBeEnabled({ timeout: 15000 });
    await reveal.click();
    await expect(page.getByRole('button', { name: 'Verify this draw' })).toBeVisible();
    await capture('Seed Generator 1000');
    await page.goto(`${root}/dueling-tournament/local-seeding/seeding`);
    await expect(page.getByRole('button', { name: 'Verify this draw' })).toBeVisible();
    await page.getByRole('button', { name: 'Verify this draw' }).click();
    await expect(
      page.getByText(
        'Verified: commitment and seed order match. No published bracket was checked.',
      ),
    ).toBeVisible();
    await capture('Public Seed Reveal 1000');
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Screenshot capture failed.');
  process.exit(1);
});
