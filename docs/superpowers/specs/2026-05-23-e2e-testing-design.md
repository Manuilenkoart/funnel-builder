# E2E Testing Design

**Date:** 2026-05-23  
**Scope:** User-facing funnel flow regression coverage  
**Framework:** Playwright  

---

## Goal

Catch regressions in the user-facing funnel flow: screen navigation, email capture, paywall rendering, and the Supabase tracking side effects that fire on each page visit (middleware cookie assignment, `users` upsert, `events` insert). Dashboard is out of scope.

## Constraints

- Tests run locally only (no CI for now)
- Tests run against the same Supabase project as production; test data is cleaned up after each run using the service role key
- Single worker to avoid concurrent writes to shared Supabase

---

## File Structure

```
playwright.config.ts
e2e/
  helpers/
    cleanup.ts         # Supabase cleanup via service role key (by email or userId)
  funnel.spec.ts       # full flow: navigate → email → paywall
  email.spec.ts        # returning-user login flow
  tracking.spec.ts     # Supabase side-effect verification
```

Email input validation (empty string, malformed email) is already covered by unit tests in `__tests__/tracking.test.ts` — no new file needed.

---

## Configuration

`playwright.config.ts`:
- `baseURL: http://localhost:3000`
- `webServer` block: auto-starts `npm run dev` before the suite, kills it after
- `workers: 1` — prevents concurrent writes to the same Supabase project
- Screenshots and traces captured on failure

---

## Cleanup Helper

`e2e/helpers/cleanup.ts` exports two functions, both using a Supabase service-role client (bypasses RLS). Tests fail loudly if `SUPABASE_SERVICE_ROLE_KEY` is absent.

- `cleanupByEmail(email: string)` — deletes in FK-safe order: `events` → `user_attribution` → `users` filtered by email. Used by `email.spec.ts`.
- `cleanupByUserId(userId: string)` — deletes in FK-safe order: `events` → `user_attribution` → `users` filtered by `id`. Used by `tracking.spec.ts`.

Test emails use the pattern `e2e-${Date.now()}@test.com` to be unique per run.

## Test Setup Convention

**Deterministic userId:** Rather than letting middleware generate a random UUID, each test in `tracking.spec.ts` sets the `userId` cookie to a known value before navigating. This means the userId is available for DB assertions and cleanup without having to read the cookie after the fact.

```ts
// beforeEach in tracking.spec.ts
const userId = crypto.randomUUID();
await context.addCookies([{
  name: 'userId', value: userId,
  domain: 'localhost', path: '/',
  httpOnly: true, sameSite: 'Lax',
}]);
```

`afterEach` calls `cleanupByUserId(userId)` unconditionally.

**URL assertions** use the `URL` constructor to parse and compare params — not string `includes()` — to avoid false positives from params appearing in other parts of the URL.

---

## Test Scenarios

### `funnel.spec.ts` — Navigation and golden path

| Test | Assertion |
|------|-----------|
| Visiting `/{funnelId}` | Redirects to `/{funnelId}/0` |
| Clicking a row-list answer | Navigates to the next screen |
| Progress bar | Advances with each screen |
| Reaching the email screen | Email input is visible |
| Submitting a valid email | Navigates to `/paywall` |
| Paywall page | Heading and pricing choice are visible |

### `email.spec.ts` — Returning user login flow (e2e)

Tests the case where a user submits an email address that already exists in the database. The system must recognise the returning user and switch their session to the existing account.

| Test | Assertion |
|------|-----------|
| Submitting a known email on the email screen | `userId` cookie is switched to the existing user's ID |
| Submitting a known email | User lands on paywall (flow continues normally) |

Setup: seed a known user row in Supabase before the test; teardown cleans it up via `cleanupByEmail`.

### `tracking.spec.ts` — Supabase side-effect verification

Verifies the tracking integration described in `2026-05-21-user-tracking-design.md`: that navigating the funnel produces the correct rows in Supabase.

After each navigation step, the test reads the `userId` cookie from Playwright's browser context and queries Supabase directly to assert the expected rows exist.

| Test | Assertion |
|------|-----------|
| First visit to `/{funnelId}/0` | Middleware sets `userId` cookie (httpOnly) |
| First visit to `/{funnelId}/0` | `users` row exists with that `id` |
| First visit to `/{funnelId}/0` | `events` row: `name=page_view`, `funnel_id=quiz-1`, `question_id="0"` |
| Navigating to screen 1 | `events` row: `question_id="1"` |
| Navigating to `/paywall` | `events` row: `question_id="paywall"` |
| Submitting email | `users.email` is updated to the submitted address |

Teardown: `cleanupByUserId(userId)` using the cookie read at the start of the test.

### `tracking.spec.ts` — UTM source propagation (e2e)

Verifies the UTM source tracking described in `2026-05-21-utm-source-tracking-design.md`. Unit tests for `getUtmSource` and `withParams` already exist in `__tests__/source.test.ts` and `__tests__/url.test.ts` — these tests verify the full integration: URL → server component → Supabase row.

Each scenario uses a deterministic `userId` cookie (see Test Setup Convention) and calls `cleanupByUserId` in `afterEach`.

**Scenario 1 — Google-sourced visit (`?utm_source=google`)**

| Assertion |
|-----------|
| Landing on `/{funnelId}?utm_source=google` redirects to `/{funnelId}/0?utm_source=google` |
| Every subsequent screen URL retains `utm_source=google` (verified via `URL` parser) |
| Every `page_view` event row (screens 0, 1, paywall) has `utm_source = 'google'` |
| `buy` event row has `utm_source = 'google'` |

**Scenario 2 — Direct visit (no UTM)**

| Assertion |
|-----------|
| No `utm_source` param appears in any URL |
| All `page_view` and `buy` event rows have `utm_source = 'Direct'` |

**Scenario 3 — Multi-parameter visit (`?utm_source=facebook&utm_medium=cpc&gclid=xyz`)**

| Assertion |
|-----------|
| All three params (`utm_source`, `utm_medium`, `gclid`) are present in every screen URL |
| All event rows have `utm_source = 'facebook'` |
| `utm_medium` and `gclid` are NOT stored in the `events` table (no such columns) |

**Scenario 4 — Edge: empty `utm_source=`**

| Assertion |
|-----------|
| All event rows have `utm_source = 'Direct'` (empty value treated as missing) |

**Scenario 5 — Edge: deep link without UTM after a Google-sourced entry**

Uses two pages in the same browser context (same `userId` cookie):

| Assertion |
|-----------|
| Events from screens 0–1 (visited with `?utm_source=google`) have `utm_source = 'google'` |
| Events from screen 2 onwards (visited via deep link with no UTM) have `utm_source = 'Direct'` |

This documents the accepted tradeoff: source is URL-driven per request, not cookie-persisted.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS for test cleanup — add to `.env.local`, never commit |

---

## Out of Scope

- Dashboard page
- Deduplication of repeat page views (same user refreshing)
- CI integration (future work)
- Auth/login flow (admin dashboard login)
