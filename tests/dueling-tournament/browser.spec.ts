import { test, expect, type Page } from '@playwright/test';
import { tournamentViewSchema } from '../../src/lib/dueling-tournament/wire';

const runtimeErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], 'No uncaught browser exceptions').toEqual([]);
});

test.beforeEach(async ({ page, request }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  const reset = await request.post('http://127.0.0.1:56500/__test/reset', {
    headers: { 'X-Local-Test': 'dueling-local-only' },
  });
  expect(reset.ok()).toBe(true);
  // Browser rehearsal never sends account data or traffic to a production host.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
});

async function login(page: Page, email: string, next: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
  await page.locator('#email').fill(`${email}@local.invalid`);
  await page.locator('#password').fill('LocalOnlyTest123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
}

test('existing account returns to the event, accepts rules, registers once, and withdraws', async ({
  page,
  request,
}) => {
  await page.goto('/dueling-tournament/local-registration');
  await page.getByRole('link', { name: /Sign in to register/ }).click();
  await page.locator('#email').fill('newplayer@local.invalid');
  await page.locator('#password').fill('LocalOnlyTest123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dueling-tournament\/local-registration$/);
  await page.getByRole('checkbox', { name: /read and accept/ }).check();
  await page.getByRole('button', { name: 'Register for tournament', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('NewPlayer');
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('registered');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('registered');
  let view = tournamentViewSchema.parse(
    (await (await request.get('/api/ctf/dueling-tournaments/local-registration')).json()).event,
  );
  expect(view.entries.filter((entry) => entry.alias === 'NewPlayer')).toHaveLength(1);
  expect(view.me).toBeNull();
  expect(view.staff).toBeNull();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Another player may take it');
    expect(dialog.message()).toContain('five minutes');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('withdrawn');
  await expect(
    page.getByRole('button', { name: 'Register for tournament', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText(
    'wait five minutes',
  );
  view = tournamentViewSchema.parse(
    (await (await request.get('/api/ctf/dueling-tournaments/local-registration')).json()).event,
  );
  expect(view.entries.find((entry) => entry.alias === 'NewPlayer')?.status).toBe('withdrawn');
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Withdrawal and rejoining' })).toBeVisible();
  await expect(page.getByText(/A withdrawal during the last five minutes/)).toBeVisible();
});

test('check-in persists and player accounts cannot operate admin controls', async ({ page }) => {
  await login(page, 'vega', '/dueling-tournament/local-check-in');
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('checked in');
  await page.goto('/admin/dueling-tournament/local-check-in');
  await expect(
    page.getByRole('alert').filter({ hasText: 'does not have staff access' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish event' })).toHaveCount(0);
});

test('director generates and reveals a verifiable draw, then publishes the bracket', async ({
  page,
  request,
}) => {
  await login(page, 'director', '/admin/dueling-tournament/local-seeding/seeding');
  await page.getByRole('button', { name: 'Lock roster and generate draw' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByTestId('draw-commitment')).toHaveText(/^[a-f0-9]{64}$/);
  const committed = (await (await request.get('/api/ctf/dueling-tournaments/local-seeding')).json())
    .event;
  expect(committed.draws[0].randomSeed).toBeNull();
  expect(committed.draws[0].order).toEqual([]);
  const reveal = page.getByRole('button', { name: 'Reveal seeds to everyone' });
  await expect(reveal).toBeEnabled();
  await reveal.click();
  await expect(page.getByRole('button', { name: 'Verify this draw' })).toBeVisible();
  await page.getByRole('button', { name: 'Verify this draw' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Verified:' })).toHaveText(
    'Verified: commitment and seed order match. No published bracket was checked.',
  );
  await page.getByRole('button', { name: 'Publish tournament bracket' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish tournament bracket' })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Verified:' })).toHaveCount(0);
  const event = tournamentViewSchema.parse(
    (await (await request.get('/api/ctf/dueling-tournaments/local-seeding')).json()).event,
  );
  expect(event.phase).toBe('bracket');
  expect(event.seedOrder).toHaveLength(16);
  expect(new Set(event.seedOrder).size).toBe(16);
  expect(event.fixtures).toHaveLength(31);
  await page.goto('/dueling-tournament/local-seeding/seeding');
  await expect(page.getByRole('button', { name: 'Verify this draw' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Void draw with public reason' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Verify this draw' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Verified:' })).toHaveText(
    'Verified: commitment, seed order, and published bracket match.',
  );
});

test('match desk starts, holds, releases and records a BO5 result once', async ({
  page,
  request,
}) => {
  await login(page, 'referee', '/admin/dueling-tournament/local-arena?tab=matches&match=U1');
  await expect(page.getByText('Top-left corner', { exact: true })).toBeVisible();
  await expect(page.getByText('Bottom-right corner', { exact: true })).toBeVisible();
  await expect(page.getByText(/All players must use the DUELER class/)).toBeVisible();
  await expect(page.getByText(/Players must report to the referee within 2 minutes/)).toBeVisible();
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.getByText('in progress', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hold match', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reason (required)').fill('Local disconnect rehearsal');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Match held: Local disconnect rehearsal')).toBeVisible();
  await page.getByRole('button', { name: 'Release hold' }).click();
  await page.getByRole('dialog').getByLabel('Reason (required)').fill('Both players have returned');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: '3–1', exact: true }).click();
  await page.getByRole('button', { name: 'Review result', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('3–1');
  await page.getByRole('dialog').getByRole('button', { name: 'Save official result' }).click();
  await expect(
    page.getByText('U1 result saved. The next available match is selected.'),
  ).toBeVisible();
  await expect(page.getByLabel('Choose match')).not.toHaveValue('U1');
  const event = tournamentViewSchema.parse(
    (await (await request.get('/api/ctf/dueling-tournaments/local-arena')).json()).event,
  );
  expect(event.fixtures.find((match) => match.id === 'U1')?.result?.scoreA).toBe(3);
  expect(event.fixtures.find((match) => match.id === 'U1')?.result?.scoreB).toBe(1);
  expect(event.revision).toBe(4);
  await page.goto('/dueling-tournament/local-arena/matches/U1');
  await expect(page.locator('.dt-versus > div').nth(0)).toContainText('Top-left corner');
  await expect(page.locator('.dt-versus > div').nth(1)).toContainText('Bottom-right corner');
  await expect(page.getByText(/All players must use the DUELER class/)).toBeVisible();
});

test('public bracket and showcase fit laptop and mobile widths; personal responses are private', async ({
  page,
  request,
}) => {
  for (const width of [1000, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/dueling-tournament/local-arena?tab=bracket');
    await expect(page.getByRole('heading', { name: /Arena Local Championship/ })).toBeVisible();
    await expect(page.locator('.dt-match').first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.goto('/dueling-tournament/local-seeding/seeding');
    await expect(page.getByTestId('seed-showcase')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  const response = await request.get('/api/ctf/dueling-tournaments/local-arena');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['cache-control']).toContain('private');
  expect(response.headers()['access-control-allow-origin']).not.toBe('*');
});

test('director creates a private event, publishes rules, then exposes it and exports the roster', async ({
  page,
  request,
}) => {
  await login(page, 'director', '/admin/dueling-tournament');
  await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
  await page.getByLabel('Event title', { exact: true }).fill('October Rehearsal');
  await page.getByLabel('URL name', { exact: true }).fill('local-new-event');
  await page.getByRole('button', { name: 'Create private draft' }).click();
  await expect(page.getByRole('heading', { name: 'October Rehearsal', exact: true })).toBeVisible();
  expect((await request.get('/api/ctf/dueling-tournaments/local-new-event')).status()).toBe(404);
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  const rules = page.getByLabel('Tournament rules', { exact: true });
  await expect(rules).toHaveValue(/DUELER/);
  await expect(rules).toHaveValue(/within 2 minutes/);
  await expect(rules).toHaveValue(/top-left corner/);
  await rules.fill(`${await rules.inputValue()}\n## Event note\nFollow the referee in the arena.`);
  await page.getByRole('button', { name: 'Save draft rules', exact: true }).click();
  await expect(page.getByText('Rulebook saved.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(rules).toHaveValue(/Follow the referee in the arena\./);
  await page
    .getByRole('checkbox', { name: 'Publish this rulebook for players to read and accept.' })
    .check();
  await page.getByRole('button', { name: 'Publish rules', exact: true }).click();
  await expect(page.getByText('Rulebook saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Publish event', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish event', exact: true })).toHaveCount(0);
  const event = tournamentViewSchema.parse(
    (await (await request.get('/api/ctf/dueling-tournaments/local-new-event')).json()).event,
  );
  expect(event.published).toBe(true);
  expect(event.rules.publishedAt).not.toBeNull();
  expect(event.rules.text).toContain('DUELER');
  expect(event.rules.text).toContain('within 2 minutes');
  await page.getByRole('button', { name: 'Exports', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Players CSV' }).click();
  expect((await download).suggestedFilename()).toBe('local-new-event-players.csv');
  await page.goto('/dueling-tournament/local-new-event?tab=rules');
  await expect(page.getByText(/All players must use the DUELER class/)).toBeVisible();
  await expect(page.getByText(/Players must report to the referee within 2 minutes/)).toBeVisible();
});

test('waitlist promotion follows withdrawal and shows the correct account its notice', async ({
  page,
}) => {
  const register = async () => {
    await page.getByRole('checkbox', { name: /read and accept/ }).check();
    await page.getByRole('button', { name: 'Register for tournament', exact: true }).click();
  };
  await login(page, 'jett', '/dueling-tournament/local-registration');
  await register();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('registered');
  await login(page, 'newplayer', '/dueling-tournament/local-registration');
  await register();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('waitlisted');
  await login(page, 'jett', '/dueling-tournament/local-registration');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('withdrawn');
  await login(page, 'director', '/admin/dueling-tournament/local-registration?tab=players');
  const player = page.getByRole('row').filter({ hasText: 'NewPlayer' });
  await player.getByRole('button', { name: 'Promote', exact: true }).click();
  await expect(player).toContainText('registered');
  await login(page, 'newplayer', '/dueling-tournament/local-registration?tab=notices');
  await expect(
    page.getByText(
      'You have been promoted from the waiting list. Your place is confirmed; check in before the deadline.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('callback and profile completion preserve the event destination', async ({ page }) => {
  await login(page, 'incomplete', '/dueling-tournament/local-registration');
  await expect(page.getByRole('link', { name: 'Complete your Freeinf profile' })).toBeVisible();
  await page.goto('/auth/callback?next=%2Fdueling-tournament%2Flocal-registration');
  await expect(page).toHaveURL(/\/auth\/complete-profile\?next=/);
  await page.locator('#alias').fill('Aster');
  await page.getByRole('button', { name: 'Complete Setup', exact: true }).click();
  await expect(page).toHaveURL(/\/dueling-tournament\/local-registration$/);
  await page.getByRole('checkbox', { name: /read and accept/ }).check();
  await page.getByRole('button', { name: 'Register for tournament', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('Aster');
});

test('a voided seed draw remains visible with its public reason', async ({ page, request }) => {
  await login(page, 'director', '/admin/dueling-tournament/local-seeding/seeding');
  await page.getByRole('button', { name: 'Lock roster and generate draw' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByTestId('draw-commitment')).toHaveText(/^[a-f0-9]{64}$/);
  await page.getByRole('button', { name: 'Void draw with public reason' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Reason (required)')
    .fill('Rehearsal: roster correction before publication');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Draw history', exact: true })).toBeVisible();
  const event = tournamentViewSchema.parse(
    (await (await request.get('/api/ctf/dueling-tournaments/local-seeding')).json()).event,
  );
  expect(event.draws).toHaveLength(1);
  expect(event.draws[0].voidReason).toContain('roster correction');
  expect(event.seedOrder).toEqual([]);
});

test('ordinary login discards an abandoned tournament return destination', async ({ page }) => {
  await page.goto('/auth/login');
  await page.evaluate(() =>
    sessionStorage.setItem(
      'freeinf:tournament-return',
      JSON.stringify({ path: '/dueling-tournament/local-arena', at: Date.now() }),
    ),
  );
  await page.reload();
  await page.locator('#email').fill('newplayer@local.invalid');
  await page.locator('#password').fill('LocalOnlyTest123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:56501/');
});

test('a stale referee submission refreshes current state while retaining the entered score', async ({
  page,
}) => {
  await login(page, 'referee', '/admin/dueling-tournament/local-arena?tab=matches&match=U1');
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.getByText('in progress', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '3–1', exact: true }).click();
  let conflict = true;
  await page.route('**/api/ctf/dueling-tournaments/local-arena', async (route) => {
    if (route.request().method() === 'POST' && conflict) {
      conflict = false;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The tournament changed.', code: 'revision_conflict' }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Review result', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save official result' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'latest state is loaded' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('3–1');
  await page.getByRole('dialog').getByRole('button', { name: 'Save official result' }).click();
  await expect(
    page.getByText('U1 result saved. The next available match is selected.'),
  ).toBeVisible();
});

test('reads work past the former request limit while invalid sessions remain rejected', async ({
  request,
}) => {
  const signIn = await request.post('http://127.0.0.1:56500/auth/v1/token?grant_type=password', {
    data: { email: 'director@local.invalid', password: 'LocalOnlyTest123!' },
  });
  expect(signIn.ok()).toBe(true);
  const session = await signIn.json();
  const readers: Record<string, string>[] = [
    {},
    { authorization: `Bearer ${session.access_token}` },
  ];
  for (const headers of readers) {
    for (let i = 0; i < 241; i++) {
      const response = await request.get('/api/ctf/dueling-tournaments', { headers });
      expect(response.status()).toBe(200);
      expect((await response.json()).events.length).toBeGreaterThan(0);
    }
  }
  expect(
    (
      await request.get('/api/ctf/dueling-tournaments/access', {
        headers: { authorization: 'Bearer another-junk-token-with-no-valid-identity' },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get('/api/ctf/dueling-tournaments/local-arena/export')).status()).toBe(401);
});

test('a legacy false flag cannot hide links or block event data and director actions', async ({
  page,
  request,
}) => {
  const origin = 'http://127.0.0.1:56502';
  const api = `${origin}/api/ctf/dueling-tournaments`;
  expect(await (await request.get(`${api}/status`)).json()).toEqual({ enabled: true });
  await page.goto(`${origin}/dueling`);
  await expect(page.locator('a[href="/dueling-tournament"]').first()).toBeVisible();
  const list = await request.get(api);
  expect(list.status()).toBe(200);
  expect((await list.json()).events.length).toBeGreaterThan(0);
  const detail = await request.get(`${api}/local-arena`);
  expect(detail.status()).toBe(200);
  const event = (await detail.json()).event;
  const signIn = await request.post('http://127.0.0.1:56500/auth/v1/token?grant_type=password', {
    data: { email: 'director@local.invalid', password: 'LocalOnlyTest123!' },
  });
  expect(signIn.ok()).toBe(true);
  const session = await signIn.json();
  const headers = { authorization: `Bearer ${session.access_token}`, origin };
  const access = await request.get(`${api}/access`, { headers });
  expect(access.status()).toBe(200);
  expect((await access.json()).director).toBe(true);
  const saved = await request.post(`${api}/local-arena`, {
    headers,
    data: {
      operationId: crypto.randomUUID(),
      expectedRevision: event.revision,
      command: { type: 'announcement', body: 'Legacy flag cannot block the director.' },
    },
  });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).event.revision).toBe(event.revision + 1);
});

test('public history masks committed seeds, and personal notices do not change the event revision', async ({
  page,
  request,
}) => {
  await login(page, 'director', '/admin/dueling-tournament/local-seeding/seeding');
  await page.getByRole('button', { name: 'Lock roster and generate draw' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByTestId('draw-commitment')).toHaveText(/^[a-f0-9]{64}$/);
  const archive = await request.get(
    '/api/ctf/dueling-tournaments/local-seeding/history?kind=draws',
  );
  const rows = (await archive.json()).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].item.randomSeed).toBeNull();
  expect(rows[0].item.order).toEqual([]);
  expect(
    (await request.get('/api/ctf/dueling-tournaments/local-seeding/history?kind=audit')).status(),
  ).toBe(403);
  await login(page, 'newplayer', '/dueling-tournament/local-registration');
  await page.getByRole('checkbox', { name: /read and accept/ }).check();
  await page.getByRole('button', { name: 'Register for tournament', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your tournament' })).toContainText('registered');
  const before = (
    await (await request.get('/api/ctf/dueling-tournaments/local-registration')).json()
  ).event.revision;
  await page.getByRole('button', { name: 'Notices', exact: true }).click();
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark read', exact: true })).toHaveCount(0);
  expect(
    (await (await request.get('/api/ctf/dueling-tournaments/local-registration')).json()).event
      .revision,
  ).toBe(before);
  await page.getByText('Browse complete notices', { exact: true }).click();
  const section = page
    .locator('details')
    .filter({ has: page.getByText('Browse complete notices', { exact: true }) });
  await section.getByRole('button', { name: 'Load complete history', exact: true }).click();
  await expect(section).toContainText('Your tournament place is confirmed.');
});

test('stale disabled storage cannot hide links and navigation makes no status requests', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/dueling-tournaments/status')) requests++;
  });
  await page.addInitScript(() =>
    sessionStorage.setItem('freeinf:tournament-visibility:v1', 'false'),
  );
  await page.clock.install();
  await page.goto('/dueling');
  await expect(page.locator('a[href="/dueling-tournament"]').first()).toBeVisible();
  await page.clock.fastForward(125000);
  await page.goto('/dueling?review=visibility');
  await expect(page.locator('a[href="/dueling-tournament"]').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('a[href="/dueling-tournament"]').first()).toBeVisible();
  for (const width of [390, 1000, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/dueling?viewport=${width}`);
    if (width < 1280) {
      await page
        .locator('nav button')
        .filter({ has: page.locator('svg.lucide-menu') })
        .click();
      await page.getByRole('button', { name: 'Stats', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Stats', exact: true }).hover();
    }
    await expect(
      page
        .getByRole('button', { name: 'Stats', exact: true })
        .locator('..')
        .getByRole('link', { name: 'Tournaments', exact: true }),
    ).toBeVisible();
  }
  expect(requests).toBe(0);
});

test('admin resolves both-player absence and can reverse a mistaken availability ruling', async ({
  page,
  request,
}) => {
  await login(page, 'director', '/admin/dueling-tournament/local-arena?tab=matches&match=U1');
  await page.getByRole('button', { name: 'Hold match', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reason (required)').fill('Both players absent');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Remove both players', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Reason (required)')
    .fill('Admin ruling after waiting for both players');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('Choose match')).not.toHaveValue('U1');
  const before = (await (await request.get('/api/ctf/dueling-tournaments/local-arena')).json())
    .event;
  expect(before.fixtures.find((match: { id: string }) => match.id === 'U1').result.kind).toBe(
    'double_forfeit',
  );
  await page.getByRole('button', { name: 'Players', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Mako' });
  await row.getByRole('button', { name: 'DQ', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reason (required)').fill('Mistaken identity test');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await row.getByRole('button', { name: 'Restore availability', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Reason (required)')
    .fill('Reviewed correct player and reversed');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(row).toContainText('checked in');
  const after = (await (await request.get('/api/ctf/dueling-tournaments/local-arena')).json())
    .event;
  expect(after.fixtures).toEqual(before.fixtures);
});

test('completed no-champion results display retained lower-bracket standings', async ({ page }) => {
  const { testTournament, testDirector } = await import('../../src/lib/dueling-tournament/testing');
  const { applyMutation } = await import('../../src/lib/dueling-tournament/transition');
  const { resolveBracket } = await import('../../src/lib/dueling-tournament/bracket');
  const { tournamentView } = await import('../../src/lib/dueling-tournament/view');
  let event = testTournament();
  event.settings.doubleForfeitPolicy = 'eliminate_both';
  const now = '2026-10-04T00:00:00Z';
  for (let i = 0; i < 31; i++) {
    const match = resolveBracket(event.fixtures, event.seedOrder).find(
      (item) => item.state === 'ready',
    );
    if (!match) throw new Error('Missing match');
    const winner = match.slots[0];
    if (winner.state !== 'player') throw new Error('Missing opponent');
    const final = match.id === 'GF1';
    event = (
      await applyMutation(
        event,
        {
          operationId: crypto.randomUUID(),
          expectedRevision: event.revision,
          command: {
            type: 'result',
            matchId: match.id,
            kind: final ? 'double_forfeit' : 'forfeit',
            winnerId: final ? null : winner.entryId,
            scoreA: null,
            scoreB: null,
            reason: 'Local display fixture',
          },
        },
        testDirector,
        now,
      )
    ).tournament;
    if (final) break;
  }
  event = (
    await applyMutation(
      event,
      {
        operationId: crypto.randomUUID(),
        expectedRevision: event.revision,
        command: { type: 'finish_without_champion', reason: 'No eligible finalists remain' },
      },
      testDirector,
      now,
    )
  ).tournament;
  const view = tournamentView(event, null, now);
  await page.route('**/api/ctf/dueling-tournaments/local-final-results', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ event: view }),
    }),
  );
  await page.goto('/dueling-tournament/local-final-results');
  await expect(page.getByRole('heading', { name: 'Title not awarded', exact: true })).toBeVisible();
  const third = view.placements.find((row) => row.place === 3);
  expect(third).toBeDefined();
  await expect(page.getByRole('row').filter({ hasText: third!.alias })).toContainText('3');
});

for (const count of [24, 32]) {
  test(`${count}-player public page, bracket and complete draw fit laptop and mobile`, async ({
    page,
    request,
  }) => {
    // Reveal through the real admin path and verify the same published field publicly.
    await login(page, 'director', `/admin/dueling-tournament/local-seeding-${count}/seeding`);
    await page.getByRole('button', { name: 'Lock roster and generate draw' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByTestId('draw-commitment')).toHaveText(/^[a-f0-9]{64}$/);
    const reveal = page.getByRole('button', { name: 'Reveal seeds to everyone' });
    await expect(reveal).toBeEnabled();
    await reveal.click();
    await expect(page.getByRole('button', { name: 'Verify this draw' })).toBeVisible();
    await page.getByRole('button', { name: 'Publish tournament bracket' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Publish tournament bracket' })).toHaveCount(0);
    const event = tournamentViewSchema.parse(
      (await (await request.get(`/api/ctf/dueling-tournaments/local-seeding-${count}`)).json())
        .event,
    );
    expect(event.bracketSize).toBe(32);
    expect(event.fixtures).toHaveLength(63);
    expect(event.seedOrder).toHaveLength(count);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [1000, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of [
        `local-registration-${count}`,
        `local-arena-${count}`,
        `local-arena-${count}?tab=bracket`,
        `local-seeding-${count}/seeding`,
      ]) {
        await page.goto(`/dueling-tournament/${route}`);
        if (route.endsWith('/seeding')) {
          await expect(page.getByTestId('seed-showcase')).toBeVisible();
          await expect(page.locator('.dt-draw-tile.is-revealed')).toHaveCount(count);
          await expect(page.getByText('32 bracket slots', { exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Verify this draw' }).click();
          await expect(page.getByRole('status').filter({ hasText: 'Verified:' })).toContainText(
            'published bracket',
          );
        } else if (route.includes('?tab=bracket')) {
          await expect(page.locator('.dt-match')).toHaveCount(63);
        } else {
          await expect(
            page.getByRole('heading', { name: /Local Championship/ }).first(),
          ).toBeVisible();
          if (route.startsWith('local-registration')) {
            await expect(page.getByTestId('predraw-skeleton')).toHaveAttribute('data-size', '32');
            await expect(page.getByTestId('predraw-skeleton').locator('text')).toHaveCount(16);
            await expect(page.locator('.dt-tiles > *')).toHaveCount(count);
          }
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
    }
  });
}

test('admin capacity accepts 4 through 32 and updates the one-arena workload estimate', async ({
  page,
}) => {
  await login(page, 'director', '/admin/dueling-tournament');
  await page.getByRole('button', { name: 'Create tournament', exact: true }).click();
  const capacity = page.getByRole('spinbutton', { name: /^Player capacity/ });
  await expect(capacity).toHaveAttribute('min', '4');
  await expect(capacity).toHaveAttribute('max', '32');
  await capacity.fill('32');
  await page
    .getByRole('spinbutton', { name: 'Estimated changeover (minutes)', exact: true })
    .fill('2');
  await expect(page.getByTestId('capacity-workload')).toContainText('5h 14m');
  await capacity.fill('24');
  await expect(page.getByTestId('capacity-workload')).toContainText('4h 2m');
  await capacity.fill('4');
  await expect(page.getByTestId('capacity-workload')).toContainText('1h 2m');
});

test('cancelled rehearsal disappears publicly and retains its admin audit history', async ({
  page,
  request,
}) => {
  await login(page, 'director', '/admin/dueling-tournament/local-arena');
  await page.getByRole('button', { name: 'Cancel event', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Reason (required)').fill('Preview rehearsal finished');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('cancelled', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Event cancelled.' })).toContainText(
    'Preview rehearsal finished',
  );
  await expect(page.getByRole('button', { name: 'Publish event', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('cancelled', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('Preview rehearsal finished', { exact: true })).toBeVisible();
  expect((await request.get('/api/ctf/dueling-tournaments/local-arena')).status()).toBe(404);
  const list = await (await request.get('/api/ctf/dueling-tournaments')).json();
  expect(list.events.some((event: { id: string }) => event.id === 'local-arena')).toBe(false);
});

test('retired tournament endpoints are no longer served', async ({ request }) => {
  expect((await request.get('/api/dueling/tournaments')).status()).toBe(404);
  expect((await request.get('/api/dueling/tournaments/legacy-event')).status()).toBe(404);
});
