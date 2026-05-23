import { expect, test } from '@playwright/test';

import { cleanupByUserId } from './helpers/cleanup';

test('visiting /{funnelId} redirects to /{funnelId}/0', async ({ page }) => {
  await page.goto('/quiz-1');
  await expect(page).toHaveURL(/\/quiz-1\/0/);
});

test('clicking a row-list answer navigates to the next screen', async ({ page }) => {
  await page.goto('/quiz-1/0');
  await page.getByRole('button', { name: '18–29' }).click();
  // RowList.tsx delays navigation by 240 ms; Playwright retries toHaveURL automatically.
  await expect(page).toHaveURL(/\/quiz-1\/1/);
});

test('progress bar advances after navigating to screen 1', async ({ page }) => {
  await page.goto('/quiz-1/1');
  await expect(page.getByText('2 / 2')).toBeVisible();
});

test('email input is visible on screen 1', async ({ page }) => {
  await page.goto('/quiz-1/1');
  await expect(page.getByPlaceholder('you@somewhere.com')).toBeVisible();
});

test('submitting a valid email navigates to paywall', async ({ page, context }) => {
  const userId = crypto.randomUUID();
  await context.addCookies([{
    name: 'userId', value: userId,
    domain: 'localhost', path: '/',
    httpOnly: true, sameSite: 'Lax',
  }]);
  try {
    await page.goto('/quiz-1/1');
    await page.getByPlaceholder('you@somewhere.com').fill(`e2e-nav-${userId}@test.com`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/quiz-1\/paywall/);
  } finally {
    await cleanupByUserId(userId);
  }
});

test('paywall page renders heading and pricing choices', async ({ page }) => {
  await page.goto('/quiz-1/paywall');
  await expect(page.getByRole('heading', { name: 'Begin your practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Standard Plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Premium Plan' })).toBeVisible();
});
