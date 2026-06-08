# Funnel Config Data Layer (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move funnel config from the static `app/config/funnels.ts` object into Supabase with immutable versioning and first-touch per-user version pinning, so the public funnel renders from the DB while behaving identically to today.

**Architecture:** Three tables (`funnels`, `funnel_versions`, `funnel_assignments`) plus a new `events.funnel_version_id`. A zod schema is the single parse point for JSONB→typed config. The public read path resolves a user's pinned version (creating a sticky assignment on first visit), loads that immutable version's config through `unstable_cache` keyed by version id, and renders. `funnels.ts` becomes a one-time seed source.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (`@supabase/supabase-js`, service-role server client), zod (new), vitest (unit), Playwright (regression e2e), tsx (seed runner).

> **Commit convention for this repo:** commits happen **only when the user explicitly asks**. Treat each "Checkpoint" step as a natural commit point — run the shown `git` command only on request; otherwise just verify and continue.

> **Reference:** `unstable_cache` API — `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md`. We deliberately do **not** use `use cache` because it requires the global `cacheComponents: true` flag (out of scope for a behavior-identical Phase A — see the design doc).

---

## File map

**Created:**

- `app/lib/funnels/schema.ts` — `QuestionType` enum, zod schemas, inferred types, `parseFunnelConfig`, `ensureScreenIds`.
- `app/lib/funnels/read.ts` — `getVersionConfig`, `getAssignedVersionId`, `getFunnelForUser`, `funnelExists`.
- `app/lib/funnels/publish.ts` — `publishVersion`.
- `scripts/seed-funnels.ts` — idempotent seed from `funnelsConfig`.
- `supabase/migrations/20260607000000_create_funnel_config.sql` + `supabase/rollbacks/20260607000000_create_funnel_config.down.sql`.
- Tests: `__tests__/funnel-schema.test.ts`, `__tests__/funnel-read.test.ts`, `__tests__/funnel-publish.test.ts`.

**Modified:**

- `app/types/funnel.ts` — becomes a thin **relative** re-export of `../lib/funnels/schema` (no `@/` so the tsx seed resolves it).
- `app/lib/tracking.ts` — `recordEvent` gains a `funnelVersionId` param.
- `app/actions/tracking.ts` — `recordBuyEvent` resolves the version via `getAssignedVersionId`.
- `app/(public)/[funnelId]/page.tsx` — funnel-exists check before redirect.
- `app/(public)/[funnelId]/[screenIndex]/page.tsx` — read config via `getFunnelForUser`; pass `versionId` to tracking.
- `app/(public)/[funnelId]/paywall/page.tsx` — same.
- `__tests__/tracking.test.ts` — assert `funnel_version_id` is written.
- `package.json` — add `zod`, `tsx` (dev), `seed` script.

> **Note on `screen.id`:** the schema makes `id` **optional** so the existing hand-authored `funnelsConfig` (no ids) still typechecks. The write paths (`ensureScreenIds`, called by seed and Phase-B publish) guarantee every **stored** screen has an id. Ids are generated with `crypto.randomUUID()` (already used in `proxy.ts`; no new dep).

---

### Task 1: Add dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install runtime + dev deps**

Run:

```bash
npm install zod
npm install -D tsx
```

Expected: both added to `package.json`; lockfile updated.

- [ ] **Step 2: Add the seed script entry**

In `package.json` `"scripts"`, add:

```json
"seed": "tsx scripts/seed-funnels.ts"
```

- [ ] **Step 3: Verify install**

Run: `node -e "require('zod'); console.log('zod ok')"`
Expected: `zod ok`

- [ ] **Step 4: Checkpoint**

```bash
git add package.json package-lock.json
git commit -m "chore: add zod and tsx for funnel config data layer"
```

---

### Task 2: Config schema + typed parsing

**Files:**

- Create: `app/lib/funnels/schema.ts`
- Modify: `app/types/funnel.ts`
- Test: `__tests__/funnel-schema.test.ts`

- [ ] **Step 1: Write the failing test**

`__tests__/funnel-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ensureScreenIds,
  parseFunnelConfig,
  QuestionType,
} from "@/app/lib/funnels/schema";

describe("parseFunnelConfig", () => {
  it("accepts a valid rowList + email + voice config", () => {
    const cfg = {
      screens: [
        {
          title: { text: "Age?" },
          type: QuestionType.rowList,
          componentProps: { list: [{ text: "18-29" }] },
        },
        {
          title: { text: "Email" },
          type: QuestionType.email,
          componentProps: { buttonText: "Continue" },
        },
        {
          title: { text: "Speak" },
          type: QuestionType.voice,
          componentProps: {
            recordButtonText: "Hold",
            continueButtonText: "Next",
          },
        },
      ],
    };
    expect(parseFunnelConfig(cfg).screens).toHaveLength(3);
  });

  it("rejects an unknown question type", () => {
    expect(() =>
      parseFunnelConfig({
        screens: [{ title: { text: "x" }, type: "slider" }],
      }),
    ).toThrow();
  });

  it("rejects a rowList screen missing componentProps.list", () => {
    expect(() =>
      parseFunnelConfig({
        screens: [
          {
            title: { text: "x" },
            type: QuestionType.rowList,
            componentProps: {},
          },
        ],
      }),
    ).toThrow();
  });
});

describe("ensureScreenIds", () => {
  it("fills missing screen ids and preserves existing ones", () => {
    const out = ensureScreenIds({
      screens: [
        {
          title: { text: "a" },
          type: QuestionType.email,
          componentProps: { buttonText: "Go" },
        },
        {
          id: "keep",
          title: { text: "b" },
          type: QuestionType.email,
          componentProps: { buttonText: "Go" },
        },
      ],
    });
    expect(out.screens[0].id).toEqual(expect.any(String));
    expect(out.screens[0].id).not.toEqual("");
    expect(out.screens[1].id).toBe("keep");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/funnel-schema.test.ts`
Expected: FAIL — cannot resolve `@/app/lib/funnels/schema`.

- [ ] **Step 3: Write the schema module**

`app/lib/funnels/schema.ts`:

```ts
import { z } from "zod";

export enum QuestionType {
  rowList = "rowList",
  email = "email",
  voice = "voice",
}

const titleSchema = z.object({
  text: z.string(),
  tailwindcss: z.string().optional(),
});

const baseScreen = {
  // Optional so the hand-authored seed (no ids) typechecks; the write paths
  // (ensureScreenIds) guarantee stored screens always carry an id.
  id: z.string().optional(),
  title: titleSchema,
  subtitle: titleSchema.optional(),
};

const rowListScreenSchema = z.object({
  ...baseScreen,
  type: z.literal(QuestionType.rowList),
  componentProps: z.object({
    list: z.array(z.object({ text: z.string() })),
  }),
});

const emailScreenSchema = z.object({
  ...baseScreen,
  type: z.literal(QuestionType.email),
  componentProps: z.object({
    placeholder: z.string().optional(),
    buttonText: z.string(),
  }),
});

const voiceScreenSchema = z.object({
  ...baseScreen,
  type: z.literal(QuestionType.voice),
  componentProps: z.object({
    recordButtonText: z.string(),
    continueButtonText: z.string(),
  }),
});

export const questionConfigSchema = z.discriminatedUnion("type", [
  rowListScreenSchema,
  emailScreenSchema,
  voiceScreenSchema,
]);

export const funnelConfigSchema = z.object({
  screens: z.array(questionConfigSchema),
});

export type QuestionTitleConfig = z.infer<typeof titleSchema>;
export type RowListQuestionConfig = z.infer<typeof rowListScreenSchema>;
export type EmailQuestionConfig = z.infer<typeof emailScreenSchema>;
export type VoiceQuestionConfig = z.infer<typeof voiceScreenSchema>;
export type QuestionConfig = z.infer<typeof questionConfigSchema>;
export type FunnelConfig = z.infer<typeof funnelConfigSchema>;

export function parseFunnelConfig(data: unknown): FunnelConfig {
  return funnelConfigSchema.parse(data);
}

export function ensureScreenIds(config: FunnelConfig): FunnelConfig {
  return {
    ...config,
    screens: config.screens.map((s) =>
      s.id ? s : { ...s, id: crypto.randomUUID() },
    ),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/funnel-schema.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Rewire `app/types/funnel.ts` to re-export the schema (relative path)**

Replace the entire contents of `app/types/funnel.ts` with:

```ts
// Single source of truth lives in the zod schema. Re-exported here so existing
// imports (`@/app/types/funnel`) keep working. Relative path (no `@/`) so the
// tsx seed script resolves it without tsconfig path mapping.
export {
  ensureScreenIds,
  funnelConfigSchema,
  parseFunnelConfig,
  questionConfigSchema,
  QuestionType,
} from "../lib/funnels/schema";

export type {
  EmailQuestionConfig,
  FunnelConfig,
  QuestionConfig,
  QuestionTitleConfig,
  RowListQuestionConfig,
  VoiceQuestionConfig,
} from "../lib/funnels/schema";
```

- [ ] **Step 6: Verify nothing else broke (typecheck + full unit suite)**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all existing tests still pass. (`funnelsConfig` typechecks because `id` is optional.)

- [ ] **Step 7: Checkpoint**

```bash
git add app/lib/funnels/schema.ts app/types/funnel.ts __tests__/funnel-schema.test.ts
git commit -m "feat: zod schema as single source of truth for funnel config"
```

---

### Task 3: Database migration

**Files:**

- Create: `supabase/migrations/20260607000000_create_funnel_config.sql`
- Create: `supabase/rollbacks/20260607000000_create_funnel_config.down.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260607000000_create_funnel_config.sql`:

```sql
create table funnels (
  id                 text primary key,
  name               text not null,
  draft_config       jsonb not null,
  current_version_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table funnel_versions (
  id           uuid primary key default gen_random_uuid(),
  funnel_id    text not null references funnels(id) on delete cascade,
  version      int not null,
  config       jsonb not null,
  published_at timestamptz not null default now(),
  unique (funnel_id, version)
);

alter table funnels
  add constraint funnels_current_version_fk
  foreign key (current_version_id) references funnel_versions(id);

create table funnel_assignments (
  user_id     uuid not null references users(id) on delete cascade,
  funnel_id   text not null references funnels(id) on delete cascade,
  version_id  uuid not null references funnel_versions(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, funnel_id)
);

create index funnel_versions_funnel_id_idx on funnel_versions(funnel_id);

alter table events add column funnel_version_id uuid references funnel_versions(id);
create index events_funnel_version_id_idx on events(funnel_version_id);
```

- [ ] **Step 2: Write the rollback**

`supabase/rollbacks/20260607000000_create_funnel_config.down.sql`:

```sql
drop index if exists events_funnel_version_id_idx;
alter table events drop column if exists funnel_version_id;
drop table if exists funnel_assignments;
alter table funnels drop constraint if exists funnels_current_version_fk;
drop table if exists funnel_versions;
drop table if exists funnels;
```

- [ ] **Step 3: Apply the migration to the dev database**

Apply via your usual Supabase workflow (CLI `supabase db push`, or paste the SQL into the SQL editor / MCP `apply_migration`).
Expected: three tables created, `events.funnel_version_id` added, no errors.

- [ ] **Step 4: Verify schema**

Run a query (SQL editor / MCP): `select column_name from information_schema.columns where table_name = 'events' and column_name = 'funnel_version_id';`
Expected: one row.

- [ ] **Step 5: Checkpoint**

```bash
git add supabase/migrations/20260607000000_create_funnel_config.sql supabase/rollbacks/20260607000000_create_funnel_config.down.sql
git commit -m "feat: funnel config tables + events.funnel_version_id"
```

---

### Task 4: Public read path

**Files:**

- Create: `app/lib/funnels/read.ts`
- Test: `__tests__/funnel-read.test.ts`

- [ ] **Step 1: Write the failing test**

`__tests__/funnel-read.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionType } from "@/app/lib/funnels/schema";

// unstable_cache → pass-through so we test the underlying fetch directly.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const VALID_CONFIG = {
  screens: [
    {
      id: "s1",
      title: { text: "Age" },
      type: QuestionType.rowList,
      componentProps: { list: [{ text: "18-29" }] },
    },
  ],
};

// Per-table canned results, set by each test.
const results: Record<string, unknown> = {};

const { mockFrom, mockUpsert } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockUpsert: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/app/lib/supabase/server", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

// Chainable query builder: every .eq/.select/.order/.limit returns `this`;
// terminals (.maybeSingle/.single) resolve the table's canned result.
function builder(table: string) {
  const resolve = () =>
    Promise.resolve(results[table] ?? { data: null, error: null });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: resolve,
    single: resolve,
    upsert: mockUpsert,
  };
  return chain;
}

import { getAssignedVersionId, getFunnelForUser } from "@/app/lib/funnels/read";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(results)) delete results[k];
  mockFrom.mockImplementation((table: string) => builder(table));
  mockUpsert.mockResolvedValue({ error: null });
});

describe("getAssignedVersionId", () => {
  it("returns the pinned version when an assignment exists", async () => {
    results.funnel_assignments = {
      data: { version_id: "v-pinned" },
      error: null,
    };
    expect(await getAssignedVersionId("u1", "quiz-1")).toBe("v-pinned");
  });

  it("returns null when no assignment exists", async () => {
    results.funnel_assignments = { data: null, error: null };
    expect(await getAssignedVersionId("u1", "quiz-1")).toBeNull();
  });
});

describe("getFunnelForUser", () => {
  it("reuses an existing pin even if the funnel moved to a newer version", async () => {
    results.funnel_assignments = { data: { version_id: "v1" }, error: null };
    results.funnel_versions = { data: { config: VALID_CONFIG }, error: null };

    const out = await getFunnelForUser("quiz-1", "u1");
    expect(out?.versionId).toBe("v1");
    expect(out?.config.screens).toHaveLength(1);
    expect(mockUpsert).not.toHaveBeenCalled(); // no new assignment created
  });

  it("pins the current version on first visit", async () => {
    // First assignment read: none. funnel has a current version. Re-read: pinned.
    results.funnel_assignments = { data: null, error: null };
    results.funnels = { data: { current_version_id: "v2" }, error: null };
    results.funnel_versions = { data: { config: VALID_CONFIG }, error: null };

    const out = await getFunnelForUser("quiz-1", "u1");
    expect(out?.versionId).toBe("v2");
    // upsert called twice: users row + funnel_assignments row.
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("returns null for an unknown / unpublished funnel", async () => {
    results.funnel_assignments = { data: null, error: null };
    results.funnels = { data: null, error: null };
    expect(await getFunnelForUser("nope", "u1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/funnel-read.test.ts`
Expected: FAIL — cannot resolve `@/app/lib/funnels/read`.

- [ ] **Step 3: Write the read module**

`app/lib/funnels/read.ts`:

```ts
import { unstable_cache } from "next/cache";

import { createServerClient } from "@/app/lib/supabase/server";

import { type FunnelConfig, parseFunnelConfig } from "./schema";

async function fetchVersionConfig(versionId: string): Promise<FunnelConfig> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("funnel_versions")
    .select("config")
    .eq("id", versionId)
    .single();
  if (error || !data)
    throw error ?? new Error(`Version not found: ${versionId}`);
  return parseFunnelConfig(data.config);
}

// Versions are immutable, so caching by version id never needs invalidation.
const cachedVersionConfig = unstable_cache(
  fetchVersionConfig,
  ["funnel-version"],
  {
    tags: ["funnel-version"],
  },
);

export function getVersionConfig(versionId: string): Promise<FunnelConfig> {
  return cachedVersionConfig(versionId);
}

export async function getAssignedVersionId(
  userId: string,
  funnelId: string,
): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("funnel_assignments")
    .select("version_id")
    .eq("user_id", userId)
    .eq("funnel_id", funnelId)
    .maybeSingle();
  return data?.version_id ?? null;
}

export async function funnelExists(funnelId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("funnels")
    .select("id")
    .eq("id", funnelId)
    .maybeSingle();
  return Boolean(data);
}

export async function getFunnelForUser(
  funnelId: string,
  userId?: string,
): Promise<{ config: FunnelConfig; versionId: string } | null> {
  const supabase = createServerClient();

  let versionId = userId ? await getAssignedVersionId(userId, funnelId) : null;

  if (!versionId) {
    const { data: funnel } = await supabase
      .from("funnels")
      .select("current_version_id")
      .eq("id", funnelId)
      .maybeSingle();
    if (!funnel?.current_version_id) return null;
    versionId = funnel.current_version_id as string;

    if (userId) {
      // Ensure the user row exists so the assignment FK is satisfiable.
      await supabase
        .from("users")
        .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
      // Sticky first-touch pin; ignoreDuplicates makes concurrent first
      // requests race-safe (first insert wins).
      await supabase
        .from("funnel_assignments")
        .upsert(
          { user_id: userId, funnel_id: funnelId, version_id: versionId },
          { onConflict: "user_id,funnel_id", ignoreDuplicates: true },
        );
      // Re-read in case a concurrent request pinned a different version first.
      versionId = (await getAssignedVersionId(userId, funnelId)) ?? versionId;
    }
  }

  const config = await getVersionConfig(versionId);
  return { config, versionId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/funnel-read.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Checkpoint**

```bash
git add app/lib/funnels/read.ts __tests__/funnel-read.test.ts
git commit -m "feat: version-pinned funnel config read path"
```

---

### Task 5: Publish helper

**Files:**

- Create: `app/lib/funnels/publish.ts`
- Test: `__tests__/funnel-publish.test.ts`

- [ ] **Step 1: Write the failing test**

`__tests__/funnel-publish.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionType } from "@/app/lib/funnels/schema";

const DRAFT = {
  screens: [
    {
      id: "s1",
      title: { text: "Email" },
      type: QuestionType.email,
      componentProps: { buttonText: "Go" },
    },
  ],
};

const results: Record<string, unknown> = {};
const calls: { insert?: unknown; update?: unknown } = {};

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/app/lib/supabase/server", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

function builder(table: string) {
  const resolve = () =>
    Promise.resolve(results[table] ?? { data: null, error: null });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: resolve,
    single: resolve,
    insert: (row: unknown) => {
      calls.insert = row;
      return chain;
    },
    update: (row: unknown) => {
      calls.update = row;
      return chain;
    },
  };
  return chain;
}

import { publishVersion } from "@/app/lib/funnels/publish";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(results)) delete results[k];
  delete calls.insert;
  delete calls.update;
  mockFrom.mockImplementation((table: string) => builder(table));
});

describe("publishVersion", () => {
  it("snapshots the draft into version max+1 and repoints current_version_id", async () => {
    // funnels.single → draft. funnel_versions: the latest-version read
    // (.maybeSingle) returns version 4; the insert's .single returns the new id.
    mockFrom.mockImplementation((table: string) => {
      const b = builder(table);
      if (table === "funnels") {
        b.single = () =>
          Promise.resolve({ data: { draft_config: DRAFT }, error: null });
      }
      if (table === "funnel_versions") {
        b.maybeSingle = () =>
          Promise.resolve({ data: { version: 4 }, error: null });
        b.single = () =>
          Promise.resolve(
            calls.insert
              ? { data: { id: "new-version-id" }, error: null }
              : { data: { version: 4 }, error: null },
          );
      }
      return b;
    });

    const id = await publishVersion("quiz-1");
    expect(id).toBe("new-version-id");
    expect((calls.insert as { version: number }).version).toBe(5);
    expect(
      (calls.update as { current_version_id: string }).current_version_id,
    ).toBe("new-version-id");
  });

  it("starts at version 1 when no versions exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      const b = builder(table);
      if (table === "funnels") {
        b.single = () =>
          Promise.resolve({ data: { draft_config: DRAFT }, error: null });
      }
      if (table === "funnel_versions") {
        b.maybeSingle = () => Promise.resolve({ data: null, error: null }); // no latest
        b.single = () =>
          Promise.resolve({ data: { id: "v1-id" }, error: null });
      }
      return b;
    });
    await publishVersion("quiz-1");
    expect((calls.insert as { version: number }).version).toBe(1);
  });

  it("throws on an invalid draft", async () => {
    mockFrom.mockImplementation((table: string) => {
      const b = builder(table);
      if (table === "funnels") {
        b.single = () =>
          Promise.resolve({
            data: { draft_config: { screens: [{ type: "bad" }] } },
            error: null,
          });
      }
      return b;
    });
    await expect(publishVersion("quiz-1")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/funnel-publish.test.ts`
Expected: FAIL — cannot resolve `@/app/lib/funnels/publish`.

- [ ] **Step 3: Write the publish module**

`app/lib/funnels/publish.ts`:

```ts
import { createServerClient } from "@/app/lib/supabase/server";

import { ensureScreenIds, funnelConfigSchema } from "./schema";

// Snapshots the funnel's draft into a new immutable version and makes it
// current. Used by the seed (Phase A) and the editor's Publish button (Phase B).
export async function publishVersion(funnelId: string): Promise<string> {
  const supabase = createServerClient();

  const { data: funnel, error: fErr } = await supabase
    .from("funnels")
    .select("draft_config")
    .eq("id", funnelId)
    .single();
  if (fErr || !funnel) throw fErr ?? new Error(`Funnel not found: ${funnelId}`);

  // Validate + guarantee every screen has a stable id before freezing.
  const config = ensureScreenIds(funnelConfigSchema.parse(funnel.draft_config));

  const { data: latest } = await supabase
    .from("funnel_versions")
    .select("version")
    .eq("funnel_id", funnelId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((latest?.version as number | undefined) ?? 0) + 1;

  const { data: inserted, error: vErr } = await supabase
    .from("funnel_versions")
    .insert({ funnel_id: funnelId, version: nextVersion, config })
    .select("id")
    .single();
  if (vErr || !inserted) throw vErr ?? new Error("Failed to insert version");

  const { error: uErr } = await supabase
    .from("funnels")
    .update({
      current_version_id: inserted.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", funnelId);
  if (uErr) throw uErr;

  return inserted.id as string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/funnel-publish.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Checkpoint**

```bash
git add app/lib/funnels/publish.ts __tests__/funnel-publish.test.ts
git commit -m "feat: publishVersion snapshots draft into immutable version"
```

---

### Task 6: Seed script

**Files:**

- Create: `scripts/seed-funnels.ts`

> Uses **relative** imports only (no `@/`) and creates its own Supabase client via the relative `createServerClient`, so `tsx` runs it without tsconfig path mapping. Idempotent: re-running skips funnels that already have a published version.

- [ ] **Step 1: Write the seed script**

`scripts/seed-funnels.ts`:

```ts
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { funnelsConfig } from "../app/config/funnels";
import { ensureScreenIds } from "../app/lib/funnels/schema";
import { createServerClient } from "../app/lib/supabase/server";

async function main() {
  const supabase = createServerClient();

  for (const [funnelId, cfg] of Object.entries(funnelsConfig)) {
    const draft = ensureScreenIds(cfg);

    // Upsert the funnel row (draft = seeded config).
    const { error: upErr } = await supabase
      .from("funnels")
      .upsert(
        { id: funnelId, name: funnelId, draft_config: draft },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (upErr) throw upErr;

    // Already published? Skip (idempotent).
    const { data: funnel } = await supabase
      .from("funnels")
      .select("current_version_id")
      .eq("id", funnelId)
      .single();
    if (funnel?.current_version_id) {
      console.log(`= ${funnelId}: already has a version, skipping`);
      continue;
    }

    // Create version 1 = seeded config, point current_version_id at it.
    const { data: version, error: vErr } = await supabase
      .from("funnel_versions")
      .insert({ funnel_id: funnelId, version: 1, config: draft })
      .select("id")
      .single();
    if (vErr || !version) throw vErr ?? new Error("insert version failed");

    const { error: ptrErr } = await supabase
      .from("funnels")
      .update({ current_version_id: version.id })
      .eq("id", funnelId);
    if (ptrErr) throw ptrErr;

    console.log(`+ ${funnelId}: seeded v1 (${version.id})`);
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed against the dev database**

Run: `npm run seed`
Expected: logs `+ quiz-1: seeded v1 (...)` and `+ quiz-2: seeded v1 (...)`, then `Seed complete.`

- [ ] **Step 3: Verify idempotency**

Run: `npm run seed`
Expected: logs `= quiz-1: already has a version, skipping` (and quiz-2), no duplicate versions.

- [ ] **Step 4: Verify data**

Query (SQL editor / MCP): `select id, current_version_id is not null as live from funnels order by id;`
Expected: `quiz-1` and `quiz-2`, both `live = true`.

- [ ] **Step 5: Checkpoint**

```bash
git add scripts/seed-funnels.ts
git commit -m "feat: idempotent funnel seed from funnelsConfig"
```

---

### Task 7: Record version on events

**Files:**

- Modify: `app/lib/tracking.ts`
- Modify: `app/actions/tracking.ts`
- Test: `__tests__/tracking.test.ts`

- [ ] **Step 1: Update the failing test**

In `__tests__/tracking.test.ts`, update the existing `recordEvent` calls to pass a version id and assert it is written. Add this test inside the `describe("recordEvent", ...)` block:

```ts
it("writes funnel_version_id on the event", async () => {
  await recordEvent("user-abc", "quiz-1", "page_view", "0", "google", "ver-1");
  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ funnel_version_id: "ver-1" }),
  );
});
```

Also update the two existing assertions that check the full insert object (`inserts a page_view event with utm_source` and `records a buy event with utm_source`) to include `funnel_version_id: null` (those calls pass no version), e.g.:

```ts
await recordEvent("user-abc", "quiz-1", "page_view", "0", "google");
expect(mockInsert).toHaveBeenCalledWith({
  name: "page_view",
  funnel_id: "quiz-1",
  question_id: "0",
  user_id: "user-abc",
  utm_source: "google",
  funnel_version_id: null,
});
```

(Apply the same `funnel_version_id: null` addition to the buy-event exact-match assertion.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/tracking.test.ts`
Expected: FAIL — insert lacks `funnel_version_id`.

- [ ] **Step 3: Add the param to `recordEvent`**

In `app/lib/tracking.ts`, change the signature and the insert:

```ts
export async function recordEvent(
  userId: string,
  funnelId: string,
  name: "page_view" | "buy",
  questionId: string,
  utmSource: string,
  funnelVersionId: string | null = null,
): Promise<void> {
```

and update the events insert to include:

```ts
await supabase.from("events").insert({
  name,
  funnel_id: funnelId,
  question_id: questionId,
  user_id: userId,
  utm_source: utmSource,
  funnel_version_id: funnelVersionId,
});
```

- [ ] **Step 4: Resolve the version in `recordBuyEvent`**

In `app/actions/tracking.ts`, import the resolver and pass the version:

```ts
import { getAssignedVersionId } from "@/app/lib/funnels/read";
```

Inside `recordBuyEvent`, before calling `recordEvent`:

```ts
const versionId = await getAssignedVersionId(userId, funnelId);
await recordEvent(userId, funnelId, "buy", "paywall", utmSource, versionId);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/tracking.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint**

```bash
git add app/lib/tracking.ts app/actions/tracking.ts __tests__/tracking.test.ts
git commit -m "feat: record funnel_version_id on events"
```

---

### Task 8: Wire the public pages to the DB

**Files:**

- Modify: `app/(public)/[funnelId]/page.tsx`
- Modify: `app/(public)/[funnelId]/[screenIndex]/page.tsx`
- Modify: `app/(public)/[funnelId]/paywall/page.tsx`

- [ ] **Step 1: Funnel-exists check on the landing redirect**

Replace `app/(public)/[funnelId]/page.tsx` contents with:

```tsx
import { notFound, redirect } from "next/navigation";

import { funnelExists } from "@/app/lib/funnels/read";
import { withParams } from "@/app/lib/url";

export default async function FunnelLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { funnelId } = await params;
  const sp = await searchParams;
  if (!(await funnelExists(funnelId))) notFound();
  redirect(withParams(`/${funnelId}/0`, sp));
}
```

- [ ] **Step 2: Screen page reads config via `getFunnelForUser`**

In `app/(public)/[funnelId]/[screenIndex]/page.tsx`:

Replace the import of `funnelsConfig`:

```tsx
import { funnelsConfig } from "@/app/config/funnels";
```

with:

```tsx
import { getFunnelForUser } from "@/app/lib/funnels/read";
```

(Keep the `QuestionType` import from `@/app/types/funnel` — it is still used for `shouldPreloadVoice`.)

Replace the config lookup + cookie/tracking block. The new body, from after `const sp = await searchParams;` down to the end of the tracking block, becomes:

```tsx
const cookieStore = await cookies();
const userId = cookieStore.get("userId")?.value;

const result = await getFunnelForUser(funnelId, userId);
if (!result) notFound();
const { config, versionId } = result;

const screenIndex = parseInt(screenIndexStr, 10);
if (
  isNaN(screenIndex) ||
  screenIndex < 0 ||
  screenIndex >= config.screens.length
) {
  notFound();
}

const utmSource = getUtmSource(sp);

if (userId) {
  // Defer tracking until after the response is sent so the DB round-trips
  // don't block this screen's TTFB.
  after(async () => {
    try {
      await recordEvent(
        userId,
        funnelId,
        "page_view",
        screenIndexStr,
        utmSource,
        versionId,
      );
    } catch (err) {
      console.error("[tracking] recordPageView failed:", err);
    }
  });
}
```

(The rest — `screen`, `shouldPreloadVoice`, `nextHref`, `prevHref`, JSX — is unchanged. Delete the now-removed old `const config = funnelsConfig[...]` and old `if (!config) notFound()` lines.)

- [ ] **Step 3: Paywall page reads version via `getFunnelForUser`**

In `app/(public)/[funnelId]/paywall/page.tsx`:

Replace:

```tsx
import { funnelsConfig } from "@/app/config/funnels";
```

with:

```tsx
import { getFunnelForUser } from "@/app/lib/funnels/read";
```

Replace the lookup + tracking block (lines doing `const config = funnelsConfig[...]` through the `recordEvent` call) with:

```tsx
const cookieStore = await cookies();
const userId = cookieStore.get("userId")?.value;

const result = await getFunnelForUser(funnelId, userId);
if (!result) notFound();
const { versionId } = result;

const utmSource = getUtmSource(sp);

if (userId) {
  try {
    await recordEvent(
      userId,
      funnelId,
      "page_view",
      "paywall",
      utmSource,
      versionId,
    );
  } catch (err) {
    console.error("[tracking] recordPageView failed:", err);
  }
}
```

(JSX below is unchanged.)

- [ ] **Step 4: Typecheck + unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all unit tests pass.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 0 errors (pre-existing warnings in `__tests__/tracking.test.ts` are acceptable).

- [ ] **Step 6: Regression e2e (the behavior-identical gate)**

Ensure the dev DB is seeded (Task 6). Run: `npm run e2e`
Expected: existing `e2e/funnel.spec.ts`, `e2e/email.spec.ts`, `e2e/tracking.spec.ts` pass unchanged — proving the funnel behaves identically now that config comes from the DB.

- [ ] **Step 7: Production build**

Run: `npm run build`
Expected: build succeeds; the three funnel routes remain dynamic (`ƒ`).

- [ ] **Step 8: Checkpoint**

```bash
git add "app/(public)/[funnelId]/page.tsx" "app/(public)/[funnelId]/[screenIndex]/page.tsx" "app/(public)/[funnelId]/paywall/page.tsx"
git commit -m "feat: render public funnel from DB-backed versioned config"
```

---

## Self-review notes

- **Spec coverage:** tables (Task 3), versioning + pinning (Task 4), publish/snapshot (Task 5), seed + initial v1 (Task 6), `events.funnel_version_id` from assignment (Tasks 7 + read path), zod validation (Task 2), `unstable_cache` per version (Task 4), three public pages rewired (Task 8), regression e2e gate (Task 8 Step 6). Dashboard intentionally untouched.
- **`funnelsConfig` retained** as the seed source; no manual screen ids required (optional in schema, filled by `ensureScreenIds`).
- **Type names** are consistent across tasks: `parseFunnelConfig`, `ensureScreenIds`, `funnelConfigSchema`, `getFunnelForUser`, `getAssignedVersionId`, `funnelExists`, `getVersionConfig`, `publishVersion`.
- **Out of scope (Phase B):** editor UI/routes/actions, version-segmented dashboards, cookie-cached version id, static read fallback.
