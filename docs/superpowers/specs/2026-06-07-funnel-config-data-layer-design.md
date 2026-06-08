# Funnel Config Data Layer (Phase A) — Design

**Date:** 2026-06-07
**Status:** Approved design, pending spec review
**Topic:** Move funnel config from a static TypeScript object into Supabase, with versioning and per-user version pinning, so a future visual editor (Phase B) can edit funnels at runtime.

---

## Goal

Today `funnelsConfig` in `app/config/funnels.ts` is a static object compiled into the build. Public funnel pages import it directly. To support a runtime visual editor later, the config must become runtime-mutable data.

Phase A migrates the config into Supabase **without changing user-facing behavior**. After Phase A, the funnel renders identically — it just reads its config from the database instead of a static import. This makes the change low-risk and independently testable, and lays the foundation the editor (Phase B) builds on.

## Non-goals (explicitly deferred to Phase B)

- The visual editor UI, its routes, and its server actions.
- Any admin-facing CRUD of funnels.
- Version-segmented analytics dashboards. Phase A only _records_ the version on events; consuming it in the dashboard is later.
- Wiring `screen.id` into events for cross-version comparison (decided against for now).

---

## Core decisions (from brainstorming)

1. **Persistence:** fully dynamic — config lives in Supabase; public runtime reads from the DB; `funnels.ts` becomes the seed source.
2. **Versioning:** every publish is an immutable snapshot (a _version_). Required so analytics can tell exactly which variant a user ran.
3. **Version pinning:** first-touch sticky. When a user first enters a funnel, the current published version is pinned to them and persists across sessions. A user who started on v1, left, and returned after v2 shipped continues on v1. New visitors get v2. This mirrors the existing first-touch `user_attribution` pattern.
4. **Event version key:** events record `funnel_version_id` (the user's pinned version). `question_id` stays the positional screen index, as today. Because versions are immutable, the index→screen mapping is frozen per version, so `(funnel_version_id, question_id)` is unambiguous. The existing dashboard keeps working unchanged.
5. **Validation:** a zod schema is the single parse point for JSONB → typed `FunnelConfig`.

---

## Data model

### Table: `funnels` (mutable registry / working copy)

| column               | type                              | notes                                                |
| -------------------- | --------------------------------- | ---------------------------------------------------- |
| `id`                 | text PK                           | human-readable slug, e.g. `quiz-1`                   |
| `name`               | text not null                     | label for the admin UI                               |
| `draft_config`       | jsonb not null                    | working copy edited in Phase B                       |
| `current_version_id` | uuid null → `funnel_versions(id)` | the live published version; null until first publish |
| `created_at`         | timestamptz default now()         |                                                      |
| `updated_at`         | timestamptz default now()         |                                                      |

### Table: `funnel_versions` (immutable snapshots)

| column         | type                                            | notes                                            |
| -------------- | ----------------------------------------------- | ------------------------------------------------ |
| `id`           | uuid PK default gen_random_uuid()               |                                                  |
| `funnel_id`    | text not null → `funnels(id)` on delete cascade |                                                  |
| `version`      | int not null                                    | 1, 2, 3…; `unique (funnel_id, version)`          |
| `config`       | jsonb not null                                  | frozen `FunnelConfig` (screens carry their `id`) |
| `published_at` | timestamptz not null default now()              |                                                  |

Rows are **never updated** after creation. `funnels.current_version_id` references the FK _after_ the version exists, so the FK is added/wired in the right order (insert version → update funnel pointer).

### Table: `funnel_assignments` (per-user version pin)

| column        | type                                            | notes                       |
| ------------- | ----------------------------------------------- | --------------------------- |
| `user_id`     | uuid not null → `users(id)` on delete cascade   |                             |
| `funnel_id`   | text not null → `funnels(id)` on delete cascade |                             |
| `version_id`  | uuid not null → `funnel_versions(id)`           | the pinned version          |
| `assigned_at` | timestamptz not null default now()              |                             |
| PK            | `(user_id, funnel_id)`                          | one pin per user per funnel |

Index: PK covers the only lookup `(user_id, funnel_id)`.

### `events` — additive change

Add nullable column `funnel_version_id uuid null → funnel_versions(id)`. Existing rows keep `null`. `question_id` is unchanged (positional index / `'paywall'`). No change to the existing dashboard queries.

---

## Config shape & validation

`QuestionConfig` gains a stable `id: string` (nanoid) per screen, used by Phase B for keys/addressing and frozen into each version snapshot. It is **not** written to events in Phase A.

A zod schema mirrors the discriminated union and becomes the single source of truth for the config shape:

- New module `app/lib/funnels/schema.ts` exports `funnelConfigSchema` (and per-variant schemas) built on the existing `QuestionType` enum.
- `app/types/funnel.ts` re-exports `z.infer` types so the TS types and runtime schema cannot drift. The `QuestionType` enum stays as-is.
- `parseFunnelConfig(json): FunnelConfig` is the only place JSONB is turned into typed config. On failure it throws a typed validation error.

This same schema is reused by Phase B to validate a draft before publishing.

---

## Read path (public runtime)

New module `app/lib/funnels/read.ts`:

### `getFunnelForUser(funnelId, userId): { config, versionId }`

Dynamic (per-user). Resolves the pinned version:

1. Look up `funnel_assignments(user_id, funnel_id)`.
2. **If found** → use its `version_id`.
3. **If not found** (first entry):
   - Read `funnels.current_version_id`. If the funnel doesn't exist or has no published version → `notFound()`.
   - Ensure the `users` row exists (`upsert {id} ignoreDuplicates`) so the assignment FK is satisfiable.
   - Insert the assignment with `upsert ... ignoreDuplicates` on `(user_id, funnel_id)`. Concurrent first-requests race safely: whichever inserts first wins; the rest are ignored and re-read the same pin. (Same race-safety pattern as `user_attribution`.)
4. Load the version's config via the cached helper below.

### `getVersionConfig(versionId): FunnelConfig` — cached

Versions are immutable, so this is ideal to cache:

- Wrapped in `unstable_cache(fn, [versionId], { tags: ['funnel-version:' + versionId] })`, keyed by `versionId`.
- Because versions never change, **no invalidation is ever needed** — the key alone guarantees correctness.
- `unstable_cache` is used (not `use cache`) deliberately: `use cache` requires enabling `cacheComponents: true` globally, which flips Cache Components/PPR semantics across every page and is out of scope for a behavior-identical Phase A.
- Reads `funnel_versions.config`, runs it through `parseFunnelConfig`, returns typed config.

Result: the per-request cost on a returning user is one indexed PK read (the assignment) plus a cache hit for the config. Optional later optimization: cache the resolved `version_id` in a cookie to remove the assignment read from the hot path; the assignment table remains the durable source of truth.

### `getAssignedVersionId(userId, funnelId): versionId`

A read-only helper that returns the user's already-pinned `version_id` from `funnel_assignments`. Used by the `buy` event path, which runs as a client-invoked server action and has no `versionId` from render. By the time a user reaches the paywall the assignment exists, so this is a pure PK read.

### Affected public pages

- `app/(public)/[funnelId]/page.tsx` — redirect entry; add a funnel-exists check (else `notFound()`).
- `app/(public)/[funnelId]/[screenIndex]/page.tsx` — replace `funnelsConfig[funnelId]` with `getFunnelForUser`; pass the resolved `versionId` into tracking.
- `app/(public)/[funnelId]/paywall/page.tsx` — same.
- `app/lib/tracking.ts` (`recordEvent`) — gains a `funnelVersionId` param written to `events.funnel_version_id`.
- `app/actions/tracking.ts` (`recordBuyEvent`) — resolves the version via `getAssignedVersionId` before calling `recordEvent`.

---

## Write path (seed now; publish prepared for Phase B)

New module `app/lib/funnels/publish.ts`:

### `publishVersion(funnelId): versionId`

Created in Phase A (used by the seed; consumed by Phase B's Publish button):

1. Read `funnels.draft_config`, validate with `funnelConfigSchema` (block on invalid).
2. Compute `version = max(version)+1` for the funnel (start at 1).
3. Insert a `funnel_versions` row with the snapshot.
4. Update `funnels.current_version_id` to the new version.

Old assignments are untouched — existing users stay pinned to their version.

---

## Migration & seed

- **Migration** (`supabase/migrations/<ts>_create_funnel_config.sql` + matching rollback): creates the three tables, adds `events.funnel_version_id`, and indexes. Follows the existing migration/rollback convention.
- **Seed** (`scripts/seed-funnels.ts`, idempotent): reads the current `funnelsConfig`, generates a stable `id` for each screen, and for each funnel upserts the `funnels` row (`draft_config` = seeded config), then creates `funnel_versions` v1 with the same config and sets `current_version_id`. Re-runnable safely (upserts; skips funnels that already have a v1). Keeping the seed in TS avoids duplicating the config as JSON in SQL and keeps `funnels.ts` as the single seed source.

After seeding, `quiz-1` / `quiz-2` are live with content identical to today.

---

## Error handling & resilience

- **Validation failure on read** (corrupt JSONB) → log and `notFound()`; the funnel is treated as misconfigured. With seeded data this cannot happen; Phase B's publish-time validation prevents bad versions.
- **Unknown funnel / no published version** → `notFound()`.
- **DB unavailable** → the error propagates to Next's error boundary, same failure mode as any DB-backed page. Cached immutable version configs continue to serve within the cache lifetime. A static last-resort fallback to the seeded `funnelsConfig` is noted as possible future hardening but is **out of scope** for Phase A.

---

## Testing

- **Unit (vitest), mocking Supabase as in `__tests__/tracking.test.ts`:**
  - `parseFunnelConfig`: accepts each valid variant; rejects malformed/unknown-type configs with a clear error.
  - `getFunnelForUser`: first visit creates user + assignment and pins `current_version_id`; returning visit reuses the existing pin even when `current_version_id` has moved on; unknown funnel → notFound.
  - `publishVersion`: increments version, snapshots draft, repoints `current_version_id`; blocks on invalid draft.
- **Regression (existing Playwright `e2e/funnel.spec.ts`):** must pass unchanged — this is the "behavior identical" guarantee.
- **Tracking:** extend `recordEvent` tests to assert `funnel_version_id` is written.

---

## Rollout

Phase A is a straight data-layer cutover with no user-visible change, so no feature flag is required; the seed makes the DB-backed funnels match the static ones exactly before the public pages switch to reading from the DB. The regression e2e is the gate.

## Open follow-ups (later phases)

- Phase B: the visual editor (`(private)/funnels/*`), draft editing, Publish button (calls `publishVersion`), live preview.
- Version-segmented analytics in the dashboard.
- Optional: cookie-cached `version_id`; static read fallback for resilience.
