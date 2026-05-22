# First/Last Touch Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist first- and last-touch `utm_source` per user, and surface the first → last transition on the dashboard as a Sankey chart with a sorted flow table.

**Architecture:** New `user_attribution` table (separate from `users`) holds `first_source`, `first_seen_at`, `last_source`, `last_seen_at`. `recordEvent` upserts the row on first event (locking `first_*`) and overwrites `last_*` on every subsequent event. The dashboard adds a section that loads attribution rows in parallel with the existing event query and renders a hand-built SVG Sankey + a server-rendered flow table.

**Tech Stack:** Next.js 16 (App Router, server + client components), TypeScript, Supabase Postgres, Vitest. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-22-first-last-touch-attribution-design.md`

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260522000000_create_user_attribution.sql` | create | Schema + indexes + one-time backfill |
| `app/lib/tracking.ts` | modify | Extend `recordEvent` to write `user_attribution` |
| `__tests__/tracking.test.ts` | modify | Add tests for attribution upsert + update |
| `app/(private)/dashboard/attribution-data.ts` | create | `loadAttributionData()` + types |
| `__tests__/attribution-data.test.ts` | create | Unit tests for loader |
| `app/(private)/dashboard/sankey-layout.ts` | create | Pure layout function `computeSankeyLayout()` |
| `__tests__/sankey-layout.test.ts` | create | Unit tests for layout math |
| `app/(private)/dashboard/AttributionFlow.tsx` | create | Client component — SVG Sankey + hover tooltip |
| `app/(private)/dashboard/FlowTable.tsx` | create | Server component — top-10 flow table with expand row |
| `app/(private)/dashboard/dashboard.module.css` | modify | Styles for new section (Sankey container, table, tooltip) |
| `app/(private)/dashboard/page.tsx` | modify | Parallel-load attribution and render the new section |

---

## Task 1: Migration — create `user_attribution` and backfill

**Files:**
- Create: `supabase/migrations/20260522000000_create_user_attribution.sql`

- [ ] **Step 1: Write the migration**

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

-- Backfill from existing events. Safe to re-run.
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

- [ ] **Step 2: Apply locally and verify**

Run via Supabase CLI or directly against the dev database. After applying, run this verification query in psql / Supabase SQL editor:

```sql
select count(*) as users_with_events from (select distinct user_id from events) e;
select count(*) as attribution_rows from user_attribution;
-- The two counts should match.
```

Expected: both counts are equal.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260522000000_create_user_attribution.sql
git commit -m "feat(db): add user_attribution table with backfill"
```

---

## Task 2: Extend `recordEvent` to write attribution

**Files:**
- Modify: `app/lib/tracking.ts`
- Modify: `__tests__/tracking.test.ts`

- [ ] **Step 1: Add failing tests for the attribution write path**

Append to `__tests__/tracking.test.ts` inside the existing `describe('recordEvent', …)` block. **Do not** remove existing tests.

```ts
it('upserts user_attribution with first_source and last_source set to the same utmSource', async () => {
  await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'google');
  expect(mockFrom).toHaveBeenCalledWith('user_attribution');
  expect(mockUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: 'user-abc',
      first_source: 'google',
      last_source: 'google',
    }),
    { onConflict: 'user_id', ignoreDuplicates: true },
  );
});

it('always updates last_source and last_seen_at on user_attribution', async () => {
  await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'facebook');
  expect(mockFrom).toHaveBeenCalledWith('user_attribution');
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ last_source: 'facebook' }),
  );
  expect(mockEq).toHaveBeenCalledWith('user_id', 'user-abc');
});

it('uses an ISO timestamp string for first_seen_at and last_seen_at', async () => {
  await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'google');
  const upsertCall = mockUpsert.mock.calls.find(
    ([row]) => (row as { user_id?: string }).user_id === 'user-abc',
  );
  expect(upsertCall).toBeDefined();
  const row = upsertCall![0] as Record<string, unknown>;
  expect(typeof row.first_seen_at).toBe('string');
  expect(typeof row.last_seen_at).toBe('string');
  expect(() => new Date(row.first_seen_at as string).toISOString()).not.toThrow();
});

it('writes attribution before the events row so the FK is satisfied', async () => {
  await recordEvent('user-abc', 'quiz-1', 'page_view', '0', 'google');
  const fromCalls = mockFrom.mock.calls.map(([t]) => t);
  const attributionIdx = fromCalls.indexOf('user_attribution');
  const eventsIdx = fromCalls.indexOf('events');
  expect(attributionIdx).toBeGreaterThan(-1);
  expect(eventsIdx).toBeGreaterThan(-1);
  expect(attributionIdx).toBeLessThan(eventsIdx);
});
```

- [ ] **Step 2: Run the new tests — they must fail**

Run: `npm test -- __tests__/tracking.test.ts`
Expected: 4 new tests fail because `tracking.ts` still doesn't touch `user_attribution`.

- [ ] **Step 3: Update `recordEvent` to write attribution**

Replace the body of `recordEvent` in `app/lib/tracking.ts` with:

```ts
export async function recordEvent(
  userId: string,
  funnelId: string,
  name: 'page_view' | 'buy',
  questionId: string | null,
  utmSource: string
): Promise<void> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  await supabase
    .from('users')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

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

  await supabase
    .from('user_attribution')
    .update({ last_source: utmSource, last_seen_at: now })
    .eq('user_id', userId);

  await supabase.from('events').insert({
    name,
    funnel_id: funnelId,
    question_id: questionId,
    user_id: userId,
    utm_source: utmSource,
  });
}
```

Leave `updateUserEmail` untouched.

- [ ] **Step 4: Run all tracking tests — they must pass**

Run: `npm test -- __tests__/tracking.test.ts`
Expected: all tests in the file pass (5 original + 4 new = 9).

- [ ] **Step 5: Commit**

```bash
git add app/lib/tracking.ts __tests__/tracking.test.ts
git commit -m "feat(tracking): persist first/last source per user"
```

---

## Task 3: `loadAttributionData` loader + types

**Files:**
- Create: `app/(private)/dashboard/attribution-data.ts`
- Create: `__tests__/attribution-data.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `__tests__/attribution-data.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { first_source: string; last_source: string };

const { builder, mockState } = vi.hoisted(() => {
  const mockState: { data: unknown[]; error: unknown } = {
    data: [],
    error: null,
  };
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.lt = vi.fn(() => builder);
  builder.then = (
    resolve: (v: { data: unknown[]; error: unknown }) => unknown,
    reject?: (e: unknown) => unknown,
  ) =>
    Promise.resolve({ data: mockState.data, error: mockState.error }).then(
      resolve,
      reject,
    );
  return { builder, mockState };
});

vi.mock('@/app/lib/supabase/server', () => ({
  createServerClient: () => builder,
}));

import { loadAttributionData } from '@/app/(private)/dashboard/attribution-data';

function setRows(rows: Row[]) {
  mockState.data = rows;
  mockState.error = null;
}

describe('loadAttributionData', () => {
  beforeEach(() => {
    mockState.data = [];
    mockState.error = null;
    vi.clearAllMocks();
  });

  it('returns an empty result when there are no rows', async () => {
    const result = await loadAttributionData({});
    expect(result.totalUsers).toBe(0);
    expect(result.firstTouch).toEqual([]);
    expect(result.lastTouch).toEqual([]);
    expect(result.flows).toEqual([]);
  });

  it('queries user_attribution for first_source and last_source', async () => {
    await loadAttributionData({});
    expect(builder.from).toHaveBeenCalledWith('user_attribution');
    expect(builder.select).toHaveBeenCalledWith('first_source, last_source');
  });

  it('does not constrain the query when no range is provided', async () => {
    await loadAttributionData({});
    expect(builder.gte).not.toHaveBeenCalled();
    expect(builder.lt).not.toHaveBeenCalled();
  });

  it('applies gte/lt to first_seen_at for the requested range', async () => {
    await loadAttributionData({ from: '2026-05-01', to: '2026-05-31' });
    expect(builder.gte).toHaveBeenCalledWith(
      'first_seen_at',
      '2026-05-01T00:00:00.000Z',
    );
    expect(builder.lt).toHaveBeenCalledWith(
      'first_seen_at',
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('swaps from/to when from is after to', async () => {
    await loadAttributionData({ from: '2026-05-31', to: '2026-05-01' });
    expect(builder.gte).toHaveBeenCalledWith(
      'first_seen_at',
      '2026-05-01T00:00:00.000Z',
    );
    expect(builder.lt).toHaveBeenCalledWith(
      'first_seen_at',
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('ignores invalid date strings', async () => {
    await loadAttributionData({ from: 'not-a-date', to: '2026/05/31' });
    expect(builder.gte).not.toHaveBeenCalled();
    expect(builder.lt).not.toHaveBeenCalled();
  });

  it('buckets firstTouch by first_source, sorted desc by user count', async () => {
    setRows([
      { first_source: 'google', last_source: 'google' },
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'facebook', last_source: 'Direct' },
    ]);
    const result = await loadAttributionData({});
    expect(result.firstTouch).toEqual([
      { source: 'google', users: 2 },
      { source: 'facebook', users: 1 },
    ]);
  });

  it('buckets lastTouch by last_source, sorted desc by user count', async () => {
    setRows([
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'facebook', last_source: 'Direct' },
      { first_source: 'google', last_source: 'google' },
    ]);
    const result = await loadAttributionData({});
    expect(result.lastTouch).toEqual([
      { source: 'Direct', users: 2 },
      { source: 'google', users: 1 },
    ]);
  });

  it('buckets flows by (first_source, last_source) pair, sorted desc by users', async () => {
    setRows([
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'google', last_source: 'google' },
      { first_source: 'facebook', last_source: 'facebook' },
    ]);
    const result = await loadAttributionData({});
    expect(result.flows).toEqual([
      { firstSource: 'google', lastSource: 'Direct', users: 2 },
      { firstSource: 'google', lastSource: 'google', users: 1 },
      { firstSource: 'facebook', lastSource: 'facebook', users: 1 },
    ]);
  });

  it('counts total users as the number of attribution rows', async () => {
    setRows([
      { first_source: 'google', last_source: 'Direct' },
      { first_source: 'facebook', last_source: 'Direct' },
      { first_source: 'twitter', last_source: 'twitter' },
    ]);
    const result = await loadAttributionData({});
    expect(result.totalUsers).toBe(3);
  });

  it('returns an empty result when supabase returns an error', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockState.data = [];
    mockState.error = { message: 'boom' };
    const result = await loadAttributionData({});
    expect(result.totalUsers).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('treats null data from supabase as no rows', async () => {
    mockState.data = null as unknown as unknown[];
    const result = await loadAttributionData({});
    expect(result.totalUsers).toBe(0);
    expect(result.flows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test file — it must fail (no module yet)**

Run: `npm test -- __tests__/attribution-data.test.ts`
Expected: failure resolving `@/app/(private)/dashboard/attribution-data`.

- [ ] **Step 3: Implement `loadAttributionData`**

Create `app/(private)/dashboard/attribution-data.ts`:

```ts
import { createServerClient } from "@/app/lib/supabase/server";

import type { DashboardRange } from "./dashboard-data";

export type SourceBreakdown = {
  source: string;
  users: number;
};

export type SourceFlow = {
  firstSource: string;
  lastSource: string;
  users: number;
};

export type AttributionData = {
  firstTouch: SourceBreakdown[];
  lastTouch: SourceBreakdown[];
  flows: SourceFlow[];
  totalUsers: number;
};

type Row = { first_source: string; last_source: string };

const DAY_MS = 86_400_000;

function parseISODate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toBreakdown(m: Map<string, number>): SourceBreakdown[] {
  return [...m.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([source, users]) => ({ source, users }));
}

export async function loadAttributionData(
  range: DashboardRange = {},
): Promise<AttributionData> {
  const supabase = createServerClient();

  let fromDate = parseISODate(range.from);
  let toDate = parseISODate(range.to);
  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    [fromDate, toDate] = [toDate, fromDate];
  }

  let query = supabase
    .from("user_attribution")
    .select("first_source, last_source");

  if (fromDate) query = query.gte("first_seen_at", fromDate.toISOString());
  if (toDate) {
    const exclusiveEnd = new Date(toDate.getTime() + DAY_MS);
    query = query.lt("first_seen_at", exclusiveEnd.toISOString());
  }

  const { data, error } = await query;
  if (error) console.error("[dashboard] failed to load attribution:", error);

  const rows = (data ?? []) as Row[];

  const firstCounts = new Map<string, number>();
  const lastCounts = new Map<string, number>();
  const flowCounts = new Map<string, number>();

  for (const r of rows) {
    firstCounts.set(r.first_source, (firstCounts.get(r.first_source) ?? 0) + 1);
    lastCounts.set(r.last_source, (lastCounts.get(r.last_source) ?? 0) + 1);
    const key = `${r.first_source}\u0000${r.last_source}`;
    flowCounts.set(key, (flowCounts.get(key) ?? 0) + 1);
  }

  const flows: SourceFlow[] = [...flowCounts.entries()]
    .map(([key, users]) => {
      const [firstSource, lastSource] = key.split("\u0000");
      return { firstSource, lastSource, users };
    })
    .sort((a, b) => b.users - a.users);

  return {
    firstTouch: toBreakdown(firstCounts),
    lastTouch: toBreakdown(lastCounts),
    flows,
    totalUsers: rows.length,
  };
}
```

- [ ] **Step 4: Run the test file — all must pass**

Run: `npm test -- __tests__/attribution-data.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/\(private\)/dashboard/attribution-data.ts __tests__/attribution-data.test.ts
git commit -m "feat(dashboard): add loadAttributionData with first/last source aggregation"
```

---

## Task 4: Sankey layout helper

**Files:**
- Create: `app/(private)/dashboard/sankey-layout.ts`
- Create: `__tests__/sankey-layout.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `__tests__/sankey-layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { computeSankeyLayout } from '@/app/(private)/dashboard/sankey-layout';

const DIMS = { width: 760, height: 460, nodeWidth: 80, gapPx: 8 };

describe('computeSankeyLayout', () => {
  it('returns empty layout when there are no flows', () => {
    const layout = computeSankeyLayout([], DIMS);
    expect(layout.leftNodes).toEqual([]);
    expect(layout.rightNodes).toEqual([]);
    expect(layout.ribbons).toEqual([]);
  });

  it('creates one left node, one right node, and one ribbon for a single flow', () => {
    const layout = computeSankeyLayout(
      [{ firstSource: 'google', lastSource: 'Direct', users: 10 }],
      DIMS,
    );
    expect(layout.leftNodes).toHaveLength(1);
    expect(layout.rightNodes).toHaveLength(1);
    expect(layout.ribbons).toHaveLength(1);
    expect(layout.leftNodes[0]).toMatchObject({ source: 'google', total: 10 });
    expect(layout.rightNodes[0]).toMatchObject({ source: 'Direct', total: 10 });
    expect(layout.ribbons[0]).toMatchObject({
      firstSource: 'google',
      lastSource: 'Direct',
      users: 10,
    });
  });

  it('orders left nodes by total descending', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'small', lastSource: 'Direct', users: 1 },
        { firstSource: 'big', lastSource: 'Direct', users: 10 },
        { firstSource: 'mid', lastSource: 'Direct', users: 5 },
      ],
      DIMS,
    );
    expect(layout.leftNodes.map((n) => n.source)).toEqual(['big', 'mid', 'small']);
  });

  it('orders right nodes by total descending', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'a', lastSource: 'small', users: 1 },
        { firstSource: 'a', lastSource: 'big', users: 10 },
        { firstSource: 'a', lastSource: 'mid', users: 5 },
      ],
      DIMS,
    );
    expect(layout.rightNodes.map((n) => n.source)).toEqual(['big', 'mid', 'small']);
  });

  it('sums totals from multiple flows touching the same node', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'google', lastSource: 'Direct', users: 7 },
        { firstSource: 'google', lastSource: 'google', users: 3 },
      ],
      DIMS,
    );
    expect(layout.leftNodes[0]).toMatchObject({ source: 'google', total: 10 });
    expect(
      layout.rightNodes.reduce((s, n) => s + n.total, 0),
    ).toBe(10);
  });

  it('produces left ribbon slices that stack within their source node', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'google', lastSource: 'a', users: 6 },
        { firstSource: 'google', lastSource: 'b', users: 4 },
      ],
      DIMS,
    );
    const node = layout.leftNodes.find((n) => n.source === 'google')!;
    const ribbons = layout.ribbons.filter((r) => r.firstSource === 'google');
    const sumH = ribbons.reduce((s, r) => s + r.leftH, 0);
    expect(sumH).toBeCloseTo(node.height, 5);
    // Each ribbon's leftY must lie inside the node.
    for (const r of ribbons) {
      expect(r.leftY).toBeGreaterThanOrEqual(node.y);
      expect(r.leftY + r.leftH).toBeLessThanOrEqual(node.y + node.height + 1e-6);
    }
  });

  it('produces right ribbon slices that stack within their target node', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'a', lastSource: 'Direct', users: 6 },
        { firstSource: 'b', lastSource: 'Direct', users: 4 },
      ],
      DIMS,
    );
    const node = layout.rightNodes.find((n) => n.source === 'Direct')!;
    const ribbons = layout.ribbons.filter((r) => r.lastSource === 'Direct');
    const sumH = ribbons.reduce((s, r) => s + r.rightH, 0);
    expect(sumH).toBeCloseTo(node.height, 5);
    for (const r of ribbons) {
      expect(r.rightY).toBeGreaterThanOrEqual(node.y);
      expect(r.rightY + r.rightH).toBeLessThanOrEqual(node.y + node.height + 1e-6);
    }
  });

  it('node heights are proportional to user count', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'a', lastSource: 'x', users: 10 },
        { firstSource: 'b', lastSource: 'x', users: 5 },
      ],
      DIMS,
    );
    const a = layout.leftNodes.find((n) => n.source === 'a')!;
    const b = layout.leftNodes.find((n) => n.source === 'b')!;
    expect(a.height).toBeCloseTo(b.height * 2, 5);
  });

  it('left and right node columns share the same total user count', () => {
    const layout = computeSankeyLayout(
      [
        { firstSource: 'a', lastSource: 'x', users: 4 },
        { firstSource: 'b', lastSource: 'y', users: 3 },
        { firstSource: 'a', lastSource: 'y', users: 2 },
      ],
      DIMS,
    );
    const leftSum = layout.leftNodes.reduce((s, n) => s + n.total, 0);
    const rightSum = layout.rightNodes.reduce((s, n) => s + n.total, 0);
    expect(leftSum).toBe(9);
    expect(rightSum).toBe(9);
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `npm test -- __tests__/sankey-layout.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement the layout helper**

Create `app/(private)/dashboard/sankey-layout.ts`:

```ts
import type { SourceFlow } from "./attribution-data";

export type SankeyDims = {
  width: number;
  height: number;
  nodeWidth: number;
  gapPx: number;
};

export type SankeyNode = {
  source: string;
  total: number;
  y: number;
  height: number;
};

export type SankeyRibbon = {
  firstSource: string;
  lastSource: string;
  users: number;
  leftY: number;
  leftH: number;
  rightY: number;
  rightH: number;
};

export type SankeyLayout = {
  leftNodes: SankeyNode[];
  rightNodes: SankeyNode[];
  ribbons: SankeyRibbon[];
};

function buildNodes(
  flows: SourceFlow[],
  side: "left" | "right",
  height: number,
  gapPx: number,
): SankeyNode[] {
  const totals = new Map<string, number>();
  for (const f of flows) {
    const key = side === "left" ? f.firstSource : f.lastSource;
    totals.set(key, (totals.get(key) ?? 0) + f.users);
  }
  const entries = [...totals.entries()].sort(([, a], [, b]) => b - a);
  const grandTotal = entries.reduce((s, [, n]) => s + n, 0);
  if (grandTotal === 0 || entries.length === 0) return [];

  const gapsTotal = gapPx * Math.max(0, entries.length - 1);
  const usableH = Math.max(0, height - gapsTotal);
  const pxPerUser = usableH / grandTotal;

  let y = 0;
  return entries.map(([source, total]) => {
    const h = total * pxPerUser;
    const node: SankeyNode = { source, total, y, height: h };
    y += h + gapPx;
    return node;
  });
}

export function computeSankeyLayout(
  flows: SourceFlow[],
  dims: SankeyDims,
): SankeyLayout {
  const positiveFlows = flows.filter((f) => f.users > 0);
  if (positiveFlows.length === 0) {
    return { leftNodes: [], rightNodes: [], ribbons: [] };
  }

  const leftNodes = buildNodes(positiveFlows, "left", dims.height, dims.gapPx);
  const rightNodes = buildNodes(positiveFlows, "right", dims.height, dims.gapPx);

  const leftIndex = new Map(leftNodes.map((n, i) => [n.source, i]));
  const rightIndex = new Map(rightNodes.map((n, i) => [n.source, i]));

  // Sort flows: outer loop = left node order (largest first), inner loop = right node order.
  const sortedFlows = [...positiveFlows].sort((a, b) => {
    const la = leftIndex.get(a.firstSource) ?? 0;
    const lb = leftIndex.get(b.firstSource) ?? 0;
    if (la !== lb) return la - lb;
    const ra = rightIndex.get(a.lastSource) ?? 0;
    const rb = rightIndex.get(b.lastSource) ?? 0;
    return ra - rb;
  });

  // Allocate vertical offsets within each node as ribbons are placed.
  const leftCursor = new Map<string, number>();
  const rightCursor = new Map<string, number>();
  leftNodes.forEach((n) => leftCursor.set(n.source, n.y));
  rightNodes.forEach((n) => rightCursor.set(n.source, n.y));

  const grandTotal = leftNodes.reduce((s, n) => s + n.total, 0);
  const usableH = dims.height - dims.gapPx * Math.max(0, leftNodes.length - 1);
  const pxPerUser = grandTotal === 0 ? 0 : usableH / grandTotal;

  const ribbons: SankeyRibbon[] = sortedFlows.map((f) => {
    const h = f.users * pxPerUser;
    const leftY = leftCursor.get(f.firstSource) ?? 0;
    const rightY = rightCursor.get(f.lastSource) ?? 0;
    leftCursor.set(f.firstSource, leftY + h);
    rightCursor.set(f.lastSource, rightY + h);
    return {
      firstSource: f.firstSource,
      lastSource: f.lastSource,
      users: f.users,
      leftY,
      leftH: h,
      rightY,
      rightH: h,
    };
  });

  return { leftNodes, rightNodes, ribbons };
}
```

- [ ] **Step 4: Run — all must pass**

Run: `npm test -- __tests__/sankey-layout.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/\(private\)/dashboard/sankey-layout.ts __tests__/sankey-layout.test.ts
git commit -m "feat(dashboard): add Sankey layout helper"
```

---

## Task 5: `AttributionFlow` client component (SVG Sankey + hover tooltip)

**Files:**
- Create: `app/(private)/dashboard/AttributionFlow.tsx`
- Modify: `app/(private)/dashboard/dashboard.module.css` (append new styles)

- [ ] **Step 1: Create the component**

Create `app/(private)/dashboard/AttributionFlow.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";

import type { SourceFlow } from "./attribution-data";
import styles from "./dashboard.module.css";
import { CHANNEL_COLORS } from "./funnel-data";
import { computeSankeyLayout } from "./sankey-layout";

const SVG_W = 760;
const SVG_H = 460;
const NODE_W = 80;
const LEFT_X = 120;
const RIGHT_X = SVG_W - LEFT_X - NODE_W;
const GAP = 8;
const CHART_TOP = 50;
const CHART_H = SVG_H - CHART_TOP - 30;

type Tooltip = {
  x: number;
  y: number;
  firstSource: string;
  lastSource: string;
  users: number;
  share: number;
};

function colorForSource(source: string, sources: string[]): string {
  const idx = sources.indexOf(source);
  if (idx < 0) return CHANNEL_COLORS[CHANNEL_COLORS.length - 1];
  return CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
}

export default function AttributionFlow({
  flows,
  totalUsers,
}: {
  flows: SourceFlow[];
  totalUsers: number;
}) {
  const [tip, setTip] = useState<Tooltip | null>(null);

  const layout = useMemo(
    () =>
      computeSankeyLayout(flows, {
        width: SVG_W,
        height: CHART_H,
        nodeWidth: NODE_W,
        gapPx: GAP,
      }),
    [flows],
  );

  // Stable color order driven by left-node ranking.
  const leftSourceOrder = useMemo(
    () => layout.leftNodes.map((n) => n.source),
    [layout],
  );

  if (totalUsers === 0 || flows.length === 0) {
    return (
      <div className={styles.flowEmpty}>
        no first/last touch data yet — appears once users hit the funnel
      </div>
    );
  }

  // Pre-compute "share of first-touch source" for each ribbon (% of that source's users).
  const firstTotals = new Map<string, number>();
  for (const f of flows) {
    firstTotals.set(f.firstSource, (firstTotals.get(f.firstSource) ?? 0) + f.users);
  }

  return (
    <div className={styles.flowWrap}>
      <svg
        className={styles.flowSvg}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setTip(null)}
      >
        <defs>
          <filter id="flowRough">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.05"
              numOctaves={2}
              seed={9}
            />
            <feDisplacementMap in="SourceGraphic" scale={1.2} />
          </filter>
        </defs>

        <text
          x={LEFT_X + NODE_W / 2}
          y={28}
          textAnchor="middle"
          className={styles.flowAxis}
        >
          FIRST TOUCH
        </text>
        <text
          x={RIGHT_X + NODE_W / 2}
          y={28}
          textAnchor="middle"
          className={styles.flowAxis}
        >
          LAST TOUCH
        </text>

        {/* Ribbons */}
        {layout.ribbons.map((r, i) => {
          const lY1 = CHART_TOP + r.leftY;
          const lY2 = lY1 + r.leftH;
          const rY1 = CHART_TOP + r.rightY;
          const rY2 = rY1 + r.rightH;
          const xL = LEFT_X + NODE_W;
          const xR = RIGHT_X;
          const midX = (xL + xR) / 2;
          const d =
            `M${xL},${lY1} C${midX},${lY1} ${midX},${rY1} ${xR},${rY1} ` +
            `L${xR},${rY2} C${midX},${rY2} ${midX},${lY2} ${xL},${lY2} Z`;
          const color = colorForSource(r.firstSource, leftSourceOrder);
          const firstTotal = firstTotals.get(r.firstSource) ?? r.users;
          const share = firstTotal > 0 ? (r.users / firstTotal) * 100 : 0;
          const active =
            tip &&
            tip.firstSource === r.firstSource &&
            tip.lastSource === r.lastSource;
          return (
            <path
              key={i}
              d={d}
              fill={color}
              opacity={active ? 0.95 : 0.5}
              stroke={active ? "#1f1b16" : "none"}
              strokeWidth={active ? 1.4 : 0}
              onMouseEnter={(e) =>
                setTip({
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                  firstSource: r.firstSource,
                  lastSource: r.lastSource,
                  users: r.users,
                  share,
                })
              }
              onMouseMove={(e) =>
                setTip((cur) =>
                  cur
                    ? { ...cur, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }
                    : cur,
                )
              }
            />
          );
        })}

        {/* Left nodes */}
        <g filter="url(#flowRough)">
          {layout.leftNodes.map((n) => {
            const y = CHART_TOP + n.y;
            const color = colorForSource(n.source, leftSourceOrder);
            return (
              <g key={`l-${n.source}`}>
                <rect
                  x={LEFT_X}
                  y={y}
                  width={NODE_W}
                  height={n.height}
                  fill={color}
                  opacity={0.85}
                  stroke="#2b2620"
                  strokeWidth={1.4}
                />
                <text
                  x={LEFT_X + NODE_W / 2}
                  y={y + n.height / 2 + 2}
                  textAnchor="middle"
                  className={styles.flowNodeLabel}
                >
                  {n.source} · {n.total}
                </text>
              </g>
            );
          })}
        </g>

        {/* Right nodes */}
        <g filter="url(#flowRough)">
          {layout.rightNodes.map((n) => {
            const y = CHART_TOP + n.y;
            const color = colorForSource(n.source, leftSourceOrder);
            return (
              <g key={`r-${n.source}`}>
                <rect
                  x={RIGHT_X}
                  y={y}
                  width={NODE_W}
                  height={n.height}
                  fill={color}
                  opacity={0.85}
                  stroke="#2b2620"
                  strokeWidth={1.4}
                />
                <text
                  x={RIGHT_X + NODE_W / 2}
                  y={y + n.height / 2 + 2}
                  textAnchor="middle"
                  className={styles.flowNodeLabel}
                >
                  {n.source} · {n.total}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {tip && (
        <div
          className={styles.flowTip}
          style={{
            left: `calc(${(tip.x / SVG_W) * 100}% + 12px)`,
            top: `calc(${(tip.y / SVG_H) * 100}% + 12px)`,
          }}
        >
          <div className={styles.flowTipPair}>
            <strong>{tip.firstSource}</strong> → <strong>{tip.lastSource}</strong>
          </div>
          <div className={styles.flowTipBody}>
            <span className={styles.flowTipNum}>{tip.users} users</span>
            <span className={styles.flowTipPct}>
              {tip.share.toFixed(1)}% of {tip.firstSource}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Append styles to `dashboard.module.css`**

Append to the end of `app/(private)/dashboard/dashboard.module.css`:

```css
.flowWrap {
  position: relative;
  width: 100%;
}
.flowSvg {
  width: 100%;
  height: auto;
  display: block;
}
.flowAxis {
  font-family: 'Kalam', cursive;
  font-weight: 700;
  font-size: 14px;
  fill: var(--ink);
}
.flowNodeLabel {
  font-family: 'Caveat', cursive;
  font-size: 14px;
  fill: #fff;
}
.flowEmpty {
  padding: 48px 16px;
  text-align: center;
  color: #8a8275;
  font-family: 'Caveat', cursive;
  font-size: 20px;
}
.flowTip {
  position: absolute;
  background: var(--ink);
  color: var(--paper);
  border-radius: 4px;
  padding: 8px 12px;
  font-family: 'Kalam', cursive;
  font-size: 13px;
  line-height: 1.35;
  pointer-events: none;
  box-shadow: 2px 3px 0 rgba(0, 0, 0, 0.18);
  z-index: 2;
}
.flowTipPair {
  font-family: 'Caveat', cursive;
  font-size: 16px;
  color: #d9d2c1;
  margin-bottom: 2px;
}
.flowTipBody {
  display: flex;
  gap: 10px;
  align-items: baseline;
}
.flowTipNum {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}
.flowTipPct {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--accent);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(private\)/dashboard/AttributionFlow.tsx app/\(private\)/dashboard/dashboard.module.css
git commit -m "feat(dashboard): add AttributionFlow Sankey component"
```

---

## Task 6: `FlowTable` server component

**Files:**
- Create: `app/(private)/dashboard/FlowTable.tsx`
- Modify: `app/(private)/dashboard/dashboard.module.css` (append)

- [ ] **Step 1: Create the component**

Create `app/(private)/dashboard/FlowTable.tsx`:

```tsx
import type { SourceFlow } from "./attribution-data";
import styles from "./dashboard.module.css";
import { CHANNEL_COLORS } from "./funnel-data";

const DEFAULT_LIMIT = 10;

function colorForSource(source: string, sources: string[]): string {
  const idx = sources.indexOf(source);
  if (idx < 0) return CHANNEL_COLORS[CHANNEL_COLORS.length - 1];
  return CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
}

export default function FlowTable({
  flows,
  expandAll = false,
  expandHref,
}: {
  flows: SourceFlow[];
  expandAll?: boolean;
  expandHref?: string;
}) {
  if (flows.length === 0) return null;

  const firstTotals = new Map<string, number>();
  for (const f of flows) {
    firstTotals.set(f.firstSource, (firstTotals.get(f.firstSource) ?? 0) + f.users);
  }

  const maxUsers = flows.reduce((m, f) => (f.users > m ? f.users : m), 0);

  const visible = expandAll ? flows : flows.slice(0, DEFAULT_LIMIT);
  const hiddenCount = expandAll ? 0 : Math.max(0, flows.length - DEFAULT_LIMIT);

  // Stable color order: largest first-source totals first.
  const sourceOrder = [...firstTotals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([s]) => s);

  return (
    <table className={styles.flowTable}>
      <thead>
        <tr>
          <th>from</th>
          <th />
          <th>to</th>
          <th style={{ textAlign: "right" }}>users</th>
          <th style={{ textAlign: "right" }}>share</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {visible.map((f) => {
          const firstTotal = firstTotals.get(f.firstSource) ?? f.users;
          const share = firstTotal > 0 ? (f.users / firstTotal) * 100 : 0;
          const barPct = maxUsers > 0 ? (f.users / maxUsers) * 100 : 0;
          const color = colorForSource(f.firstSource, sourceOrder);
          return (
            <tr key={`${f.firstSource}>${f.lastSource}`}>
              <td className={styles.flowSrc}>
                <span className={styles.flowSwatch} style={{ background: color }} />
                {f.firstSource}
              </td>
              <td className={styles.flowArrow}>→</td>
              <td className={styles.flowDst}>{f.lastSource}</td>
              <td className={styles.flowCount}>{f.users}</td>
              <td className={styles.flowPct}>{share.toFixed(0)}%</td>
              <td className={styles.flowBarCell}>
                <div className={styles.flowBarBg}>
                  <div
                    className={styles.flowBarFill}
                    style={{ width: `${barPct}%`, background: color }}
                  />
                </div>
              </td>
            </tr>
          );
        })}
        {hiddenCount > 0 && expandHref && (
          <tr className={styles.flowExpandRow}>
            <td colSpan={6}>
              <a href={expandHref}>… show all ({hiddenCount} more)</a>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Append styles to `dashboard.module.css`**

Append:

```css
.flowTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  margin-top: 6px;
}
.flowTable thead {
  border-bottom: 1.5px solid var(--line);
}
.flowTable th {
  text-align: left;
  padding: 8px 10px;
  font-family: 'Kalam', cursive;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 12px;
  color: var(--ink-2);
}
.flowTable td {
  padding: 7px 10px;
  border-bottom: 1px dashed var(--faint);
}
.flowSrc,
.flowDst {
  font-family: 'Kalam', cursive;
  font-weight: 600;
}
.flowArrow {
  color: #8a8275;
  font-family: 'Caveat', cursive;
  font-size: 18px;
  padding: 0 4px;
}
.flowCount {
  font-family: 'JetBrains Mono', monospace;
  text-align: right;
}
.flowPct {
  font-family: 'JetBrains Mono', monospace;
  text-align: right;
  color: #8a8275;
  font-size: 13px;
}
.flowBarCell {
  width: 90px;
}
.flowBarBg {
  width: 90px;
  height: 8px;
  background: var(--faint);
  border-radius: 3px;
  overflow: hidden;
}
.flowBarFill {
  height: 100%;
  opacity: 0.7;
}
.flowSwatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: middle;
  border: 1px solid var(--line);
}
.flowExpandRow td {
  text-align: center;
  padding-top: 10px;
  font-family: 'Caveat', cursive;
  font-size: 16px;
  color: #8a8275;
}
.flowExpandRow a {
  color: inherit;
  text-decoration: underline dotted;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\(private\)/dashboard/FlowTable.tsx app/\(private\)/dashboard/dashboard.module.css
git commit -m "feat(dashboard): add FlowTable component"
```

---

## Task 7: Wire the new section into the dashboard page

**Files:**
- Modify: `app/(private)/dashboard/page.tsx`

- [ ] **Step 1: Update imports**

At the top of `app/(private)/dashboard/page.tsx`, alongside the existing `loadDashboardData` import, add:

```ts
import { withParams } from "@/app/lib/url";

import { loadAttributionData } from "./attribution-data";
import AttributionFlow from "./AttributionFlow";
import FlowTable from "./FlowTable";
```

- [ ] **Step 2: Parallel-load attribution data**

Replace the existing call

```ts
const { steps, channels, allSources } = await loadDashboardData({
  from: from ?? undefined,
  to: to ?? undefined,
  source: sourceParam ?? undefined,
});
```

with:

```ts
const [{ steps, channels, allSources }, attribution] = await Promise.all([
  loadDashboardData({
    from: from ?? undefined,
    to: to ?? undefined,
    source: sourceParam ?? undefined,
  }),
  loadAttributionData({
    from: from ?? undefined,
    to: to ?? undefined,
  }),
]);
```

- [ ] **Step 3: Compute the table expand state and href**

Before the JSX `return`, add:

```ts
const flowsExpanded =
  (Array.isArray(sp.flows) ? sp.flows[0] : sp.flows) === "all";
const flowsExpandHref = withParams("/dashboard", {
  ...sp,
  flows: flowsExpanded ? "" : "all",
});
```

- [ ] **Step 4: Add the new section to the rendered JSX**

After the closing `</div>` of the existing `<div className={styles.body}>` block, before the closing `</main>`, insert:

```tsx
<div className={styles.section}>
  <div className={`${styles.card} ${styles.flowCard}`}>
    <div className={styles.cardTitle}>Source flow — first → last</div>
    <div className={styles.cardSub}>
      where users came from on their first vs. most recent visit ·{" "}
      {attribution.totalUsers} users in this window
    </div>
    <AttributionFlow
      flows={attribution.flows}
      totalUsers={attribution.totalUsers}
    />
    <FlowTable
      flows={attribution.flows}
      expandAll={flowsExpanded}
      expandHref={flowsExpandHref}
    />
  </div>
</div>
```

- [ ] **Step 5: Append container styles to `dashboard.module.css`**

```css
.section {
  padding: 8px 32px 24px;
}
.flowCard {
  padding: 18px 22px;
}
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including pre-existing dashboard-data, tracking, source, url tests).

- [ ] **Step 8: Commit**

```bash
git add app/\(private\)/dashboard/page.tsx app/\(private\)/dashboard/dashboard.module.css
git commit -m "feat(dashboard): render attribution flow section"
```

---

## Task 8: Manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open `http://localhost:3000`.

- [ ] **Step 2: New visitor, named source**

Open an Incognito window. Navigate to `/<funnelId>/0?utm_source=google` (use any funnel id from `app/config/funnels.ts`).

Then in a Supabase SQL editor (or psql):

```sql
select user_id, first_source, first_seen_at, last_source, last_seen_at
from user_attribution
order by first_seen_at desc
limit 5;
```

Expected: a new row with `first_source = 'google'`, `last_source = 'google'`, both timestamps near "now".

- [ ] **Step 3: Same visitor returns with a different source**

In the same Incognito window (so the `userId` cookie persists), navigate to `/<funnelId>/0?utm_source=facebook`.

Re-run the SQL query. Expected: same row, `first_source = 'google'` (unchanged), `last_source = 'facebook'`, `last_seen_at` updated to now.

- [ ] **Step 4: Same visitor returns directly (no utm_source)**

In the same Incognito window, navigate to `/<funnelId>/0`.

Re-run the SQL query. Expected: `last_source = 'Direct'`, `last_seen_at` updated again. `first_source` still `'google'`.

- [ ] **Step 5: Dashboard renders the section**

Log in to `/dashboard`. Verify:
- A "Source flow — first → last" card appears below the funnel.
- The Sankey shows nodes for the test sources.
- Hovering a ribbon shows a tooltip with the form `<first> → <last>`, user count, and `% of <first>`.
- The flow table below the Sankey lists the top flows with counts and shares.
- Adjusting the date filter scopes the section to users whose `first_seen_at` falls in range.

- [ ] **Step 6: Stop the dev server**

`Ctrl-C` in the dev terminal.

---

## Self-review notes

Spec coverage:

- Schema → Task 1.
- Backfill → Task 1 step 2 verification query.
- Write-path (`recordEvent` extension, FK ordering, two-phase upsert+update) → Task 2.
- Read-path (`loadAttributionData`, `flows[]`, date scoping by `first_seen_at`) → Task 3.
- Sankey + tooltip + hover focus → Tasks 4 + 5.
- Top-flows table with top-10 default + expand row → Task 6.
- Dashboard wiring + parallel load → Task 7.
- Smoke test (new visitor, returning visitor, direct return) → Task 8.

Out of scope (per spec): existing `SourceFilter` semantics, additional UTM dimensions, multi-touch attribution, click-to-filter from the Sankey. Not in any task — intentional.

Edge cases covered: empty range, invalid date strings, supabase error, null data, user-with-no-events-in-range, concurrent events (documented limitation in the spec; no task — accepted risk).
