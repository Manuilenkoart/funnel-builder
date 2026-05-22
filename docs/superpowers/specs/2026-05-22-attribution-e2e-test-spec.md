# Attribution feature — end-to-end test spec

**Date:** 2026-05-22
**Status:** Draft — for a future test pass
**Related:** `docs/superpowers/specs/2026-05-22-first-last-touch-attribution-design.md`

## Purpose

Lock the first/last touch attribution behavior with browser-level tests, so that future refactors of `proxy.ts`, `recordEvent`, or the dashboard can't silently regress the invariants that today's lessons surfaced.

Today's manual smoke test exposed two things worth pinning down with tests:

- `first_source` is determined by the **first request that mints the userId cookie**, not by the first request that happens to include a `utm_source` query param. Visiting once direct, then later with `?utm_source=google`, locks `first_source = 'Direct'` forever.
- `last_source` overwrites literally — including `'Direct'` — on every visit.

## Scope

Cover the end-to-end path that's currently impossible to assert in unit tests: cookie minting in `proxy.ts`, `utm_source` plumbing through server components, the four DB writes in `recordEvent`, and the dashboard's new attribution section reading from `user_attribution`.

In scope:

- First-touch lock under various entry-URL shapes.
- Last-touch overwrite on each subsequent visit.
- Dashboard Sankey + FlowTable populate from `user_attribution`.
- Date-range cohort: only users whose `first_seen_at` falls in the selected window appear in the new section.
- Funnel section's channel bands remain consistent with the data (first-event-within-range attribution).

Out of scope:

- Migration testing (covered by the migration's own backfill verification query).
- Buy-event flow beyond confirming `recordEvent` still writes attribution when `name='buy'`.
- Cross-browser visual diffs — assert behavior, not pixels.
- Multi-touch attribution (the design doc lists it as a future extension).

## Test environment

- **Framework:** Playwright (multi-browser, cookie isolation per context).
- **App:** dev server `npm run dev` against a dedicated Supabase project (separate from the prod data — never run e2e against the prod project).
- **DB reset:** before each test file, truncate `events` and `user_attribution` and delete from `users`. Done via a Supabase service-role client called from a Playwright `globalSetup` or per-test fixture.
- **Time:** the tests do not depend on real time of day. Run with `from`/`to` query params explicitly when asserting dashboard state.
- **Identity isolation:** each test creates a fresh `browser.newContext()` so the `userId` cookie is unique per scenario.

## Test scenarios

Each scenario lists pre-state, steps, expected post-state. DB assertions read directly from `user_attribution` and `events` via a service-role helper.

### S1. First touch — direct landing

**Pre-state:** empty DB.

**Steps:**
1. New context, visit `/{funnelId}/0` (no query params).

**Expected:**
- One row in `users`.
- `user_attribution`: `first_source = 'Direct'`, `last_source = 'Direct'`, `first_seen_at = last_seen_at` (or within 1 second of each other).
- One row in `events` with `utm_source = 'Direct'`.

### S2. First touch — utm_source on initial URL

**Pre-state:** empty DB.

**Steps:**
1. New context, visit `/{funnelId}/0?utm_source=google`.

**Expected:**
- `user_attribution.first_source = 'google'`.
- `user_attribution.last_source = 'google'`.
- One `events` row with `utm_source = 'google'`.

### S3. First touch lock — direct then attributed return

**Pre-state:** empty DB.

**Steps:**
1. New context, visit `/{funnelId}/0` (direct).
2. Same context, visit `/{funnelId}/0?utm_source=facebook`.

**Expected:**
- `user_attribution.first_source = 'Direct'` (locked).
- `user_attribution.last_source = 'facebook'` (updated).
- `last_seen_at > first_seen_at`.
- Two `events` rows: first `utm_source = 'Direct'`, second `utm_source = 'facebook'`.

### S4. First touch lock — attributed then direct return

**Pre-state:** empty DB.

**Steps:**
1. New context, visit `/{funnelId}/0?utm_source=google`.
2. Same context, visit `/{funnelId}/0` (direct).

**Expected:**
- `user_attribution.first_source = 'google'` (locked).
- `user_attribution.last_source = 'Direct'` (literal overwrite, per user decision).
- Two `events` rows: first `utm_source = 'google'`, second `utm_source = 'Direct'`.

### S5. Multiple distinct visitors

**Pre-state:** empty DB.

**Steps:**
1. Context A visits `/{funnelId}/0?utm_source=google`.
2. Context B visits `/{funnelId}/0?utm_source=facebook`.
3. Context C visits `/{funnelId}/0` (direct).

**Expected:**
- Three rows in `user_attribution`, one per context, with `first_source` values `'google'`, `'facebook'`, `'Direct'` respectively.
- Each user's `last_source == first_source` (only one visit each).

### S6. Last touch updates on internal nav, not just landing

**Pre-state:** empty DB.

**Steps:**
1. New context, visit `/{funnelId}/0?utm_source=google`.
2. Same context, navigate to `/{funnelId}/1` (next question screen, no utm_source on URL).

**Expected:**
- `first_source = 'google'`.
- `last_source = 'google'` (the `withParams` helper propagates the original `utm_source` through internal navigation, so the second event also carries it).
- Two `events` rows, both with `utm_source = 'google'`.

This test guards against regressions in `withParams()` / `proxy.ts` that would strip the param.

### S7. Last touch updates on buy event

**Pre-state:** empty DB.

**Steps:**
1. New context, visit `/{funnelId}/0?utm_source=google`.
2. Walk through all screens to `/{funnelId}/paywall`.
3. Click the buy CTA (triggers `recordBuyEvent`).

**Expected:**
- `first_source = 'google'`.
- `last_source = 'google'` (the buy event still passes the propagated utm_source).
- Final `events` row has `name = 'buy'` and `utm_source = 'google'`.

### S8. Dashboard renders Sankey from attribution rows

**Pre-state:** empty DB, then seed 5 users via S2/S3/S4-style flows so `user_attribution` contains a mix of sources and flow pairs (e.g. google→google, google→Direct, facebook→Direct, Direct→Direct, Direct→facebook).

**Steps:**
1. Log in to `/dashboard?from=<today>&to=<today>` (or whatever range covers the seeded `first_seen_at`).

**Expected:**
- "Source flow — first → last" card is visible.
- Subtitle reads `5 users in this window`.
- The Sankey SVG renders nodes for every distinct source on each side. Specifically: left nodes match the union of all `first_source` values; right nodes match the union of all `last_source` values.
- FlowTable rows match `select first_source, last_source, count(*) from user_attribution group by 1,2 order by count desc` exactly.

### S9. Dashboard date range filters by `first_seen_at`

**Pre-state:** empty DB. Seed two cohorts:
- Two users whose first event happened **yesterday** (use a service-role insert with custom timestamps).
- Three users whose first event happened **today**.

**Steps:**
1. Visit `/dashboard?from=<today>&to=<today>`.

**Expected:**
- "Source flow — first → last" card subtitle reads `3 users in this window`.
- The Sankey and FlowTable include only the 3 users who first appeared today.
- Yesterday's 2 users are absent from the new section even if they returned today.

### S10. Hover tooltip on a Sankey ribbon

**Pre-state:** seed at least one user with `(first_source='google', last_source='Direct')`.

**Steps:**
1. Visit `/dashboard` for that user's range.
2. Hover the `google → Direct` ribbon.

**Expected:**
- A tooltip appears with text `google → Direct`, the user count, and `<n>% of google`.
- Moving the cursor off the ribbon dismisses the tooltip.

### S11. "show all" expand row toggles via URL param

**Pre-state:** seed more than 10 distinct flow pairs.

**Steps:**
1. Visit `/dashboard` without `flows=all`.
2. Verify only the top 10 rows render and the `… show all (N more)` link appears.
3. Click the link.
4. Verify the URL now includes `flows=all` and all rows render.
5. Click the toggle again (link text is now collapse form, or any link that removes the param).
6. Verify the table collapses back to 10 rows.

### S12. Empty state when no users in range

**Pre-state:** empty DB.

**Steps:**
1. Visit `/dashboard`.

**Expected:**
- "Source flow — first → last" card is visible.
- Subtitle reads `0 users in this window`.
- The Sankey area renders the empty-state placeholder text.
- FlowTable is not rendered (returns `null`).

## DB helper (service-role)

A tiny Playwright fixture wrapping `@supabase/supabase-js` with the service-role key. Should expose:

```ts
type AttributionRow = {
  user_id: string;
  first_source: string;
  first_seen_at: string;
  last_source: string;
  last_seen_at: string;
};

type EventRow = {
  user_id: string;
  utm_source: string;
  name: 'page_view' | 'buy';
  created_at: string;
};

interface DbHelper {
  truncateAll(): Promise<void>;
  insertUserWithEvents(seed: {
    userId?: string;
    firstSource: string;
    firstSeenAt: Date;
    visits: { source: string; at: Date; name?: 'page_view' | 'buy'; questionId?: string }[];
  }): Promise<string>;  // returns userId
  getAttribution(userId: string): Promise<AttributionRow | null>;
  getEvents(userId: string): Promise<EventRow[]>;
}
```

Seeding directly via service-role avoids slow browser-driven setup for cohorts in S8 and S9.

## CI considerations

- Run the e2e suite against an ephemeral Supabase project (or a dedicated long-lived "e2e" project that the test always truncates first). Never against prod.
- The full pass should be under 2 minutes. If a scenario can't be expressed within that budget, mark it as nightly-only and document why.
- The dev server boot is the slowest part — use Playwright's `webServer` config with `reuseExistingServer: !process.env.CI` so local runs reuse a running `npm run dev`.

## Open follow-ups

- If the funnel-channel breakdown in `loadDashboardData` is later switched to read `user_attribution.first_source` (open follow-up in the implementation spec), add a scenario asserting the funnel bands match the persisted first-touch rather than first-event-in-range.
- If multi-touch attribution is added (every UTM touch counted), update S6 to assert intermediate touches are recorded in `user_attribution_history` (or whatever the new table is named).
