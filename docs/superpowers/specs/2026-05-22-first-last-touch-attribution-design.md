# First-touch / Last-touch attribution — design

**Date:** 2026-05-22
**Author:** Claude + Artur
**Status:** Draft (awaiting user review)

## Problem

The dashboard currently computes a per-user "first source" by scanning the first event in the filtered date range (`dashboard-data.ts:162`). That means:

- "First touch" silently changes when the date filter changes — it's "first within window", not "first ever".
- There's no concept of "last touch" (most recent visit's source), so there's no way to look at remarketing reach.
- Source attribution lives only on `events.utm_source`; the user row carries no attribution.

We want stable, persistent per-user attribution so the dashboard can answer:

- **First touch** — where did this user *originally* come from?
- **Last touch** — where did this user *most recently* come from?
- **How the mix shifts** between first and last (the remarketing story).

## Definitions

- **First touch** — the `utm_source` recorded on the user's very first event (the proxy mints `userId` on first request and `recordEvent` fires for that page view). Locked at that moment; **never overwritten** on later visits.
- **Last touch** — the `utm_source` recorded on the user's most recent event. **Overwritten on every visit**, including direct returns (literal-latest semantics, per user decision).
- **Source value** — same as today: `utm_source` query param trimmed, falling back to the string `"Direct"` (`app/lib/source.ts:1`).
- **Cohort for the new dashboard section** — users whose **first visit** falls within the dashboard's selected date range.

## Data model

New table, separate from `users`, to keep identity and attribution decoupled (and to make future extension to `utm_medium` / `utm_campaign` / referrer cheap):

```sql
create table user_attribution (
  user_id       uuid primary key references users(id) on delete cascade,
  first_source  text not null,
  first_seen_at timestamptz not null,
  last_source   text not null,
  last_seen_at  timestamptz not null
);

create index user_attribution_first_seen_at_idx on user_attribution(first_seen_at);
create index user_attribution_first_source_idx  on user_attribution(first_source);
create index user_attribution_last_source_idx   on user_attribution(last_source);
```

- `user_id` is PK + FK with `on delete cascade` so deleting a user wipes their attribution.
- All four columns are NOT NULL — the write path always sets all four on insert.

### Backfill (same migration)

```sql
insert into user_attribution (user_id, first_source, first_seen_at, last_source, last_seen_at)
select
  user_id,
  (array_agg(utm_source order by created_at asc))[1],
  min(created_at),
  (array_agg(utm_source order by created_at desc))[1],
  max(created_at)
from events
group by user_id
on conflict (user_id) do nothing;
```

Safe to re-run via `on conflict do nothing`.

## Write path

Extend `recordEvent` in `app/lib/tracking.ts`. Today it upserts `users` and inserts an `events` row. Add two attribution operations between them:

```ts
const now = new Date().toISOString();

await supabase
  .from('users')
  .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

// 1. Insert attribution row on first touch; do nothing if it already exists.
//    Locks first_source / first_seen_at forever.
await supabase.from('user_attribution').upsert(
  {
    user_id: userId,
    first_source: utmSource,
    first_seen_at: now,
    last_source: utmSource,
    last_seen_at: now,
  },
  { onConflict: 'user_id', ignoreDuplicates: true }
);

// 2. Always overwrite last_* — literal-latest semantics.
await supabase
  .from('user_attribution')
  .update({ last_source: utmSource, last_seen_at: now })
  .eq('user_id', userId);

await supabase.from('events').insert({ /* unchanged */ });
```

Two-query pattern matches the existing multi-query style in `tracking.ts`. Both call sites (`[funnelId]/[screenIndex]/page.tsx` for page views, `recordBuyEvent` action for purchases) automatically inherit attribution updates — no caller changes.

**Known limitation:** in the rare case of two concurrent events for the same user, last-write-wins. Acceptable for a funnel app; can be tightened later via an RPC function with a `where excluded.last_seen_at >= user_attribution.last_seen_at` guard if needed.

## Read path

New file `app/(private)/dashboard/attribution-data.ts`:

```ts
export type SourceBreakdown = { source: string; users: number };

export type SourceFlow = {
  firstSource: string;
  lastSource: string;
  users: number;
};

export type AttributionData = {
  firstTouch: SourceBreakdown[];   // sorted desc by users
  lastTouch: SourceBreakdown[];    // sorted desc by users
  flows: SourceFlow[];             // (firstSource, lastSource) pairs, sorted desc by users
  totalUsers: number;
};

export async function loadAttributionData(range: DashboardRange): Promise<AttributionData>;
```

Query: `select first_source, last_source from user_attribution where first_seen_at in [from, to)`.
Aggregation in JS (mirrors how `dashboard-data.ts` already aggregates events):

- Bucket by `first_source` → `firstTouch[]`.
- Bucket by `last_source` → `lastTouch[]`.
- Bucket by `(first_source, last_source)` pair → `flows[]` (this powers the Sankey ribbons and the flow table).

The dashboard page calls both loaders in parallel:

```ts
const [{ steps, channels, allSources }, attribution] = await Promise.all([
  loadDashboardData({ from, to, source: sourceParam ?? undefined }),
  loadAttributionData({ from, to }),
]);
```

The existing `SourceFilter` (which filters by today's "first within window" logic) is **not affected** by this change — out of scope. See "Out of scope" below.

## UI

New section on the dashboard, below the existing funnel + rail. Title: **"Source flow — first → last"**.

The section is one card containing:

1. **Sankey chart** — left column lists distinct first-touch sources sized by user count; right column lists distinct last-touch sources sized by user count; ribbons between them are sized by the number of users in each `(first_source, last_source)` pair.
   - No labels on ribbons by default.
   - Hover a ribbon → tooltip with `"<first> → <last>"`, user count, and share `(% of first-touch source)`.
   - Uses the existing 5-color channel palette and the dashboard's roughen SVG filter so it visually matches the funnel above.
2. **Top flows table** below the chart — sorted descending by user count. Columns: `from`, `→`, `to`, `users`, `share` (`% of users with that first-touch source`), mini-bar. Shows the **top 10** rows by default; the remainder collapses into a `"show all (N more)"` row that expands on click.

Both the Sankey and the table read from the same `flows[]` array.

**Date scope:** both come from `loadAttributionData(range)`, scoped to users whose `first_seen_at` is in the selected date range — same cohort definition shared by all parts of the new section.

**All sources, no rollup.** Per user decision: every distinct source gets its own node/row, no "Other" bucket.

**Tooltip is interactive**, so the Sankey lives in a client component (`AttributionFlow.tsx`). The table is plain server-rendered markup.

## File layout

- `supabase/migrations/20260522000000_create_user_attribution.sql` — schema + backfill
- `app/lib/tracking.ts` — extend `recordEvent`
- `app/(private)/dashboard/attribution-data.ts` — new loader
- `app/(private)/dashboard/AttributionFlow.tsx` — client component: Sankey + tooltip
- `app/(private)/dashboard/FlowTable.tsx` — server component: top flows table
- `app/(private)/dashboard/page.tsx` — render the new section, wire `loadAttributionData` into the parallel `Promise.all`

## Testing

- Unit test `loadAttributionData` with seeded fixtures: empty range, single user single visit, single user multiple visits (verify first locked + last updated), date-range scoping (user with first_seen_at outside range is excluded).
- Unit test the backfill SQL by running it against a fixture event log and asserting `(first_source, first_seen_at, last_source, last_seen_at)` per user.
- Smoke test against the running app: visit `/q1?utm_source=google` → check `user_attribution` row inserted with `first_source = last_source = google`. Visit `/q1?utm_source=facebook` from same browser → `first_source` unchanged, `last_source = facebook`. Direct visit → `last_source = Direct`.

## Edge cases

- **User with no events in range** — excluded by `where first_seen_at in range`. Correct: the cohort is users who *first arrived* in the window.
- **User who first arrived before the range but returned inside it** — excluded from the new section by design (cohort = first-visit-in-range). They still appear in the existing funnel aggregates because those use events.
- **Concurrent events for new users** — both attempts hit `ignoreDuplicates`; only one wins for `first_*`. The losing transaction's `update last_*` still runs and overwrites correctly. Last-write-wins for `last_*`.
- **`utm_source` value missing on visit** — falls back to `"Direct"` via existing `getUtmSource()`. Same for the attribution row.

## Out of scope

- **Multi-touch attribution** (every touch counted, weighted models). `events.utm_source` already records every touch — we can add this later without schema changes.
- **`utm_medium` / `utm_campaign` / referrer / `gclid` / `fbclid`** capture. Easy to add later: more columns on `user_attribution` + parallel logic in `recordEvent`.
- **Changing the existing `SourceFilter`** to use persisted first-touch instead of "first-within-window". Worth doing eventually for consistency, but separate change.
- **Click-to-filter from the Sankey/table back into the existing SourceFilter** — possible follow-up, not in v1.
- **Per-user list view** showing every user with their attribution row — separate feature.

## Open follow-ups (not blocking)

- Once the persisted columns exist, consider switching `loadDashboardData`'s funnel-channel breakdown from event-derived "first source" to `user_attribution.first_source` for consistency.
- Consider whether the existing `SourceFilter` should also expose a "filter by last touch" toggle later.
