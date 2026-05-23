import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { cleanupByUserId } from './helpers/cleanup';

// Module-level singleton — env vars are fixed for the entire test run.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Used by UTM tests below.
function getParam(url: string, key: string): string | null {
  return new URL(url).searchParams.get(key);
}

test.describe('basic tracking', () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = crypto.randomUUID();
    await context.addCookies([{
      name: 'userId', value: userId,
      domain: 'localhost', path: '/',
      httpOnly: true, sameSite: 'Lax',
    }]);
  });

  test.afterEach(async () => {
    await cleanupByUserId(userId);
  });

  test('first visit creates a users row', async ({ page }) => {
    await page.goto('/quiz-1/0');
    const { data } = await supabase.from('users').select('id').eq('id', userId);
    expect(data).toHaveLength(1);
  });

  test('visiting screen 0 inserts a page_view event with question_id="0"', async ({ page }) => {
    await page.goto('/quiz-1/0');
    const { data } = await supabase
      .from('events')
      .select('name, funnel_id, question_id')
      .eq('user_id', userId)
      .eq('question_id', '0');
    expect(data).toHaveLength(1);
    expect(data![0].name).toBe('page_view');
    expect(data![0].funnel_id).toBe('quiz-1');
  });

  test('visiting screen 1 inserts a page_view event with question_id="1"', async ({ page }) => {
    await page.goto('/quiz-1/1');
    const { data } = await supabase
      .from('events')
      .select('question_id')
      .eq('user_id', userId)
      .eq('question_id', '1');
    expect(data).toHaveLength(1);
  });

  test('visiting paywall inserts a page_view event with question_id="paywall"', async ({ page }) => {
    await page.goto('/quiz-1/paywall');
    const { data } = await supabase
      .from('events')
      .select('question_id')
      .eq('user_id', userId)
      .eq('question_id', 'paywall');
    expect(data).toHaveLength(1);
  });

  test('submitting email updates users.email', async ({ page }) => {
    const email = `e2e-tracking-${userId}@test.com`;
    await page.goto('/quiz-1/1');
    await page.getByPlaceholder('you@somewhere.com').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/quiz-1\/paywall/);

    const { data } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();
    expect(data!.email).toBe(email);
  });
});

test.describe('UTM — Scenario 1: google-sourced visit', () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = crypto.randomUUID();
    await context.addCookies([{
      name: 'userId', value: userId,
      domain: 'localhost', path: '/',
      httpOnly: true, sameSite: 'Lax',
    }]);
  });

  test.afterEach(async () => {
    await cleanupByUserId(userId);
  });

  test('landing redirect preserves utm_source=google', async ({ page }) => {
    await page.goto('/quiz-1?utm_source=google');
    await expect(page).toHaveURL(/\/quiz-1\/0/);
    expect(getParam(page.url(), 'utm_source')).toBe('google');
  });

  test('every screen URL retains utm_source=google', async ({ page }) => {
    await page.goto('/quiz-1/0?utm_source=google');
    await page.getByRole('button', { name: '18–29' }).click();
    await expect(page).toHaveURL(/\/quiz-1\/1/);
    expect(getParam(page.url(), 'utm_source')).toBe('google');
  });

  test('all page_view events have utm_source="google"', async ({ page }) => {
    await page.goto('/quiz-1/0?utm_source=google');
    await page.goto('/quiz-1/1?utm_source=google');
    await page.goto('/quiz-1/paywall?utm_source=google');

    const { data } = await supabase
      .from('events')
      .select('utm_source')
      .eq('user_id', userId)
      .eq('name', 'page_view');

    expect(data!.length).toBeGreaterThanOrEqual(3);
    for (const row of data!) {
      expect(row.utm_source).toBe('google');
    }
  });

  test('buy event has utm_source="google"', async ({ page }) => {
    const email = `e2e-utm1-${userId}@test.com`;
    await page.goto('/quiz-1/1?utm_source=google');
    await page.getByPlaceholder('you@somewhere.com').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/quiz-1\/paywall/);
    await page.getByRole('button', { name: 'Start 7-day free trial' }).click();
    await expect(page.getByText('✓  Welcome')).toBeVisible();

    const { data } = await supabase
      .from('events')
      .select('utm_source')
      .eq('user_id', userId)
      .eq('name', 'buy');
    expect(data).toHaveLength(1);
    expect(data![0].utm_source).toBe('google');
  });
});

test.describe('UTM — Scenario 2: direct visit (no UTM)', () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = crypto.randomUUID();
    await context.addCookies([{
      name: 'userId', value: userId,
      domain: 'localhost', path: '/',
      httpOnly: true, sameSite: 'Lax',
    }]);
  });

  test.afterEach(async () => {
    await cleanupByUserId(userId);
  });

  test('all page_view events have utm_source="Direct"', async ({ page }) => {
    await page.goto('/quiz-1/0');
    await page.goto('/quiz-1/1');
    await page.goto('/quiz-1/paywall');

    const { data } = await supabase
      .from('events')
      .select('utm_source')
      .eq('user_id', userId)
      .eq('name', 'page_view');

    expect(data!.length).toBeGreaterThanOrEqual(3);
    for (const row of data!) {
      expect(row.utm_source).toBe('Direct');
    }
  });

  test('buy event has utm_source="Direct"', async ({ page }) => {
    const email = `e2e-utm2-${userId}@test.com`;
    await page.goto('/quiz-1/1');
    await page.getByPlaceholder('you@somewhere.com').fill(email);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/quiz-1\/paywall/);
    await page.getByRole('button', { name: 'Start 7-day free trial' }).click();
    await expect(page.getByText('✓  Welcome')).toBeVisible();

    const { data } = await supabase
      .from('events')
      .select('utm_source')
      .eq('user_id', userId)
      .eq('name', 'buy');
    expect(data).toHaveLength(1);
    expect(data![0].utm_source).toBe('Direct');
  });
});

test.describe('UTM — Scenario 3: multi-param visit (facebook + utm_medium + gclid)', () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = crypto.randomUUID();
    await context.addCookies([{
      name: 'userId', value: userId,
      domain: 'localhost', path: '/',
      httpOnly: true, sameSite: 'Lax',
    }]);
  });

  test.afterEach(async () => {
    await cleanupByUserId(userId);
  });

  test('all three params survive internal navigation', async ({ page }) => {
    await page.goto('/quiz-1/0?utm_source=facebook&utm_medium=cpc&gclid=xyz');
    await page.getByRole('button', { name: '18–29' }).click();
    await expect(page).toHaveURL(/\/quiz-1\/1/);

    const u = new URL(page.url());
    expect(u.searchParams.get('utm_source')).toBe('facebook');
    expect(u.searchParams.get('utm_medium')).toBe('cpc');
    expect(u.searchParams.get('gclid')).toBe('xyz');
  });

  test('events have utm_source="facebook"', async ({ page }) => {
    await page.goto('/quiz-1/0?utm_source=facebook&utm_medium=cpc&gclid=xyz');
    await page.goto('/quiz-1/paywall?utm_source=facebook&utm_medium=cpc&gclid=xyz');

    const { data } = await supabase
      .from('events')
      .select('utm_source')
      .eq('user_id', userId);

    expect(data!.length).toBeGreaterThanOrEqual(1);
    for (const row of data!) {
      expect(row.utm_source).toBe('facebook');
    }
  });
});

test.describe('UTM — Scenario 4: empty utm_source', () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = crypto.randomUUID();
    await context.addCookies([{
      name: 'userId', value: userId,
      domain: 'localhost', path: '/',
      httpOnly: true, sameSite: 'Lax',
    }]);
  });

  test.afterEach(async () => {
    await cleanupByUserId(userId);
  });

  test('empty utm_source is recorded as "Direct"', async ({ page }) => {
    await page.goto('/quiz-1/0?utm_source=');
    await page.goto('/quiz-1/paywall?utm_source=');

    const { data } = await supabase
      .from('events')
      .select('utm_source')
      .eq('user_id', userId);

    expect(data!.length).toBeGreaterThanOrEqual(1);
    for (const row of data!) {
      expect(row.utm_source).toBe('Direct');
    }
  });
});

test.describe('UTM — Scenario 5: deep link without UTM after google entry', () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = crypto.randomUUID();
    await context.addCookies([{
      name: 'userId', value: userId,
      domain: 'localhost', path: '/',
      httpOnly: true, sameSite: 'Lax',
    }]);
  });

  test.afterEach(async () => {
    await cleanupByUserId(userId);
  });

  test('screen-0 event has utm_source=google; screen-1 deep-link event has utm_source=Direct', async ({ page, context }) => {
    await page.goto('/quiz-1/0?utm_source=google');

    const page2 = await context.newPage();
    await page2.goto('/quiz-1/1');
    await page2.close();

    const { data: screen0Events } = await supabase
      .from('events')
      .select('utm_source')
      .eq('user_id', userId)
      .eq('question_id', '0');
    expect(screen0Events).toHaveLength(1);
    expect(screen0Events![0].utm_source).toBe('google');

    const { data: screen1Events } = await supabase
      .from('events')
      .select('utm_source')
      .eq('user_id', userId)
      .eq('question_id', '1');
    expect(screen1Events).toHaveLength(1);
    expect(screen1Events![0].utm_source).toBe('Direct');
  });
});
