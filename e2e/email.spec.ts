import { expect, test } from '@playwright/test';

import { cleanupByUserId, seedUser } from './helpers/cleanup';

test.describe('returning user — known email', () => {
  let anonId: string;
  let returningId: string;
  let email: string;

  test.beforeEach(async ({ context }) => {
    email = `e2e-returning-${Date.now()}@test.com`;

    // Seed the returning user row in Supabase
    const seeded = await seedUser(email);
    returningId = seeded.id;

    // Give this browser session a fresh anon identity
    anonId = crypto.randomUUID();
    await context.addCookies([{
      name: 'userId', value: anonId,
      domain: 'localhost', path: '/',
      httpOnly: true, sameSite: 'Lax',
    }]);
  });

  test.afterEach(async () => {
    await cleanupByUserId(anonId);
    await cleanupByUserId(returningId);
  });

  test('cookie switches to the returning user ID', async ({ page, context }) => {
    await page.goto('/quiz-1/1');
    await page.getByPlaceholder('you@somewhere.com').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/quiz-1\/paywall/);

    const cookies = await context.cookies();
    const userId = cookies.find((c) => c.name === 'userId')?.value;
    expect(userId).toBe(returningId);
  });

  test('flow continues to paywall after returning-user email', async ({ page }) => {
    await page.goto('/quiz-1/1');
    await page.getByPlaceholder('you@somewhere.com').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/quiz-1\/paywall/);
    await expect(page.getByRole('heading', { name: 'Begin your practice' })).toBeVisible();
  });
});
